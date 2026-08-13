import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { dockerSandboxArgs, validateSandboxRelativePath } from '@/lib/quality/sandbox'

describe('quality sandbox policy', () => {
  it('rejects traversal, absolute paths, empty segments, and Git metadata', () => {
    for (const value of ['../secret', '/etc/passwd', 'src//file.ts', '.git/config', 'C:\\secret']) {
      expect(() => validateSandboxRelativePath(value)).toThrow()
    }
    expect(validateSandboxRelativePath('src/lib/file.ts')).toBe('src/lib/file.ts')
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
