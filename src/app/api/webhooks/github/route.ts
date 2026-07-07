import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    const payload = await req.json()

    // Only process PR closed & merged events
    if (payload.action === 'closed' && payload.pull_request?.merged) {
      const pr = payload.pull_request
      const prTitle = pr.title
      const prBody = pr.body || ''
      const repoName = payload.repository?.full_name || 'the repository'

      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

      const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })
      
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
