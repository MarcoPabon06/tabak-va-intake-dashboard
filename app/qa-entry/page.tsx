'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { format } from 'date-fns'

interface AgentOption {
  id: number
  name: string
  active: number
}

const CATEGORIES = [
  { key: 'professional_introduction', label: 'Professional Introduction & Trust', max: 20, icon: '🤝' },
  { key: 'pk_application_policies', label: 'PK & Application Policies', max: 25, icon: '📋' },
  { key: 'eligibility_assessment', label: 'Eligibility Assessment', max: 20, icon: '✅' },
  { key: 'process_deadline_compliance', label: 'Process & Deadline Compliance', max: 10, icon: '⏰' },
  { key: 'documentation_crm', label: 'Documentation in CRM', max: 15, icon: '💾' },
  { key: 'objection_handling', label: 'Objection Handling & Retention', max: 10, icon: '🛡️' },
]

const ZERO_TOLERANCE = [
  { key: 'zt_attorney_escalation', label: 'Unauthorized attorney escalation' },
  { key: 'zt_legal_misrepresentation', label: 'Legal outcome misrepresentation' },
  { key: 'zt_undocumented', label: 'Interaction left undocumented' },
]

export default function QAEntryPage() {
  const router = useRouter()

  // ── Upload state ──
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [dragging, setDragging] = useState(false)

  // ── Manual form state ──
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [callId, setCallId] = useState('')
  const [evalDate, setEvalDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [evaluatorName, setEvaluatorName] = useState('')
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.key, 0]))
  )
  const [zeroTolerance, setZeroTolerance] = useState<Record<string, boolean>>(
    Object.fromEntries(ZERO_TOLERANCE.map((z) => [z.key, false]))
  )
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formResult, setFormResult] = useState<{ success?: boolean; error?: string } | null>(null)

  // Fetch agents
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data: AgentOption[]) => {
        setAgents(data.filter((a) => a.active === 1))
      })
      .catch(() => {})
  }, [])

  // ── Computed score ──
  const hasZeroTolerance = Object.values(zeroTolerance).some((v) => v)
  const totalScore = hasZeroTolerance ? 0 : Object.values(scores).reduce((a, b) => a + b, 0)
  const maxScore = CATEGORIES.reduce((a, c) => a + c.max, 0)
  const pct = hasZeroTolerance ? 0 : (maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0)

  function getScoreColor(p: number) {
    if (p >= 90) return '#10b981'
    if (p >= 75) return '#b82105'
    if (p >= 60) return '#f59e0b'
    if (p >= 40) return '#ef4444'
    return '#dc2626'
  }

  // ── Upload handler ──
  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/qa/import', { method: 'POST', body: formData })
      const json = await res.json()
      setUploadResult(json)
    } catch {
      setUploadResult({ error: 'Upload failed. Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f)
  }

  // ── Submit handler ──
  async function handleSubmit() {
    if (!selectedAgent || !callId || !evaluatorName) {
      setFormResult({ error: 'Please fill in Agent, Call ID, and Evaluator Name.' })
      return
    }
    setSubmitting(true)
    setFormResult(null)
    try {
      const body = {
        agent_name: selectedAgent,
        call_id: callId,
        eval_date: evalDate,
        evaluator_name: evaluatorName,
        ...scores,
        overall_score: totalScore,
        ...Object.fromEntries(
          ZERO_TOLERANCE.map((z) => [z.key, zeroTolerance[z.key] ? 1 : 0])
        ),
        feedback,
      }
      const res = await fetch('/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')
      setFormResult({ success: true })
      // Reset form
      setCallId('')
      setFeedback('')
      setScores(Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])))
      setZeroTolerance(Object.fromEntries(ZERO_TOLERANCE.map((z) => [z.key, false])))
    } catch (err: any) {
      setFormResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 780 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>QA Evaluation Entry</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Upload a QA Excel report or manually enter evaluation scores for an agent call.
            </p>
          </div>

          {/* ═══════ Section A: Upload QA Excel ═══════ */}
          <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 28, borderColor: 'rgba(184, 33, 5, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 20 }}>📥</span>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Upload QA Excel</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Import evaluations from a formatted QA spreadsheet</p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              id="qa-drop-zone"
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById('qa-file-input')?.click()}
              className="glass-card"
              style={{
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                borderColor: dragging ? '#b82105' : file ? 'rgba(16,185,129,0.5)' : 'var(--border)',
                background: dragging ? 'rgba(184, 33, 5, 0.06)' : 'var(--bg-card)',
                transition: 'all 0.2s',
                marginBottom: 16,
              }}
            >
              <input
                id="qa-file-input"
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div style={{ fontSize: 36, marginBottom: 12 }}>{file ? '📊' : '📁'}</div>
              {file ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981', marginBottom: 4 }}>{file.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Drop your QA Excel file here</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or click to browse · .xlsx files only</div>
                </>
              )}
            </div>

            {/* Upload result */}
            {uploadResult && (
              <div style={{
                background: uploadResult.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${uploadResult.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                borderRadius: 12, padding: '14px 18px', marginBottom: 16,
              }}>
                {uploadResult.error ? (
                  <div style={{ color: '#ef4444', fontWeight: 600 }}>❌ {uploadResult.error}</div>
                ) : (
                  <>
                    <div style={{ color: '#10b981', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>✅ QA Import complete!</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: '#10b981' }}>{uploadResult.imported}</span> evaluations imported
                      {uploadResult.details && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {uploadResult.details.map((d: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                              <span style={{ fontWeight: 600 }}>{d.agent}</span>
                              <span style={{ color: 'var(--text-muted)' }}>Score: {d.score}%</span>
                              <span className="badge" style={{
                                padding: '1px 8px', fontSize: 9,
                                background: `${getScoreColor(d.score)}22`,
                                color: getScoreColor(d.score),
                                border: `1px solid ${getScoreColor(d.score)}44`,
                              }}>{d.tier}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              id="btn-qa-upload"
              className="btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{ padding: '11px 24px', fontSize: 14, width: '100%' }}
            >
              {uploading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  Importing QA data…
                </span>
              ) : '📥 Import QA Data'}
            </button>
          </div>

          {/* ═══════ Section B: Manual QA Entry ═══════ */}
          <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 28, borderColor: 'rgba(184, 33, 5, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>✏️</span>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Manual QA Entry</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Score an individual agent call evaluation</p>
              </div>
            </div>

            {/* Form feedback */}
            {formResult && (
              <div style={{
                background: formResult.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${formResult.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                color: formResult.error ? '#ef4444' : '#10b981', fontSize: 14, fontWeight: 600,
              }}>
                {formResult.error ? `❌ ${formResult.error}` : '✅ Evaluation submitted successfully!'}
              </div>
            )}

            {/* Agent + Call ID */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label className="field-label">Agent</label>
                <select
                  id="qa-agent"
                  className="input-field"
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Select agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Call ID</label>
                <input
                  id="qa-call-id"
                  className="input-field"
                  placeholder="e.g. CALL-20250606-001"
                  value={callId}
                  onChange={(e) => setCallId(e.target.value)}
                />
              </div>
            </div>

            {/* Date + Evaluator */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="field-label">Evaluation Date</label>
                <input
                  id="qa-eval-date"
                  type="date"
                  className="input-field"
                  value={evalDate}
                  onChange={(e) => setEvalDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Evaluator Name</label>
                <input
                  id="qa-evaluator"
                  className="input-field"
                  placeholder="Your name"
                  value={evaluatorName}
                  onChange={(e) => setEvaluatorName(e.target.value)}
                />
              </div>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 20px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Category Scores
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Category sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
              {CATEGORIES.map((cat) => {
                const val = scores[cat.key]
                const fillPct = cat.max > 0 ? (val / cat.max) * 100 : 0
                return (
                  <div key={cat.key}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{cat.icon}</span>
                        <label className="field-label" style={{ marginBottom: 0 }}>{cat.label}</label>
                      </div>
                      <div style={{
                        fontSize: 14, fontWeight: 700,
                        color: fillPct >= 80 ? '#10b981' : fillPct >= 50 ? '#f59e0b' : 'var(--text-secondary)',
                      }}>
                        {val} <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>/ {cat.max}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 24 }}>
                      <input
                        id={`qa-slider-${cat.key}`}
                        type="range"
                        min={0}
                        max={cat.max}
                        value={val}
                        onChange={(e) => setScores((prev) => ({ ...prev, [cat.key]: parseInt(e.target.value) }))}
                        style={{
                          flex: 1,
                          height: 6,
                          appearance: 'none',
                          background: `linear-gradient(to right, #b82105 0%, #b82105 ${fillPct}%, rgba(255,255,255,0.08) ${fillPct}%, rgba(255,255,255,0.08) 100%)`,
                          borderRadius: 4,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="number"
                        className="input-field"
                        min={0}
                        max={cat.max}
                        value={val}
                        onChange={(e) => {
                          const v = Math.min(cat.max, Math.max(0, parseInt(e.target.value) || 0))
                          setScores((prev) => ({ ...prev, [cat.key]: v }))
                        }}
                        style={{ width: 64, textAlign: 'center', fontWeight: 700, fontSize: 15 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Overall Score Display */}
            <div style={{
              background: `${getScoreColor(pct)}11`,
              border: `1px solid ${getScoreColor(pct)}33`,
              borderRadius: 14, padding: '18px 24px', marginBottom: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Overall Score
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: getScoreColor(pct), letterSpacing: '-0.02em' }}>
                  {totalScore} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-muted)' }}>/ {maxScore}</span>
                </div>
              </div>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: `conic-gradient(${getScoreColor(pct)} ${pct * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--bg-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: getScoreColor(pct),
                }}>
                  {pct}%
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 20px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Zero Tolerance Violations
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Zero Tolerance toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {ZERO_TOLERANCE.map((zt) => (
                <div key={zt.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 10,
                  background: zeroTolerance[zt.key] ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${zeroTolerance[zt.key] ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                  transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>🚫</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: zeroTolerance[zt.key] ? '#ef4444' : 'var(--text-secondary)' }}>
                      {zt.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={zeroTolerance[zt.key] ? 'btn-secondary' : 'btn-primary'}
                      style={{ padding: '5px 14px', fontSize: 12, minWidth: 44 }}
                      onClick={() => setZeroTolerance((prev) => ({ ...prev, [zt.key]: false }))}
                    >No</button>
                    <button
                      style={{
                        padding: '5px 14px', fontSize: 12, minWidth: 44, borderRadius: 10,
                        border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
                        background: zeroTolerance[zt.key] ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'rgba(255,255,255,0.06)',
                        color: zeroTolerance[zt.key] ? 'white' : 'var(--text-muted)',
                        boxShadow: zeroTolerance[zt.key] ? '0 4px 12px rgba(239,68,68,0.3)' : 'none',
                      }}
                      onClick={() => setZeroTolerance((prev) => ({ ...prev, [zt.key]: true }))}
                    >Yes</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Feedback */}
            <div style={{ marginBottom: 24 }}>
              <label className="field-label">Feedback & Comments</label>
              <textarea
                id="qa-feedback"
                className="input-field"
                placeholder="Enter detailed feedback for the agent…"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={5}
                style={{ resize: 'vertical', minHeight: 100, lineHeight: 1.6 }}
              />
            </div>

            {/* Submit */}
            <button
              id="btn-qa-submit"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '13px 28px', fontSize: 15, width: '100%' }}
            >
              {submitting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  Submitting evaluation…
                </span>
              ) : '📝 Submit Evaluation'}
            </button>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select.input-field { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
        select.input-field option { background: #0a1628; color: #f8fafc; }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: #b82105; cursor: pointer; border: 2px solid #f8fafc;
          box-shadow: 0 2px 6px rgba(184, 33, 5, 0.4);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: #b82105; cursor: pointer; border: 2px solid #f8fafc;
          box-shadow: 0 2px 6px rgba(184, 33, 5, 0.4);
        }
      `}</style>
    </div>
  )
}
