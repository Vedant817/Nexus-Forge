import { describe, expect, it } from 'vitest'
import { buildDependencyMap } from '@/lib/repository/dependency-map'

const commitSha = 'a'.repeat(40)
function build(files: Array<{ path: string; content: string }>) {
  return buildDependencyMap({
    repositoryFullName: 'owner/repo', commitSha, snapshotComplete: true,
    files: files.map((file) => ({ ...file, contentHash: `hash:${file.path}` })),
  })
}

describe('deterministic dependency map', () => {
  it('extracts imports, exports, literal dynamic imports, require, externals, and line evidence', () => {
    const map = build([
      { path: 'src/index.ts', content: `import type { T } from './types'\nexport * from './util'\nconst x = require('node:fs')\nimport('@scope/pkg/sub')` },
      { path: 'src/types.ts', content: 'export type T = string' },
      { path: 'src/util.ts', content: 'export const value = 1' },
    ])
    expect(map.edges.map((edge) => [edge.kind, edge.target, edge.typeOnly])).toEqual(expect.arrayContaining([
      ['import', 'file:src/types.ts', true], ['export', 'file:src/util.ts', false],
      ['require', 'external:node:fs', false], ['dynamic-import', 'external:@scope/pkg', false],
    ]))
    expect(map.edges.every((edge) => edge.evidenceId === 'repository:file:src/index.ts')).toBe(true)
    expect(map.complete).toBe(true)
  })

  it('is byte-deterministic across shuffled input and marks computed imports incomplete', () => {
    const files = [
      { path: 'b.ts', content: `import './a'` },
      { path: 'a.ts', content: `const target = './b'; import(target)` },
    ]
    expect(JSON.stringify(build(files))).toBe(JSON.stringify(build([...files].reverse())))
    expect(build(files)).toMatchObject({ complete: false })
    expect(build(files).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DYNAMIC_SPECIFIER' })]))
  })

  it('uses semantic stable IDs and finite deterministic positions', () => {
    const map = build([{ path: 'index.ts', content: `import './missing'` }])
    expect(map.nodes.map((node) => node.id)).toContain('file:index.ts')
    expect(map.nodes.some((node) => node.id.startsWith('unresolved:'))).toBe(true)
    expect(map.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true)
  })
})
