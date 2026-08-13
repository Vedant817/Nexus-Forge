import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { runQualitySandbox } from '../src/lib/quality/sandbox'

const inputSchema = z.object({
  edits: z.array(z.object({ filePath: z.string(), oldString: z.string(), newString: z.string() })),
  commands: z.array(z.enum(['test', 'typecheck', 'lint', 'build'])).default(['typecheck', 'lint', 'test']),
}).strict()

async function main() {
  const inputPath = process.argv[2]
  const outputPath = process.argv[3] ?? 'quality-review.patch'
  if (!inputPath) throw new Error('Usage: npm run quality:sandbox -- edits.json [output.patch]')
  const input = inputSchema.parse(JSON.parse(await readFile(inputPath, 'utf8')))
  const result = await runQualitySandbox(input)
  await writeFile(outputPath, result.patch, 'utf8')
  process.stdout.write(`${JSON.stringify({ statuses: result.statuses, patchPath: outputPath, reviewRequired: true }, null, 2)}\n`)
  if (result.statuses.some((status) => status.status !== 'PASS')) process.exitCode = 1
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : 'Sandbox failed'); process.exitCode = 1 })
