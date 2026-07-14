import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import config from '@/lib/config/env'
import { checkPromptInjection } from '@/lib/security/prompt-injection-guard'

const SIGNATURE_PREFIX = 'sha256='

export function verifyGitHubSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature?.startsWith(SIGNATURE_PREFIX)) return false

  const expected = `${SIGNATURE_PREFIX}${crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')}`

  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

function sanitizePrText(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  const check = checkPromptInjection(text)
  if (!check.suspicious) return text

  return `[Prompt-injection content removed by guardrails. Severity: ${check.severity}.]`
}

export async function POST(req: Request) {
  try {
    const event = req.headers.get('x-github-event')
    const signature = req.headers.get('x-hub-signature-256')
    if (!event) return NextResponse.json({ error: 'Missing X-GitHub-Event' }, { status: 400 })
    if (!signature) return NextResponse.json({ error: 'Missing X-Hub-Signature-256' }, { status: 401 })

    const rawBody = await req.text()
    if (!verifyGitHubSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    if (event !== 'pull_request') {
      return NextResponse.json({ success: true, message: `Ignored ${event} event` })
    }

    const payload = JSON.parse(rawBody)

    // Only process PR closed & merged events
    if (payload.action === 'closed' && payload.pull_request?.merged) {
      const pr = payload.pull_request
      const prTitle = sanitizePrText(pr.title)
      const prBody = sanitizePrText(pr.body)
      const repoName = payload.repository?.full_name || 'the repository'

      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      if (!config.GROQ_API_KEY) return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 503 })

      const groq = createGroq({ apiKey: config.GROQ_API_KEY })
      
      const linkedinPrompt = `
        A developer just merged a Pull Request in their repository (${repoName}).
        PR Title: ${prTitle}
        PR Body: ${prBody}
        Project Goal: ${project.goal}

        Generate a viral, engaging LinkedIn post celebrating this shipped feature. Keep it professional but exciting. Focus on the value delivered. Do not use hashtags or emojis excessively.
      `

      const { text: linkedinPost } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        prompt: linkedinPrompt
      })

      const resumePrompt = `
        Based on this merged PR (${prTitle}: ${prBody}) for the project (${project.goal}), 
        write a single, powerful resume bullet point starting with a strong action verb (e.g., Architected, Engineered, Implemented). Focus on metrics or value if implied.
      `
      
      const { text: resumeBullet } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        prompt: resumePrompt
      })

      // Update the proof pack in the database
      await prisma.proofPack.upsert({
        where: { projectId },
        update: {
          linkedinPost: linkedinPost.trim(),
          resumeBullet: resumeBullet.replace(/^[-*•]\s*/, '').trim(),
          proofScore: 100 // Boost score for successfully shipping code!
        },
        create: {
          projectId,
          linkedinPost: linkedinPost.trim(),
          resumeBullet: resumeBullet.replace(/^[-*•]\s*/, '').trim(),
          proofScore: 100
        }
      })

      return NextResponse.json({ success: true, message: 'Proof Pack updated via Webhook' })
    }

    return NextResponse.json({ success: true, message: 'Ignored non-merge event' })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
