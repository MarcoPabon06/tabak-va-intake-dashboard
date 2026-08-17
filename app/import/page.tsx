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

  const [activeTab, setActiveTab] = useState<'call-report' | 'eod-report'>('call-report')

  // EOD Report State
  const [eodFile, setEodFile] = useState<File | null>(null)
  const [eodLoading, setEodLoading] = useState(false)
  const [eodResult, setEodResult] = useState<{ imported?: number; skipped?: number; error?: string } | null>(null)
  const [eodDragging, setEodDragging] = useState(false)

  // CRM Call Report State
  const [callFile, setCallFile] = useState<File | null>(null)
  const [callLoading, setCallLoading] = useState(false)
  const [callResult, setCallResult] = useState<{
    total_calls_processed?: number
    agent_summaries?: { date: string; agent_name: string; capd: number; inbound_calls: number; outbound_calls: number }[]
    error?: string
  } | null>(null)
  const [callDragging, setCallDragging] = useState(false)

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px' }}>
        <div style={{ maxWidth: 760 }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
              📥 Import Data from Excel
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              Import raw CRM Call Reports to automate CAPD & Inbound call totals, or upload full EOD performance spreadsheets.
            </p>
          </div>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button
              onClick={() => setActiveTab('call-report')}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'call-report' ? '#b82105' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'call-report' ? '#fff' : '#94a3b8',
                border: activeTab === 'call-report' ? '1px solid #b82105' : '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>📞 CRM Call Report (Auto CAPD)</span>
            </button>

            <button
              onClick={() => setActiveTab('eod-report')}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: activeTab === 'eod-report' ? '#b82105' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'eod-report' ? '#fff' : '#94a3b8',
                border: activeTab === 'eod-report' ? '1px solid #b82105' : '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>📊 Full EOD Performance Report</span>
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
                    <strong>Auto Name Correction</strong>: Misspelled CRM names (like <em>"Daniel Castill"</em>) are automatically mapped to <strong>Daniel Castillo</strong>.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Automated CAPD & Inbound Totals</strong>: Calculates total calls per rep as <strong>CAPD</strong> and inbound calls as <strong>Inbound</strong>.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong>Safe Sync</strong>: Automatically updates or creates daily performance entries without overwriting existing retainer counts.
                  </li>
                </ul>
              </div>

              {/* Call Report Drop Zone */}
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
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={(e) => setCallFile(e.target.files?.[0] || null)}
                />
                <div style={{ fontSize: 36, marginBottom: 10 }}>{callFile ? '📞' : '📂'}</div>
                {callFile ? (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>{callFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(callFile.size / 1024).toFixed(1)} KB — Click or drop another to replace</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 14 }}>
                      Drop your raw CRM <span style={{ color: '#60a5fa' }}>CallReport.xlsx</span> here, or browse
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Supports .xlsx exported directly from CRM</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleCallReportUpload}
                disabled={!callFile || callLoading}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, marginBottom: 20 }}
              >
                {callLoading ? '⏳ Processing Call Report & Updating CAPD...' : '⚡ Process Call Report & Update Dashboard'}
              </button>

              {/* Call Report Result Summary Table */}
              {callResult && (
                <div className="glass-card fade-in" style={{ padding: '20px 24px', borderColor: callResult.error ? '#ef4444' : '#10b981' }}>
                  {callResult.error ? (
                    <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {callResult.error}</div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 20 }}>✅</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#10b981' }}>
                            Successfully Processed {callResult.total_calls_processed} Calls!
                          </h4>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                            CAPD and Inbound call volume has been automatically populated for the following specialists:
                          </p>
                        </div>
                      </div>

                      {callResult.agent_summaries && callResult.agent_summaries.length > 0 && (
                        <div style={{ overflowX: 'auto', marginTop: 12 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '8px 12px' }}>Date</th>
                                <th style={{ padding: '8px 12px' }}>Specialist</th>
                                <th style={{ padding: '8px 12px' }}>Total Calls (CAPD)</th>
                                <th style={{ padding: '8px 12px' }}>Inbound</th>
                                <th style={{ padding: '8px 12px' }}>Outbound</th>
                              </tr>
                            </thead>
                            <tbody>
                              {callResult.agent_summaries.map((s, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{s.date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#fff' }}>{s.agent_name}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 800, color: '#3b82f6' }}>{s.capd}</td>
                                  <td style={{ padding: '8px 12px', color: '#10b981' }}>{s.inbound_calls}</td>
                                  <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{s.outbound_calls}</td>
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

          {/* TAB 2: FULL EOD REPORT */}
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

              {/* EOD Drop zone */}
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
        </div>
      </main>
    </div>
  )
}
