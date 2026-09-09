import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import {
  gatherReportMetrics,
  buildReportPrompt,
  callGeminiAPI,
  convertMarkdownToOutlookHtml,
  getGeminiApiKey,
  ReportGenerationParams,
} from '@/lib/aiReportGenerator'

function isAuthorized(session: any): boolean {
  if (!session?.user) return false
  const role = (session.user as any)?.role || 'regular'
  if (role === 'master' || role === 'superadmin' || role === 'admin') return true
  return false
}

// POST /api/reports/ai-summary — Generates an AI Executive Report
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorized(session)) {
      return NextResponse.json({ error: 'Unauthorized: Administrator access required' }, { status: 403 })
    }

    const body = await req.json()
    const {
      from,
      to,
      lob = 'ALL',
      reportStyle = 'executive',
      customNotes = '',
      apiKeyOverride = '',
      saveToHistory = true,
      titleOverride,
    } = body

    if (!from || !to) {
      return NextResponse.json({ error: 'Start date (from) and end date (to) are required.' }, { status: 400 })
    }

    // 1. Resolve Gemini API Key
    const apiKey = getGeminiApiKey(apiKeyOverride)
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'MISSING_API_KEY',
          message: 'No Google Gemini API key found. Please enter your API key or configure it in Settings.',
        },
        { status: 400 }
      )
    }

    // If user provided a new key in modal and asked to save it to settings:
    if (apiKeyOverride && body.saveKeyToSettings) {
      try {
        const db = getDb()
        db.prepare(`
          INSERT INTO settings (key, value, updated_at) VALUES ('gemini_api_key', ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(apiKeyOverride.trim())
      } catch (err: any) {
        console.warn('[ai-summary] Failed to persist gemini_api_key:', err.message)
      }
    }

    // 2. Gather verified operational metrics
    const metrics = gatherReportMetrics({ from, to, lob })

    // 3. Build structured prompt
    const { systemPrompt, userPrompt } = buildReportPrompt(metrics, {
      from,
      to,
      lob,
      reportStyle,
      customNotes,
    })

    // 4. Call Gemini AI
    const markdown = await callGeminiAPI(systemPrompt, userPrompt, apiKey)

    // 5. Generate formatted Outlook-ready HTML
    const reportTitle = titleOverride || (
      reportStyle === 'executive' ? 'Executive Operations Briefing' :
      reportStyle === 'bottlenecks' ? 'Operational Bottlenecks & Risk Analysis' :
      reportStyle === 'coaching' ? 'Specialist Performance & Coaching Review' :
      'Comprehensive Monthly Operations Review'
    )

    const lobLabel = lob === 'ALL' ? 'Unified Firm-Wide (VA + SSD + Apps)' : `${lob} Division`
    const outlookHtml = convertMarkdownToOutlookHtml(markdown, {
      title: reportTitle,
      lob: lobLabel,
      dateRange: `${from} to ${to}`,
    })

    // 6. Save to history if requested
    let savedId: number | null = null
    if (saveToHistory) {
      try {
        const db = getDb()
        const user = session.user as any
        const result = db.prepare(`
          INSERT INTO saved_ai_reports (
            title, report_type, lob, date_from, date_to, custom_prompt,
            content_markdown, content_html, generated_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          reportTitle,
          reportStyle,
          lob,
          from,
          to,
          customNotes || null,
          markdown,
          outlookHtml,
          user?.name || user?.email || 'Admin'
        )
        savedId = Number(result.lastInsertRowid)
      } catch (err: any) {
        console.warn('[ai-summary] Failed to save report to history:', err.message)
      }
    }

    return NextResponse.json({
      success: true,
      title: reportTitle,
      markdown,
      html: outlookHtml,
      metrics,
      savedId,
    })
  } catch (err: any) {
    console.error('[ai-summary] Error generating report:', err)
    return NextResponse.json({ error: err.message || 'Failed to generate report' }, { status: 500 })
  }
}

// GET /api/reports/ai-summary — Lists previously saved reports
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorized(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const db = getDb()
    const rows = db.prepare(`
      SELECT id, title, report_type, lob, date_from, date_to, custom_prompt,
             content_markdown, content_html, generated_by, created_at
      FROM saved_ai_reports
      ORDER BY created_at DESC
      LIMIT 50
    `).all()

    return NextResponse.json({ reports: rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/reports/ai-summary?id=123 — Deletes a saved report
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorized(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 })
    }

    const db = getDb()
    db.prepare('DELETE FROM saved_ai_reports WHERE id = ?').run(id)

    return NextResponse.json({ success: true, message: 'Report deleted successfully' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
