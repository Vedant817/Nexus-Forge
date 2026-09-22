import { NextResponse } from 'next/server'

export async function readBoundedJson(request: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: 'Request body too large.' }, { status: 413 }) }
  }
  if (!request.body) {
    try {
      return { ok: true, value: await request.json() }
    } catch {
      return { ok: false, response: NextResponse.json({ error: 'Request must be valid JSON.' }, { status: 400 }) }
    }
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel('Request body exceeded limit.')
        return { ok: false, response: NextResponse.json({ error: 'Request body too large.' }, { status: 413 }) }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length).toString('utf8')
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Request must be valid JSON.' }, { status: 400 }) }
  }
}
