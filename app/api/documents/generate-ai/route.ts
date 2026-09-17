import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGeminiApiKey, callGeminiAPI } from '@/lib/aiReportGenerator'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const isManager = ['master', 'superadmin', 'admin'].includes(user.role)
    if (!isManager) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { prompt, category, target_lob, title } = body

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt or instructions are required' }, { status: 400 })
    }

    const apiKey = getGeminiApiKey()

    if (!apiKey) {
      // Fallback: Generate structured legal-grade template
      const fallback = generateTemplateContent(category, title || 'Operational Directive', target_lob)
      return NextResponse.json({ content: fallback, fromFallback: true })
    }

    const systemPrompt = `You are the Senior Legal Operations Director and General Counsel for Andes Workforce, LLC executing operations for Tabak Law, LLC.
Your role is to draft an official, highly articulate, legally sound, and professional operational communication, policy memo, or standard operating procedure (SOP).
The document will be issued to independent contractors working on the Tabak Law, LLC legal intake account.

Guiding Principles:
1. Tone: Authoritative, fair, clear, and professional.
2. Structure in Markdown:
   - ### 1. Background & Purpose
   - ### 2. Operational Guidelines & Policy Directives (use bolding and clear bullet points)
   - ### 3. Quality Standards & Compliance Requirements
   - ### 4. Enforcement & Contractor Expectations
3. Entities:
   - Issuing Agency: Andes Workforce, LLC
   - Client Law Firm: Tabak Law, LLC
   - Specialists are independent contractors of Andes Workforce, LLC assigned to Tabak Law, LLC.
4. Do NOT include a signature box at the bottom, as the platform automatically renders a verified digital signature certificate block below your text.
5. Write directly in clean Markdown.`

    const userPrompt = `Draft a formal ${category || 'Operational Policy'} communication.
DOCUMENT TITLE: ${title || 'Operational Directive'}
TARGET DIVISION: ${target_lob ? target_lob + ' Intake Team' : 'All Intake Personnel'}
ADMINISTRATOR INSTRUCTIONS:
"${prompt}"

Write the complete document body in Markdown now.`

    const content = await callGeminiAPI(systemPrompt, userPrompt, apiKey)
    return NextResponse.json({ content, fromFallback: false })
  } catch (err: any) {
    console.error('[POST /api/documents/generate-ai error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function generateTemplateContent(category: string, title: string, lob?: string): string {
  const target = lob ? `${lob} Intake` : 'Legal Intake'
  return `### 1. Purpose & Operational Scope
This operational directive establishes mandatory standards and expectations for all independent contractors providing services to **Tabak Law, LLC** through **Andes Workforce, LLC** across the ${target} division.

### 2. Core Policy Guidelines
- **Queue Readiness & Adherence:** Contractors are expected to maintain prompt schedule adherence, active call availability, and immediate responsiveness during assigned operational hours.
- **Data Integrity & Documentation:** All lead interactions, call notes, and status transitions must be recorded contemporaneously within Law Ruler and the Tabak Operations Dashboard without delay.
- **Workflow Compliance:** Follow-up milestones, retainer delivery, and client communications must strictly adhere to firm protocols to safeguard client interests.

### 3. Quality Standards & Verification
- Intake evaluations will be reviewed on a regular basis by Team Leadership and the Quality Assurance (QA) Department.
- Consistency, professionalism, and strict adherence to client qualification guidelines are essential benchmarks of operational excellence.

### 4. Contractor Acknowledgement & Compliance
Compliance with this policy is mandatory. Failure to adhere to these operational standards may result in formal performance reviews, reassignment, or termination of contractual engagement.`
}
