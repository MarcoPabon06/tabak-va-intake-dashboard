'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'

export default function ImportPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userRole = (session?.user as any)?.role || 'regular'
  const userPerms = (session?.user as any)?.permissions

  const [activeTab, setActiveTab] = useState<'call-report' | 'converted-ssd' | 'ssd-leads' | 'va-leads' | 'eod-report' | 'history'>('call-report')

  // Import History & Rollback State
  const [historyBatches, setHistoryBatches] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historySuccess, setHistorySuccess] = useState('')
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  const fetchHistoryBatches = async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch('/api/import/history?lob=ALL')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch history')
      setHistoryBatches(data.batches || [])
    } catch (err: any) {
      setHistoryError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistoryBatches()
    }
  }, [activeTab])

  const handleRollbackBatch = async (batch: any) => {
    if (!window.confirm(`Are you sure you want to undo and revert import "${batch.filename}"?\n\nThis will remove ${batch.records_created} created records and restore ${batch.records_updated} modified records.`)) return
    setRollingBackId(batch.batch_id)
    setHistoryError('')
    try {
      const res = await fetch('/api/import/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.batch_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rollback import')
      setHistorySuccess(data.message)
      fetchHistoryBatches()
    } catch (err: any) {
      setHistoryError(err.message)
    } finally {
      setRollingBackId(null)
    }
  }

  // CRM Call Report State
  const [callFile, setCallFile] = useState<File | null>(null)
  const [callLoading, setCallLoading] = useState(false)
  const [callResult, setCallResult] = useState<{
    total_calls_processed?: number
    agent_summaries?: { date: string; agent_name: string; capd: number; inbound_calls: number; outbound_calls: number }[]
    error?: string
  } | null>(null)
  const [callDragging, setCallDragging] = useState(false)

  // SSD Converted Cases State
  const [convertedFile, setConvertedFile] = useState<File | null>(null)
  const [convertedLoading, setConvertedLoading] = useState(false)
  const [convertedResult, setConvertedResult] = useState<{ message?: string; error?: string } | null>(null)
  const [convertedDragging, setConvertedDragging] = useState(false)

  // SSD Leads State
  const [ssdFile, setSsdFile] = useState<File | null>(null)
  const [ssdLoading, setSsdLoading] = useState(false)
  const [ssdResult, setSsdResult] = useState<{ message?: string; error?: string } | null>(null)
  const [ssdDragging, setSsdDragging] = useState(false)

  // VA Leads State
  const [vaFile, setVaFile] = useState<File | null>(null)
  const [vaLoading, setVaLoading] = useState(false)
  const [vaResult, setVaResult] = useState<{ message?: string; error?: string } | null>(null)
  const [vaDragging, setVaDragging] = useState(false)

  // EOD Report State
  const [eodFile, setEodFile] = useState<File | null>(null)
  const [eodLoading, setEodLoading] = useState(false)
  const [eodResult, setEodResult] = useState<{ imported?: number; skipped?: number; error?: string } | null>(null)
  const [eodDragging, setEodDragging] = useState(false)

  // Auth guard: redirect non-authorized users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    } else if (status === 'authenticated') {
      if (userRole === 'regular' && !userPerms?.canManageDailyEntry) {
        router.replace('/dashboard')
      } else if (userRole === 'admin' && userPerms?.canManageDailyEntry === false) {
        router.replace('/dashboard')
      } else if (userRole === 'qa') {
        router.replace('/dashboard')
      }
    }
  }, [status, userRole, userPerms, router])

  // Upload CRM Call Report
  async function handleCallReportUpload() {
    if (!callFile) return
    setCallLoading(true)
    setCallResult(null)

    const formData = new FormData()
    formData.append('file', callFile)

    try {
      const res = await fetch('/api/call-report/import', { method: 'POST', body: formData })
      const json = await res.json()
      setCallResult(json)
    } catch {
      setCallResult({ error: 'Call report upload failed. Please try again.' })
    } finally {
      setCallLoading(false)
    }
  }

  // Upload SSD Converted Cases Report
  async function handleConvertedUpload() {
    if (!convertedFile) return
    setConvertedLoading(true)
    setConvertedResult(null)

    const formData = new FormData()
    formData.append('file', convertedFile)

    try {
      const res = await fetch('/api/ssd-tracker/import-converted', { method: 'POST', body: formData })
      const json = await res.json()
      setConvertedResult(json)
    } catch {
      setConvertedResult({ error: 'Converted cases upload failed. Please try again.' })
    } finally {
      setConvertedLoading(false)
    }
  }

  // Upload SSD Leads Spreadsheet
  async function handleSsdUpload() {
    if (!ssdFile) return
    setSsdLoading(true)
    setSsdResult(null)

    const formData = new FormData()
    formData.append('file', ssdFile)

    try {
      const res = await fetch('/api/ssd-tracker/import', { method: 'POST', body: formData })
      const json = await res.json()
      setSsdResult(json)
    } catch {
      setSsdResult({ error: 'SSD leads upload failed. Please try again.' })
    } finally {
      setSsdLoading(false)
    }
  }

  // Upload VA Leads Spreadsheet
  async function handleVaUpload() {
    if (!vaFile) return
    setVaLoading(true)
    setVaResult(null)

    const formData = new FormData()
    formData.append('file', vaFile)

    try {
      const res = await fetch('/api/va-tracker/import', { method: 'POST', body: formData })
      const json = await res.json()
      setVaResult(json)
    } catch {
      setVaResult({ error: 'VA leads upload failed. Please try again.' })
    } finally {
      setVaLoading(false)
    }
  }

  // Upload EOD Report
  async function handleEodUpload() {
    if (!eodFile) return
    setEodLoading(true)
    setEodResult(null)

    const formData = new FormData()
    formData.append('file', eodFile)

    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const json = await res.json()
      setEodResult(json)
    } catch {
      setEodResult({ error: 'Upload failed. Please try again.' })
    } finally {
      setEodLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px' }}>
        <div style={{ maxWidth: 850 }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
              📥 Import Data Center
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              Upload CRM Call Reports, Converted Cases reports, and Intake spreadsheets with automated PII masking and security scans.
            </p>
          </div>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('call-report')}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'call-report' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'call-report' ? '#fff' : '#94a3b8',
                border: activeTab === 'call-report' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              📞 CRM Call Report (Auto CAPD)
            </button>

            <button
              onClick={() => setActiveTab('converted-ssd')}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'converted-ssd' ? '#10b981' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'converted-ssd' ? '#fff' : '#94a3b8',
                border: activeTab === 'converted-ssd' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              🎉 Converted Cases (SSD Sync)
            </button>

            <button
              onClick={() => setActiveTab('ssd-leads')}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'ssd-leads' ? '#8b5cf6' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'ssd-leads' ? '#fff' : '#94a3b8',
                border: activeTab === 'ssd-leads' ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              💼 SSD Leads Spreadsheet
            </button>

            <button
              onClick={() => setActiveTab('va-leads')}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'va-leads' ? '#06b6d4' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'va-leads' ? '#fff' : '#94a3b8',
                border: activeTab === 'va-leads' ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              📑 VA Leads Spreadsheet
            </button>

            <button
              onClick={() => setActiveTab('eod-report')}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'eod-report' ? '#b82105' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'eod-report' ? '#fff' : '#94a3b8',
                border: activeTab === 'eod-report' ? '1px solid #b82105' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              📊 Full EOD Performance
            </button>

            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'history' ? '#f59e0b' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'history' ? '#000' : '#fbbf24',
                border: activeTab === 'history' ? '1px solid #f59e0b' : '1px solid rgba(245,158,11,0.25)',
              }}
            >
              ⏪ Import History & Rollback
            </button>
          </div>

          {/* TAB 1: CRM CALL REPORT */}
          {activeTab === 'call-report' && (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚡ Automated CRM Call Report Processing
                </h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, paddingLeft: 16 }}>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Auto Name Correction</strong>: Misspelled CRM names are mapped to standard VA and SSD specialists.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Automated CAPD & Inbound Totals</strong>: Calculates total calls per rep as <strong>CAPD</strong> and inbound calls as <strong>Inbound</strong>.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Safe Sync</strong>: Automatically updates daily performance without overwriting live retainer counts.
                  </li>
                </ul>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setCallDragging(true) }}
                onDragLeave={() => setCallDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setCallDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f && f.name.endsWith('.xlsx')) setCallFile(f)
                }}
                onClick={() => document.getElementById('call-file-input')?.click()}
                className="glass-card"
                style={{
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderColor: callDragging ? '#3b82f6' : callFile ? 'rgba(16,185,129,0.5)' : 'var(--border)',
                  background: callDragging ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)',
                  transition: 'all 0.2s',
                  marginBottom: 20,
                }}
              >
                <input
                  id="call-file-input"
                  type="file"
                  accept=".xlsx"
                  style={{ display: 'none' }}
                  onChange={(e) => setCallFile(e.target.files?.[0] || null)}
                />
                <div style={{ fontSize: 36, marginBottom: 10 }}>{callFile ? '📞' : '📁'}</div>
                {callFile ? (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>{callFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(callFile.size / 1024).toFixed(1)} KB — Click or drop another to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      Drop your CallReport.xlsx here, or browse
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Automatically parses Agents, Call Direction, and timestamps</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleCallReportUpload}
                disabled={!callFile || callLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, marginBottom: 20, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
              >
                {callLoading ? '⏳ Processing Call Report...' : 'Process CRM Call Report'}
              </button>

              {callResult && (
                <div className="glass-card fade-in" style={{ padding: '18px 22px', borderColor: callResult.error ? '#ef4444' : '#10b981' }}>
                  {callResult.error ? (
                    <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {callResult.error}</div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 6, fontSize: 14 }}>
                        ⚡ Successfully Processed {callResult.total_calls_processed} Calls!
                      </div>
                      {callResult.agent_summaries && callResult.agent_summaries.length > 0 && (
                        <div style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Date</th>
                                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Agent</th>
                                <th style={{ textAlign: 'left', padding: '6px 10px' }}>CAPD</th>
                                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Inbound</th>
                                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Outbound</th>
                              </tr>
                            </thead>
                            <tbody>
                              {callResult.agent_summaries.map((s, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{s.date}</td>
                                  <td style={{ padding: '6px 10px', fontWeight: 700, color: '#fff' }}>{s.agent_name}</td>
                                  <td style={{ padding: '6px 10px', fontWeight: 800, color: '#3b82f6' }}>{s.capd}</td>
                                  <td style={{ padding: '6px 10px', color: '#10b981' }}>{s.inbound_calls}</td>
                                  <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>{s.outbound_calls}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONVERTED CASES (SSD SYNC) */}
          {activeTab === 'converted-ssd' && (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🎉 Automated CRM Converted Cases Synchronization
                </h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, paddingLeft: 16 }}>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Smart Match & Promote</strong>: Matches <strong>LeadID</strong> in SSD Tracker and automatically updates pending retainers (Sent E-Sign / Paper Sent) to <strong>Signed E-Sign</strong>.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Real-Time Conversion Rates</strong>: Increments <strong>converted_cases</strong> for the assigned specialist on the conversion date so Dashboard conversion rates match perfectly.
                  </li>
                </ul>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setConvertedDragging(true) }}
                onDragLeave={() => setConvertedDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setConvertedDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setConvertedFile(f)
                }}
                onClick={() => document.getElementById('converted-file-input')?.click()}
                className="glass-card"
                style={{
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderColor: convertedDragging ? '#10b981' : convertedFile ? 'rgba(16,185,129,0.5)' : 'var(--border)',
                  background: convertedDragging ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-card)',
                  transition: 'all 0.2s',
                  marginBottom: 20,
                }}
              >
                <input
                  id="converted-file-input"
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={(e) => setConvertedFile(e.target.files?.[0] || null)}
                />
                <div style={{ fontSize: 36, marginBottom: 10 }}>{convertedFile ? '🎉' : '📁'}</div>
                {convertedFile ? (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>{convertedFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(convertedFile.size / 1024).toFixed(1)} KB — Click or drop another to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      Drop your Converted-Status_Report.xlsx here, or browse
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Supports direct exports from CRM with LeadID, Idle Time, and Current Assignee</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleConvertedUpload}
                disabled={!convertedFile || convertedLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, marginBottom: 20, background: '#10b981', borderColor: '#10b981' }}
              >
                {convertedLoading ? '⏳ Synchronizing Converted Cases...' : 'Synchronize Converted Cases'}
              </button>

              {convertedResult && (
                <div className="glass-card fade-in" style={{ padding: '18px 22px', borderColor: convertedResult.error ? '#ef4444' : '#10b981' }}>
                  {convertedResult.error ? (
                    <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {convertedResult.error}</div>
                  ) : (
                    <div style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>
                      {convertedResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SSD LEADS SPREADSHEET */}
          {activeTab === 'ssd-leads' && (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(139, 92, 246, 0.3)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  💼 SSD Leads 8-Column Spreadsheet Import
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Imports Rep Name, Client Name, Lead ID, Date, Status, Claim Type (SSDI/SSI/DWB), Outcome Reasoning, and Notes.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setSsdDragging(true) }}
                onDragLeave={() => setSsdDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setSsdDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setSsdFile(f)
                }}
                onClick={() => document.getElementById('ssd-file-input')?.click()}
                className="glass-card"
                style={{
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderColor: ssdDragging ? '#8b5cf6' : ssdFile ? 'rgba(16,185,129,0.5)' : 'var(--border)',
                  background: ssdDragging ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-card)',
                  transition: 'all 0.2s',
                  marginBottom: 20,
                }}
              >
                <input
                  id="ssd-file-input"
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={(e) => setSsdFile(e.target.files?.[0] || null)}
                />
                <div style={{ fontSize: 36, marginBottom: 10 }}>{ssdFile ? '💼' : '📁'}</div>
                {ssdFile ? (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>{ssdFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(ssdFile.size / 1024).toFixed(1)} KB — Click or drop another to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      Drop your SSD Leads Spreadsheet here, or browse
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Supports .xlsx and .xls formats</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleSsdUpload}
                disabled={!ssdFile || ssdLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, marginBottom: 20, background: '#8b5cf6', borderColor: '#8b5cf6' }}
              >
                {ssdLoading ? '⏳ Importing SSD Leads...' : 'Import SSD Leads'}
              </button>

              {ssdResult && (
                <div className="glass-card fade-in" style={{ padding: '18px 22px', borderColor: ssdResult.error ? '#ef4444' : '#10b981' }}>
                  {ssdResult.error ? (
                    <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {ssdResult.error}</div>
                  ) : (
                    <div style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>
                      {ssdResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VA LEADS SPREADSHEET */}
          {activeTab === 'va-leads' && (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(6, 182, 212, 0.3)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📑 VA Leads Spreadsheet Import
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Imports Veteran Name, Lead ID, Date, Status, and Outcome Reasoning for VA Intake.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setVaDragging(true) }}
                onDragLeave={() => setVaDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setVaDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setVaFile(f)
                }}
                onClick={() => document.getElementById('va-file-input')?.click()}
                className="glass-card"
                style={{
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderColor: vaDragging ? '#06b6d4' : vaFile ? 'rgba(16,185,129,0.5)' : 'var(--border)',
                  background: vaDragging ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)',
                  transition: 'all 0.2s',
                  marginBottom: 20,
                }}
              >
                <input
                  id="va-file-input"
                  type="file"
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={(e) => setVaFile(e.target.files?.[0] || null)}
                />
                <div style={{ fontSize: 36, marginBottom: 10 }}>{vaFile ? '📑' : '📁'}</div>
                {vaFile ? (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>{vaFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(vaFile.size / 1024).toFixed(1)} KB — Click or drop another to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      Drop your VA Leads Spreadsheet here, or browse
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Supports .xlsx and .xls formats</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleVaUpload}
                disabled={!vaFile || vaLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, marginBottom: 20, background: '#06b6d4', borderColor: '#06b6d4' }}
              >
                {vaLoading ? '⏳ Importing VA Leads...' : 'Import VA Leads'}
              </button>

              {vaResult && (
                <div className="glass-card fade-in" style={{ padding: '18px 22px', borderColor: vaResult.error ? '#ef4444' : '#10b981' }}>
                  {vaResult.error ? (
                    <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {vaResult.error}</div>
                  ) : (
                    <div style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>
                      {vaResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: FULL EOD REPORT */}
          {activeTab === 'eod-report' && (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(184, 33, 5, 0.3)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  What gets imported
                </h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, paddingLeft: 16 }}>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All records from the <strong>Acumulado</strong> / <strong>Grand Total</strong> sheet</li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Agent names, dates, CAPD, CRH, Case Rejected</li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Signed & Unsigned Retainers + Conversion Rate</li>
                </ul>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setEodDragging(true) }}
                onDragLeave={() => setEodDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setEodDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f && f.name.endsWith('.xlsx')) setEodFile(f)
                }}
                onClick={() => document.getElementById('eod-file-input')?.click()}
                className="glass-card"
                style={{
                  padding: '36px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderColor: eodDragging ? '#b82105' : eodFile ? 'rgba(16,185,129,0.5)' : 'var(--border)',
                  background: eodDragging ? 'rgba(184, 33, 5, 0.06)' : 'var(--bg-card)',
                  transition: 'all 0.2s',
                  marginBottom: 20,
                }}
              >
                <input
                  id="eod-file-input"
                  type="file"
                  accept=".xlsx"
                  style={{ display: 'none' }}
                  onChange={(e) => setEodFile(e.target.files?.[0] || null)}
                />
                <div style={{ fontSize: 36, marginBottom: 10 }}>{eodFile ? '📊' : '📁'}</div>
                {eodFile ? (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>{eodFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(eodFile.size / 1024).toFixed(1)} KB — Click or drop another to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      Drop your EOD Report.xlsx here, or browse
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Supports .xlsx only (must have Acumulado or Grand Total sheet)</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleEodUpload}
                disabled={!eodFile || eodLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, marginBottom: 20 }}
              >
                {eodLoading ? '⏳ Importing...' : 'Import EOD Report'}
              </button>

              {eodResult && (
                <div className="glass-card fade-in" style={{ padding: '18px 22px', borderColor: eodResult.error ? '#ef4444' : '#10b981' }}>
                  {eodResult.error ? (
                    <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {eodResult.error}</div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 4, fontSize: 14 }}>
                        ✅ Import Successful!
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                        Imported {eodResult.imported} records. Skipped {eodResult.skipped} empty/invalid rows.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: IMPORT HISTORY & ROLLBACK */}
          {activeTab === 'history' && (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⏪ Unified Import History & Safe Rollback Engine
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Did you accidentally upload the wrong spreadsheet or report? You can revert any import batch below.
                  The rollback engine safely deletes all created records and restores any modified records to their exact previous state.
                </p>
              </div>

              {historyError && (
                <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  ⚠️ {historyError}
                </div>
              )}
              {historySuccess && (
                <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  ✅ {historySuccess}
                </div>
              )}

              <div className="glass-card" style={{ padding: 20, overflowX: 'auto' }}>
                {historyLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    ⏳ Loading global import batches...
                  </div>
                ) : historyBatches.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    📄 No import batches recorded yet. Uploaded spreadsheets and CRM reports will be listed here.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>File & Target</th>
                        <th style={{ padding: '10px 12px' }}>Uploader</th>
                        <th style={{ padding: '10px 12px' }}>Date & Time</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Impact</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyBatches.map((b: any) => {
                        const isRollingBack = rollingBackId === b.batch_id
                        const isRolledBack = b.status === 'ROLLED_BACK'

                        return (
                          <tr
                            key={b.id}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              opacity: isRolledBack ? 0.6 : 1,
                              backgroundColor: isRolledBack ? 'rgba(0,0,0,0.15)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '12px' }}>
                              <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>{b.filename}</div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                                  {b.lob}
                                </span>
                                <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                                  {b.upload_type}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                              <div style={{ fontWeight: 600 }}>{b.user_name || b.username}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>@{b.username}</div>
                            </td>
                            <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                              {b.created_at}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#34d399', fontWeight: 700 }}>+{b.records_created}</span> created
                              {b.records_updated > 0 && (
                                <span style={{ color: '#60a5fa', marginLeft: 6, fontSize: 12 }}>
                                  · {b.records_updated} updated
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {isRolledBack ? (
                                <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                  ↩️ Rolled Back
                                </span>
                              ) : (
                                <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                  Active
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {isRolledBack ? (
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                  Reverted {b.rolled_back_at?.slice(0, 10)}
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleRollbackBatch(b)}
                                  disabled={isRollingBack}
                                  style={{
                                    background: 'rgba(239,68,68,0.15)',
                                    border: '1px solid rgba(239,68,68,0.35)',
                                    color: '#f87171',
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: isRollingBack ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {isRollingBack ? '⏳ Reverting...' : '⏪ Revert Import'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
