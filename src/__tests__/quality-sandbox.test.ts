import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { dockerSandboxArgs, resolveSandboxEditTarget, validateSandboxRelativePath } from '@/lib/quality/sandbox'

describe('quality sandbox policy', () => {
  it('rejects traversal, absolute paths, empty segments, and Git metadata', () => {
    for (const value of ['../secret', '/etc/passwd', 'src//file.ts', '.git/config', 'C:\\secret']) {
      expect(() => validateSandboxRelativePath(value)).toThrow()
    }
    expect(validateSandboxRelativePath('src/lib/file.ts')).toBe('src/lib/file.ts')
  })

  it('rejects symlinks in every edit path component', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nexus-forge-symlink-test-'))
    const outside = await mkdtemp(path.join(tmpdir(), 'nexus-forge-symlink-outside-'))
    try {
      await writeFile(path.join(root, 'regular.txt'), 'safe')
      await writeFile(path.join(outside, 'secret.txt'), 'outside')
      await symlink(path.join(outside, 'secret.txt'), path.join(root, 'file-link'))
      await symlink(outside, path.join(root, 'dir-link'), 'junction')
      await mkdir(path.join(root, 'nested'))

      await expect(resolveSandboxEditTarget(root, 'regular.txt')).resolves.toBe(path.join(root, 'regular.txt'))
      await expect(resolveSandboxEditTarget(root, 'file-link')).rejects.toThrow('symbolic links')
      await expect(resolveSandboxEditTarget(root, 'dir-link/secret.txt')).rejects.toThrow('symbolic links')
      await expect(resolveSandboxEditTarget(root, 'nested')).rejects.toThrow('regular file')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('constructs a networkless resource-limited non-root container command', () => {
    process.env.QUALITY_SANDBOX_IMAGE = 'node:22-bookworm-slim@sha256:' + 'a'.repeat(64)
    const args = dockerSandboxArgs({ worktree: '/tmp/worktree', nodeModules: '/repo/node_modules', command: ['npm', 'test'] })
    expect(args).toEqual(expect.arrayContaining(['--network=none', '--read-only', '--cap-drop=ALL', '--pids-limit=256', '--memory=2g', '--cpus=2', '--user=65534:65534']))
    expect(args).toContain('--mount')
    expect(args).toContain('type=bind,src=/tmp/worktree,dst=/workspace')
    expect(args).toContain('type=bind,src=/repo/node_modules,dst=/workspace/node_modules,readonly=true')
    expect(args.join(' ')).not.toContain('GROQ_API_KEY')
    expect(args.slice(-2)).toEqual(['npm', 'test'])
  })
})
