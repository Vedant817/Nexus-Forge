import 'server-only'

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { FileEdit } from '@/lib/agents/quality-agent-schemas'

const ALLOWED_COMMANDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  test: ['npm', 'test', '--', '--run'],
  typecheck: ['npm', 'run', 'typecheck'],
  lint: ['npm', 'run', 'lint'],
  build: ['npm', 'run', 'build'],
})

export type SandboxResult = {
  statuses: Array<{ command: string; status: 'PASS' | 'FAIL' | 'UNKNOWN'; exitCode: number | null; output: string }>
  patch: string
  reviewRequired: true
}

function image(): string {
  const configured = process.env.QUALITY_SANDBOX_IMAGE
  if (!configured || !configured.includes('@sha256:')) throw new Error('QUALITY_SANDBOX_IMAGE must be pinned by sha256 digest.')
  return configured
}

export function validateSandboxRelativePath(value: string): string {
  if (!value || value.includes('\0') || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) throw new Error('Sandbox edit path must be relative.')
  const normalized = value.replace(/\\/g, '/')
  if (normalized.split('/').some((part) => part === '..' || part === '')) throw new Error('Sandbox edit path is unsafe.')
  if (normalized === '.git' || normalized.startsWith('.git/')) throw new Error('Sandbox edits cannot modify Git metadata.')
  return normalized
}

export function dockerSandboxArgs(input: { worktree: string; nodeModules: string; command: readonly string[] }): string[] {
  return [
    'run', '--rm', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=256', '--memory=2g', '--cpus=2', '--user=65534:65534', '--tmpfs=/tmp:rw,noexec,nosuid,size=256m',
    '--mount', `type=bind,src=${input.worktree},dst=/workspace`,
    '--mount', `type=bind,src=${input.nodeModules},dst=/workspace/node_modules,readonly=true`,
    '--workdir=/workspace', image(), ...input.command,
  ]
}

async function run(program: string, args: readonly string[], options: { cwd?: string; timeoutMs: number }): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, [...args], {
      cwd: options.cwd, shell: false, windowsHide: true,
      env: {
        NODE_ENV: 'production', PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '',
        TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk: Buffer) => { if (output.length < 100_000) output += chunk.toString('utf8').slice(0, 100_000 - output.length) }
    child.stdout.on('data', append); child.stderr.on('data', append)
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
    child.once('error', reject)
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, output }) })
  })
}

async function applyEdits(root: string, edits: readonly FileEdit[]): Promise<void> {
  if (edits.length > 100) throw new Error('Sandbox edit count exceeds 100.')
  for (const edit of edits) {
    const relative = validateSandboxRelativePath(edit.filePath)
    if (edit.oldString.length > 200_000 || edit.newString.length > 200_000) throw new Error('Sandbox edit exceeds text bounds.')
    const target = path.join(root, ...relative.split('/'))
    const content = await readFile(target, 'utf8')
    const first = content.indexOf(edit.oldString)
    if (first < 0 || content.indexOf(edit.oldString, first + 1) >= 0) throw new Error(`Edit target must match exactly once: ${relative}`)
    await writeFile(target, `${content.slice(0, first)}${edit.newString}${content.slice(first + edit.oldString.length)}`, 'utf8')
  }
}

export async function runQualitySandbox(input: { edits: readonly FileEdit[]; commands: readonly string[] }): Promise<SandboxResult> {
  const unknown = input.commands.filter((command) => !ALLOWED_COMMANDS[command])
  if (unknown.length) throw new Error('Sandbox command is not allowlisted.')
  const repository = process.cwd()
  const base = await mkdtemp(path.join(tmpdir(), 'nexus-forge-quality-'))
  const worktree = path.join(base, 'worktree')
  try {
    const add = await run('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: repository, timeoutMs: 30_000 })
    if (add.code !== 0) throw new Error('Unable to create disposable worktree.')
    await applyEdits(worktree, input.edits)
    const statuses: SandboxResult['statuses'] = []
    for (const name of input.commands) {
      const result = await run('docker', dockerSandboxArgs({ worktree, nodeModules: path.join(repository, 'node_modules'), command: ALLOWED_COMMANDS[name] }), { timeoutMs: 10 * 60_000 })
      statuses.push({ command: name, status: result.code === 0 ? 'PASS' : 'FAIL', exitCode: result.code, output: result.output })
    }
    const diff = await run('git', ['diff', '--binary', '--no-ext-diff'], { cwd: worktree, timeoutMs: 30_000 })
    return { statuses, patch: diff.output, reviewRequired: true }
  } finally {
    await run('git', ['worktree', 'remove', '--force', worktree], { cwd: repository, timeoutMs: 30_000 }).catch(() => undefined)
    await rm(base, { recursive: true, force: true })
  }
}
