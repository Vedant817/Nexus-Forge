import ts from 'typescript'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'

export const DEPENDENCY_MAP_SCHEMA_VERSION = 1
export const DEPENDENCY_EXTRACTOR_VERSION = 'typescript-syntax-v1'
const MAX_FILES = 5_000, MAX_FILE_BYTES = 1_048_576, MAX_TOTAL_BYTES = 25 * 1_048_576, MAX_EDGES = 20_000, MAX_IMPORTS_PER_FILE = 1_000

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() })
export const dependencyMapSchema = z.object({
  schemaVersion: z.literal(DEPENDENCY_MAP_SCHEMA_VERSION), extractorVersion: z.string(),
  snapshot: z.object({ repositoryFullName: z.string(), commitSha: z.string().regex(/^[0-9a-f]{40}$/), complete: z.boolean() }),
  complete: z.boolean(),
  coverage: z.object({ discovered: z.number().int(), parsed: z.number().int(), skipped: z.number().int(), unsupported: z.number().int(), bytesParsed: z.number().int() }),
  diagnostics: z.array(z.object({ code: z.string(), path: z.string().optional(), detail: z.string() })),
  nodes: z.array(z.object({ id: z.string(), kind: z.enum(['file', 'external', 'unresolved']), label: z.string(), path: z.string().optional(), position: positionSchema, evidenceId: z.string().optional() })),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), kind: z.enum(['import', 'export', 'dynamic-import', 'require', 'import-equals']), specifier: z.string(), typeOnly: z.boolean(), line: z.number().int().positive(), column: z.number().int().positive(), evidenceId: z.string() })),
}).strict()
export type DependencyMap = z.infer<typeof dependencyMapSchema>
export type DependencyInputFile = { path: string; content: string; contentHash: string }

type RawEdge = Omit<DependencyMap['edges'][number], 'id' | 'source' | 'target' | 'evidenceId'> & { importer: string }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const normalize = (value: string) => path.posix.normalize(value.replace(/\\/g, '/')).replace(/^\.\//, '')

export function buildDependencyMap(input: { repositoryFullName: string; commitSha: string; snapshotComplete: boolean; files: DependencyInputFile[] }): DependencyMap {
  const diagnostics: DependencyMap['diagnostics'] = []
  const accepted = input.files.map((file) => ({ ...file, path: normalize(file.path) })).sort((a, b) => compare(a.path, b.path)).slice(0, MAX_FILES)
  let complete = input.snapshotComplete && input.files.length <= MAX_FILES
  if (input.files.length > MAX_FILES) diagnostics.push({ code: 'FILE_BOUND', detail: `Only ${MAX_FILES} source files were parsed.` })
  const index = new Map(accepted.map((file) => [file.path, file]))
  const rawEdges: RawEdge[] = []
  let bytesParsed = 0, parsed = 0, skipped = 0
  const unsupported = 0
  for (const file of accepted) {
    const bytes = Buffer.byteLength(file.content)
    if (bytes > MAX_FILE_BYTES || bytesParsed + bytes > MAX_TOTAL_BYTES) { complete = false; skipped++; diagnostics.push({ code: 'BYTE_BOUND', path: file.path, detail: 'File skipped by parser byte bounds.' }); continue }
    bytesParsed += bytes; parsed++
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, scriptKind(file.path))
    let imports = 0
    const add = (node: ts.Node, specifier: string, kind: RawEdge['kind'], typeOnly = false) => {
      if (imports++ >= MAX_IMPORTS_PER_FILE || rawEdges.length >= MAX_EDGES) { complete = false; return }
      const point = source.getLineAndCharacterOfPosition(node.getStart(source))
      rawEdges.push({ importer: file.path, specifier, kind, typeOnly, line: point.line + 1, column: point.character + 1 })
    }
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) add(node, node.moduleSpecifier.text, 'import', Boolean(node.importClause?.isTypeOnly))
      else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node, node.moduleSpecifier.text, 'export', node.isTypeOnly)
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) add(node, node.moduleReference.expression.text, 'import-equals', node.isTypeOnly)
      else if (ts.isCallExpression(node) && node.arguments.length === 1) {
        const argument = node.arguments[0]
        const literal = ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument) ? argument.text : null
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          if (literal) add(node, literal, 'dynamic-import')
          else { complete = false; diagnostics.push({ code: 'DYNAMIC_SPECIFIER', path: file.path, detail: 'Computed dynamic import could not be resolved.' }) }
        } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          if (literal) add(node, literal, 'require')
          else { complete = false; diagnostics.push({ code: 'DYNAMIC_SPECIFIER', path: file.path, detail: 'Computed require could not be resolved.' }) }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    const parseDiagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
    if (parseDiagnostics.length) { complete = false; diagnostics.push({ code: 'PARSE_DIAGNOSTIC', path: file.path, detail: 'TypeScript parser reported malformed syntax.' }) }
  }
  if (rawEdges.length >= MAX_EDGES) diagnostics.push({ code: 'EDGE_BOUND', detail: `Dependency edges were bounded at ${MAX_EDGES}.` })

  const nodeMap = new Map<string, Omit<DependencyMap['nodes'][number], 'position'>>()
  for (const file of accepted) nodeMap.set(`file:${file.path}`, { id: `file:${file.path}`, kind: 'file', label: file.path, path: file.path, evidenceId: `repository:file:${file.path}` })
  const edges = rawEdges.map((edge) => {
    const sourceId = `file:${edge.importer}`
    const resolved = resolveSpecifier(edge.importer, edge.specifier, index)
    let target: string
    if (resolved) target = `file:${resolved}`
    else if (edge.specifier.startsWith('.') || edge.specifier.startsWith('/')) {
      target = `unresolved:${sha(`${edge.importer}\0${edge.specifier}`)}`
      nodeMap.set(target, { id: target, kind: 'unresolved', label: edge.specifier })
      complete = false
    } else {
      const packageName = externalPackage(edge.specifier)
      target = `external:${packageName}`
      nodeMap.set(target, { id: target, kind: 'external', label: packageName })
    }
    return { ...edge, source: sourceId, target, evidenceId: `repository:file:${edge.importer}`, id: sha(`${sourceId}\0${target}\0${edge.kind}\0${edge.specifier}\0${edge.line}\0${edge.column}`) }
  }).map((edge) => {
    const result = { ...edge } as Partial<typeof edge>
    delete result.importer
    return result as DependencyMap['edges'][number]
  }).sort((a, b) => compare(a.id, b.id))

  const ordered = [...nodeMap.values()].sort((a, b) => compare(a.id, b.id))
  const depths = layerNodes(ordered.map((node) => node.id), edges)
  const rankByLayer = new Map<number, number>()
  const nodes = ordered.map((node) => {
    const layer = node.kind === 'file' ? (depths.get(node.id) ?? 0) : Math.max(1, ...depths.values()) + 1
    const rank = rankByLayer.get(layer) ?? 0; rankByLayer.set(layer, rank + 1)
    return { ...node, position: { x: layer * 320, y: rank * 120 } }
  })
  return dependencyMapSchema.parse({
    schemaVersion: 1, extractorVersion: DEPENDENCY_EXTRACTOR_VERSION,
    snapshot: { repositoryFullName: input.repositoryFullName, commitSha: input.commitSha, complete: input.snapshotComplete },
    complete, coverage: { discovered: input.files.length, parsed, skipped, unsupported, bytesParsed }, diagnostics, nodes, edges,
  })
}

function scriptKind(file: string): ts.ScriptKind {
  const lower = file.toLowerCase()
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}
function resolveSpecifier(importer: string, specifier: string, index: Map<string, DependencyInputFile>): string | null {
  if (!specifier.startsWith('.')) return null
  const base = normalize(path.posix.join(path.posix.dirname(importer), specifier))
  const candidates = [base, ...['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.json'].map((ext) => `${base}${ext}`), ...['index.ts','index.tsx','index.js','index.jsx'].map((name) => `${base}/${name}`)]
  return candidates.find((candidate) => index.has(candidate)) ?? null
}
function externalPackage(specifier: string): string {
  if (specifier.startsWith('node:')) return `node:${specifier.slice(5).split('/')[0]}`
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : parts[0]
}
function layerNodes(ids: string[], edges: DependencyMap['edges']): Map<string, number> {
  const depth = new Map(ids.map((id) => [id, 0]))
  for (let iteration = 0; iteration < ids.length; iteration++) {
    let changed = false
    for (const edge of edges) {
      if (!depth.has(edge.source) || !depth.has(edge.target)) continue
      const next = Math.min(ids.length, (depth.get(edge.source) ?? 0) + 1)
      if (next > (depth.get(edge.target) ?? 0)) { depth.set(edge.target, next); changed = true }
    }
    if (!changed) break
  }
  return depth
}
