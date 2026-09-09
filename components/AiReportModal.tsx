'use client'

import { useState, useEffect } from 'react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { safeFetchJson } from '@/lib/apiClient'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentLob?: string
  initialFrom?: string
  initialTo?: string
}

interface SavedReport {
  id: number
  title: string
  report_type: string
  lob: string
  date_from: string
  date_to: string
  custom_prompt?: string
  content_markdown: string
  content_html: string
  generated_by: string
  created_at: string
}

const PRESETS = [
  { label: 'Last 7 days', getValue: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Last month', getValue: () => ({ from: format(startOfMonth(subDays(startOfMonth(new Date()), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subDays(startOfMonth(new Date()), 1)), 'yyyy-MM-dd') }) },
  { label: 'Yesterday', getValue: () => ({ from: format(subDays(new Date(), 1), 'yyyy-MM-dd'), to: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
  { label: 'Today', getValue: () => ({ from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
]

export default function AiReportModal({
  isOpen,
  onClose,
  currentLob = 'ALL',
  initialFrom,
  initialTo,
}: Props) {
  // Navigation tabs within modal: 'create' | 'history' | 'key_config'
  const [activeView, setActiveView] = useState<'create' | 'history' | 'key_config'>('create')

  // 1. Timeframe
  const [from, setFrom] = useState(initialFrom || format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(initialTo || format(new Date(), 'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This month')

  // 2. Division
  const [lob, setLob] = useState<'ALL' | 'VA' | 'SSD' | 'APPS'>(
    (currentLob as any) || 'ALL'
  )

  // 3. Report Style
  const [reportStyle, setReportStyle] = useState<'executive' | 'bottlenecks' | 'coaching' | 'monthly'>('executive')

  // 4. Custom Focus Notes
  const [customNotes, setCustomNotes] = useState('')

  // 5. Generation State & Results
  const [generating, setGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState('')
  const [error, setError] = useState('')
  const [reportTitle, setReportTitle] = useState('')
  const [generatedMarkdown, setGeneratedMarkdown] = useState('')
  const [generatedHtml, setGeneratedHtml] = useState('')
  const [analyzedMetrics, setAnalyzedMetrics] = useState<any>(null)
  const [previewTab, setPreviewTab] = useState<'rendered' | 'edit'>('rendered')

  // 6. Copy Feedback
  const [copyToast, setCopyToast] = useState('')

  // History State
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [viewingSavedReport, setViewingSavedReport] = useState<SavedReport | null>(null)

  // API Key State
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [keySource, setKeySource] = useState<string>('')
  const [keyPreview, setKeyPreview] = useState<string>('')
  const [savingKey, setSavingKey] = useState(false)
  const [keySuccess, setKeySuccess] = useState('')

  useEffect(() => {
    if (isOpen) {
      checkApiKeyStatus()
    }
  }, [isOpen])

  async function checkApiKeyStatus() {
    try {
      const res = await safeFetchJson('/api/settings')
      const hasKey = res.has_gemini_key === 'true' || res.has_env_gemini_key === 'true'
      setHasApiKey(hasKey)
      setKeyPreview(res.gemini_key_preview || (res.has_env_gemini_key ? 'Set in Environment' : ''))
      setKeySource(res.gemini_key_source || (res.has_gemini_key === 'true' ? 'Database' : 'Environment'))
    } catch {
      setHasApiKey(false)
    }
  }

  async function handleSaveApiKey(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    setError('')
    try {
      await safeFetchJson('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: apiKeyInput.trim() }),
      })
      setKeySuccess('Google Gemini API Key saved successfully!')
      setApiKeyInput('')
      await checkApiKeyStatus()
      setTimeout(() => {
        setKeySuccess('')
        setActiveView('create')
      }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingKey(false)
    }
  }

  // Fetch History
  async function fetchReportHistory() {
    setLoadingHistory(true)
    try {
      const res = await safeFetchJson('/api/reports/ai-summary')
      setSavedReports(res.reports || [])
    } catch (err: any) {
      console.warn('Failed to load report history:', err.message)
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleDeleteSavedReport(id: number) {
    if (!confirm('Are you sure you want to delete this saved report?')) return
    try {
      await safeFetchJson(`/api/reports/ai-summary?id=${id}`, { method: 'DELETE' })
      setSavedReports(prev => prev.filter(r => r.id !== id))
      if (viewingSavedReport?.id === id) {
        setViewingSavedReport(null)
      }
    } catch (err: any) {
      alert(`Error deleting report: ${err.message}`)
    }
  }

  // Generate Report
  async function handleGenerateReport() {
    setError('')
    setGenerating(true)
    setGenerationStep('Gathering verified database figures...')

    try {
      const timer1 = setTimeout(() => setGenerationStep('Analyzing specialist rankings & refusal patterns...'), 1200)
      const timer2 = setTimeout(() => setGenerationStep('Synthesizing executive briefing with Google Gemini...'), 2600)

      const payload = {
        from,
        to,
        lob,
        reportStyle,
        customNotes: customNotes.trim(),
        saveToHistory: true,
      }

      const res = await safeFetchJson('/api/reports/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      clearTimeout(timer1)
      clearTimeout(timer2)

      if (res.error === 'MISSING_API_KEY') {
        setActiveView('key_config')
        setError('Please configure your Google Gemini API Key below before generating reports.')
        setGenerating(false)
        return
      }

      setReportTitle(res.title)
      setGeneratedMarkdown(res.markdown)
      setGeneratedHtml(res.html)
      setAnalyzedMetrics(res.metrics)
      setPreviewTab('rendered')
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating the report.')
    } finally {
      setGenerating(false)
      setGenerationStep('')
    }
  }

  // 6. Copy for Outlook
  async function handleCopyOutlook(htmlToCopy?: string, markdownToCopy?: string) {
    const html = htmlToCopy || generatedHtml
    const text = markdownToCopy || generatedMarkdown
    if (!html) return

    try {
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([text], { type: 'text/plain' })
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      })
      await navigator.clipboard.write([item])
      showToast('📋 Executive Report copied for Outlook! Press Ctrl+V in Outlook to paste.')
    } catch {
      await navigator.clipboard.writeText(text)
      showToast('📋 Text copied to clipboard!')
    }
  }

  function showToast(msg: string) {
    setCopyToast(msg)
    setTimeout(() => setCopyToast(''), 4500)
  }

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(3, 7, 18, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 1080, maxHeight: '92vh', background: '#0a1628', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7)' }}>
        
        {/* Header Bar */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 0 15px rgba(59,130,246,0.4)' }}>
              🤖
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                AI Executive Report Studio
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Powered by Google Gemini · Detailed operations briefs for executive management
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 3 }}>
              <button
                onClick={() => setActiveView('create')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeView === 'create' ? 'var(--accent-primary)' : 'transparent',
                  color: activeView === 'create' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                ✍️ Generator
              </button>
              <button
                onClick={() => {
                  setActiveView('history')
                  fetchReportHistory()
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeView === 'history' ? 'var(--accent-primary)' : 'transparent',
                  color: activeView === 'history' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                📂 Archive
              </button>
              <button
                onClick={() => setActiveView('key_config')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeView === 'key_config' ? 'var(--accent-primary)' : 'transparent',
                  color: activeView === 'key_config' ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                ⚙️ API Key
              </button>
            </div>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20, padding: 4, marginLeft: 8 }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {copyToast && (
          <div style={{ background: 'rgba(16,185,129,0.2)', borderBottom: '1px solid rgba(16,185,129,0.4)', color: '#34d399', padding: '10px 20px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✅</span>
            <span>{copyToast}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '10px 20px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* VIEW 1: REPORT GENERATOR */}
          {activeView === 'create' && (
            <div style={{ display: 'grid', gridTemplateColumns: generatedMarkdown ? '360px 1fr' : '1fr', gap: 20 }}>
              
              {/* Left Column: Form Controls (6 items) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* 1. Timeframe */}
                <div className="glass-card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    1. Reporting Period
                  </label>
                  
                  {/* Presets */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                    {PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setActivePreset(p.label)
                          const vals = p.getValue()
                          setFrom(vals.from)
                          setTo(vals.to)
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: activePreset === p.label ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                          color: activePreset === p.label ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="date"
                      className="input-field"
                      style={{ fontSize: 12, padding: '6px 8px', margin: 0, width: '100%' }}
                      value={from}
                      onChange={(e) => { setFrom(e.target.value); setActivePreset('Custom') }}
                    />
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>to</span>
                    <input
                      type="date"
                      className="input-field"
                      style={{ fontSize: 12, padding: '6px 8px', margin: 0, width: '100%' }}
                      value={to}
                      onChange={(e) => { setTo(e.target.value); setActivePreset('Custom') }}
                    />
                  </div>
                </div>

                {/* 2. Division */}
                <div className="glass-card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    2. Division Scope
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      { id: 'ALL', label: '🌐 Unified Firm-Wide' },
                      { id: 'SSD', label: '💼 SSD Intake' },
                      { id: 'VA', label: '📑 VA Intake' },
                      { id: 'APPS', label: '📲 Apps Team' },
                    ].map(div => (
                      <button
                        key={div.id}
                        type="button"
                        onClick={() => setLob(div.id as any)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                          background: lob === div.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                          border: lob === div.id ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.06)',
                          color: lob === div.id ? '#60a5fa' : 'var(--text-primary)',
                        }}
                      >
                        {div.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Report Style */}
                <div className="glass-card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    3. Report Style & Focus
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { id: 'executive', icon: '📈', name: 'Executive Operations Briefing', desc: 'Top-line volume, milestones, conversion efficiency' },
                      { id: 'bottlenecks', icon: '⚠️', name: 'Bottlenecks & Lost Opportunities', desc: 'Rejection trends, client refusals, high CAPD' },
                      { id: 'coaching', icon: '🏆', name: 'Specialist Performance & Coaching', desc: 'Roster rankings, pacing, lagging rep turn-arounds' },
                      { id: 'monthly', icon: '📑', name: 'Comprehensive Monthly Review', desc: 'Full-spectrum monthly departmental audit' },
                    ].map(style => (
                      <div
                        key={style.id}
                        onClick={() => setReportStyle(style.id as any)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: reportStyle === style.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                          border: reportStyle === style.id ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.06)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: reportStyle === style.id ? '#a5b4fc' : '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{style.icon}</span>
                          <span>{style.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, paddingLeft: 22 }}>
                          {style.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Custom Focus Notes */}
                <div className="glass-card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      4. Custom Focus Notes (Optional)
                    </label>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Guides Gemini's analysis</span>
                  </div>
                  
                  <textarea
                    className="input-field"
                    rows={3}
                    placeholder="e.g. Highlight Karen and Omar's conversion surge, and note why rejection reasons rose on Wednesday..."
                    style={{ width: '100%', fontSize: 12, margin: 0, resize: 'vertical' }}
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                  />

                  {/* Quick Pill Prompts */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                    {[
                      'Focus on top converters',
                      'Analyze call pacing (CAPD)',
                      'Audit client refusal reasons',
                      'Keep concise for partners',
                    ].map(pill => (
                      <span
                        key={pill}
                        onClick={() => setCustomNotes(prev => prev ? `${prev}. ${pill}` : pill)}
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.05)',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        + {pill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 5. Generate Button */}
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={generating}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: generating ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    transition: 'all 0.2s',
                  }}
                >
                  {generating ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff', margin: 0 }} />
                      <span>{generationStep || 'Analyzing with Gemini...'}</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Generate Executive Report</span>
                    </>
                  )}
                </button>

                {hasApiKey === false && (
                  <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fbbf24' }}>
                    ⚠️ No Google Gemini key set. Click <strong>"⚙️ API Key"</strong> at top to enter your key.
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Report Preview & Output */}
              {generatedMarkdown ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  
                  {/* Action Toolbar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#60a5fa' }}>{reportTitle}</h3>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {from} to {to} · {lob === 'ALL' ? 'Unified Firm-Wide' : `${lob} Division`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2 }}>
                        <button
                          type="button"
                          onClick={() => setPreviewTab('rendered')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            background: previewTab === 'rendered' ? 'var(--accent-primary)' : 'transparent',
                            color: previewTab === 'rendered' ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          Visual Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewTab('edit')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            background: previewTab === 'edit' ? 'var(--accent-primary)' : 'transparent',
                            color: previewTab === 'edit' ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          Edit Markdown
                        </button>
                      </div>

                      {/* 6. Copy for Outlook button */}
                      <button
                        type="button"
                        onClick={() => handleCopyOutlook()}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          boxShadow: '0 0 12px rgba(16,185,129,0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>📋</span>
                        <span>Copy for Outlook</span>
                      </button>
                    </div>
                  </div>

                  {/* Verified Database Metrics Banner */}
                  {analyzedMetrics && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 8 }}>
                      <div className="glass-card" style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Leads</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{analyzedMetrics.total_leads}</div>
                      </div>
                      <div className="glass-card" style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Signed</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399' }}>{analyzedMetrics.signed_retainers}</div>
                      </div>
                      <div className="glass-card" style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Signed Rate</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#60a5fa' }}>{analyzedMetrics.signed_rate}%</div>
                      </div>
                      {analyzedMetrics.converted_cases > 0 && (
                        <div className="glass-card" style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Converted</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24' }}>{analyzedMetrics.converted_cases}</div>
                        </div>
                      )}
                      <div className="glass-card" style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Avg CAPD</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#a78bfa' }}>{analyzedMetrics.avg_capd}m</div>
                      </div>
                    </div>
                  )}

                  {/* Preview Container */}
                  <div className="glass-card" style={{ padding: 20, maxHeight: '55vh', overflowY: 'auto', background: previewTab === 'rendered' ? '#ffffff' : '#070f1e', color: previewTab === 'rendered' ? '#0f172a' : '#fff' }}>
                    {previewTab === 'rendered' ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: generatedHtml }}
                        style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
                      />
                    ) : (
                      <textarea
                        className="input-field"
                        style={{ width: '100%', height: '48vh', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, background: 'transparent', color: '#e2e8f0', border: 'none', resize: 'none' }}
                        value={generatedMarkdown}
                        onChange={(e) => setGeneratedMarkdown(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              ) : null}

            </div>
          )}

          {/* VIEW 2: REPORT HISTORY / ARCHIVE */}
          {activeView === 'history' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Saved Executive Reports Archive</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Browse and re-copy past management reports</div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={fetchReportHistory}
                  disabled={loadingHistory}
                  style={{ fontSize: 12 }}
                >
                  {loadingHistory ? 'Refreshing...' : '🔄 Refresh Archive'}
                </button>
              </div>

              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  <div className="spinner" style={{ margin: '0 auto 10px' }} />
                  <p>Loading saved reports...</p>
                </div>
              ) : savedReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: 36, display: 'block', marginBottom: 10 }}>📂</span>
                  <p style={{ fontWeight: 600 }}>No reports saved yet.</p>
                  <p style={{ fontSize: 12 }}>Generated reports will be archived here for instant leadership review.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: viewingSavedReport ? '340px 1fr' : '1fr', gap: 16 }}>
                  {/* List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '65vh', overflowY: 'auto' }}>
                    {savedReports.map(rep => (
                      <div
                        key={rep.id}
                        onClick={() => setViewingSavedReport(rep)}
                        style={{
                          padding: 14,
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: viewingSavedReport?.id === rep.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                          border: viewingSavedReport?.id === rep.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.07)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{rep.title}</span>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                            {rep.lob}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                          Period: {rep.date_from} to {rep.date_to}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                          <span>By {rep.generated_by}</span>
                          <span>{rep.created_at?.slice(0, 16)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Detail Preview */}
                  {viewingSavedReport && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{viewingSavedReport.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Generated on {viewingSavedReport.created_at}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleCopyOutlook(viewingSavedReport.content_html, viewingSavedReport.content_markdown)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                            }}
                          >
                            📋 Copy for Outlook
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedReport(viewingSavedReport.id)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              background: 'rgba(239,68,68,0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239,68,68,0.3)',
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: 20, maxHeight: '54vh', overflowY: 'auto', background: '#ffffff', color: '#0f172a' }}>
                        <div
                          dangerouslySetInnerHTML={{ __html: viewingSavedReport.content_html }}
                          style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: API KEY CONFIGURATION */}
          {activeView === 'key_config' && (
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '10px 0' }}>
              <div className="glass-card" style={{ padding: 24, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                    🔑
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Google Gemini API Configuration</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Powers all AI operations briefings and summaries</div>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
                  To generate AI management reports, the dashboard connects directly to Google's official Gemini AI models (e.g. Gemini 2.5 Flash).
                  You can retrieve your free API key in 30 seconds at{' '}
                  <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                    Google AI Studio
                  </a>.
                </p>

                {hasApiKey && (
                  <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>Active Gemini API Key Configured</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Preview: {keyPreview} ({keySource})</div>
                    </div>
                  </div>
                )}

                {keySuccess && (
                  <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#34d399' }}>
                    {keySuccess}
                  </div>
                )}

                <form onSubmit={handleSaveApiKey}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {hasApiKey ? 'Update API Key' : 'Enter Google Gemini API Key'}
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="AIzaSy..."
                    style={{ width: '100%', marginBottom: 14 }}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    required
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setActiveView('create')}
                    >
                      Back to Generator
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={savingKey || !apiKeyInput.trim()}
                      style={{ fontWeight: 700 }}
                    >
                      {savingKey ? 'Saving...' : 'Save API Key'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  )
}
