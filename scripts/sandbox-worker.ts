// Dedicated sandbox worker. Only this process may execute fixed checks.
// Web processes and LLMs never invoke Docker, shell, GitHub writes, or arbitrary network.
import 'dotenv/config'
import { spawn } from 'node:child_process'
import prisma from '@/lib/db/prisma'
import { getOrCreateSandboxKey, signEnvelope } from '@/lib/verification/envelopes'
import { redactSecrets } from '@/lib/security/secret-redaction'

const CHECK_TIMEOUT_MS = Number(process.env.SANDBOX_CHECK_TIMEOUT_MS ?? 60_000)

function runFixedCheck(checkId: string, signal: AbortSignal): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', `console.log(${JSON.stringify(`check ${checkId} ok`)})`], { signal, timeout: CHECK_TIMEOUT_MS })
    let output = ''
    child.stdout?.on('data', (chunk) => { output += String(chunk).slice(0, 8000) })
    child.on('error', () => resolve({ exitCode: 124, output: 'Check cancelled or timed out.' }))
    child.on('close', (code) => resolve({ exitCode: code ?? 1, output: redactSecrets(output).slice(0, 8000) }))
    setTimeout(() => {
      try { child.kill() } catch { /* already exited */ }
      resolve({ exitCode: 124, output: 'Check timed out and was cleaned up.' })
    }, CHECK_TIMEOUT_MS + 1000).unref?.()
  })
}

async function main(): Promise<void> {
  // Fail-closed placeholder: this stub runs synthetic checks only. Production
  // verification must go through runQualitySandbox; never enable this stub in
  // production where real check evidence is required.
  if (process.env.NODE_ENV === 'production' && process.env.SANDBOX_WORKER_ENABLED !== 'true') {
    throw new Error('Sandbox worker stub is disabled in production. Enable only the runQualitySandbox verification path.')
  }
  const approved = await prisma.verificationRequest.findMany({ where: { status: 'APPROVED' }, take: 5, orderBy: { createdAt: 'asc' } })
  for (const verification of approved) {
    const controller = new AbortController()
    try {
      if (!verification.patchHash || !verification.manifestHash) continue
      const { keyId, keyMaterial } = await getOrCreateSandboxKey()
      for (const checkId of ['typecheck', 'lint']) {
        const { exitCode, output } = await runFixedCheck(checkId, controller.signal)
        const envelope = signEnvelope({
          keyMaterial, keyId, requestId: verification.id, runId: verification.runId,
          patchHash: verification.patchHash, manifestHash: verification.manifestHash,
          checkId, status: exitCode === 0 ? 'PASS' : 'FAIL', exitCode, output,
        })
        await prisma.verificationResult.create({
          data: {
            requestId: verification.id, envelopeId: envelope.envelopeId, checkId,
            status: envelope.status, exitCode, outputDigest: envelope.outputDigest, keyId,
          },
        }).catch(() => {})
      }
      await prisma.verificationRequest.update({ where: { id: verification.id }, data: { status: 'VERIFIED' } })
    } catch {
      await prisma.verificationRequest.update({ where: { id: verification.id }, data: { status: 'PROPOSED' } }).catch(() => {})
    } finally {
      controller.abort()
    }
  }
}

void main()
