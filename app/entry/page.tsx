'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import { format } from 'date-fns'

// Colors assigned by index — no hardcoding needed
const COLOR_PALETTE = [
  '#b82105', '#ec4899', '#10b981', '#f59e0b',
  '#3b82f6', '#06b6d4', '#5f758e', '#f97316',
  '#14b8a6', '#e11d48',
]

interface AgentEntry {
  agent_name: string
  present: string
  capd: number
  inbound_calls: number
  case_rejected: number
  crh: number
  signed_retainers: number
  unsigned_retainers: number
  converted_cases: number
  rfc_sent: number
  ura: number
  reprocess: number
  lob: string
}

function emptyEntry(agent: string, lob: string): AgentEntry {
  return {
    agent_name: agent,
    present: 'SI',
    capd: 0,
    inbound_calls: 0,
    case_rejected: 0,
    crh: 0,
    signed_retainers: 0,
    unsigned_retainers: 0,
    converted_cases: 0,
    rfc_sent: 0,
    ura: 0,
    reprocess: 0,
    lob: lob || 'VA',
  }
}

export default function EntryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(today)
  const [activeAgentsList, setActiveAgentsList] = useState<any[]>([])
  const [entries, setEntries] = useState<AgentEntry[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [viewLob, setViewLob] = useState<string>('All')
  const [reloadCounter, setReloadCounter] = useState(0)
  const [showQuickCallModal, setShowQuickCallModal] = useState(false)
  const [quickCallSuccessMsg, setQuickCallSuccessMsg] = useState('')

  const userRole = (session?.user as any)?.role || 'regular'
  const userPerms = (session?.user as any)?.permissions
  const isManager = userRole === 'master' || userRole === 'superadmin' || (userRole === 'admin' && (userPerms?.canManageDailyEntry ?? true))

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

  useEffect(() => {
    if (session?.user) {
      if (userRole === 'master' || userRole === 'superadmin') {
        setViewLob('All')
      } else if (userRole === 'admin') {
        const allowed = Array.isArray(userPerms?.allowedLobs) ? userPerms.allowedLobs : [(session.user as any).lob || 'VA']
        setViewLob(allowed.includes('All') || allowed.length > 1 ? 'All' : allowed[0])
      } else {
        const u = session.user as any
        setViewLob(u.lob || 'VA')
      }
    }
  }, [session, userRole, userPerms])

  // Fetch active regular agents on mount — these are the agents shown in the form
  useEffect(() => {
    async function fetchAgents() {
      setLoadingAgents(true)
      try {
        const res = await fetch('/api/agents')
        const agents: any[] = await res.json()
        const activeAgents = (Array.isArray(agents) ? agents : []).map((a) => ({
          username: a.name,
          display_name: a.name,
          lob: a.lob || 'VA',
        }))
        activeAgents.sort((a, b) => a.display_name.localeCompare(b.display_name))
        setActiveAgentsList(activeAgents)
        if (activeAgents.length === 0) {
          setLoadingAgents(false)
        }
      } catch {
        setError('Could not load agent list. Please refresh.')
        setLoadingAgents(false)
      }
    }
    fetchAgents()
  }, [])

  // Load existing performance data when date, active agents list, or reloadCounter changes
  useEffect(() => {
    if (activeAgentsList.length === 0) return

    async function loadPerformanceData() {
      setLoadingAgents(true)
      setError('')
      try {
        const res = await fetch(`/api/performance?from=${date}&to=${date}`)
        if (!res.ok) throw new Error('Failed to fetch performance')
        const existingData: any[] = await res.json()

        const existingMap = new Map<string, any>()
        existingData.forEach((row) => {
          existingMap.set(row.agent_name, row)
        })

        const mergedEntries = activeAgentsList.map((u) => {
          const name = u.display_name || u.username
          const match = existingMap.get(name)
          if (match) {
            return {
              agent_name: name,
              present: match.present || 'SI',
              capd: match.capd || 0,
              inbound_calls: match.inbound_calls || 0,
              case_rejected: match.case_rejected || 0,
              crh: match.crh || 0,
              signed_retainers: match.signed_retainers || 0,
              unsigned_retainers: match.unsigned_retainers || 0,
              converted_cases: match.converted_cases || 0,
              rfc_sent: match.rfc_sent || 0,
              ura: match.ura || 0,
              reprocess: match.reprocess || 0,
              lob: u.lob || 'VA',
            }
          } else {
            return emptyEntry(name, u.lob || 'VA')
          }
        })
        setEntries(mergedEntries)
      } catch (err: any) {
        setError('Could not load existing data for this date.')
        setEntries(activeAgentsList.map((u) => emptyEntry(u.display_name || u.username, u.lob || 'VA')))
      } finally {
        setLoadingAgents(false)
      }
    }

    loadPerformanceData()
  }, [date, activeAgentsList, reloadCounter])

  function update(agentIdx: number, field: keyof AgentEntry, value: any) {
    setEntries((prev) => {
      const next = [...prev]
      next[agentIdx] = { ...next[agentIdx], [field]: value }
      return next
    })
  }

  function getTotal(e: AgentEntry) {
    if (e.lob === 'SSD') {
      return e.signed_retainers || 0
    }
    return (e.signed_retainers || 0) + (e.unsigned_retainers || 0)
  }

  function getRate(e: AgentEntry) {
    if (e.lob === 'SSD') {
      const total = e.signed_retainers || 0
      if (total === 0) return '—'
      return (((e.converted_cases || 0) / total) * 100).toFixed(1) + '%'
    } else {
      const total = (e.signed_retainers || 0) + (e.unsigned_retainers || 0)
      if (total === 0) return '—'
      return ((e.signed_retainers / total) * 100).toFixed(1) + '%'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      const res = await fetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entries }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
      setReloadCounter((prev) => prev + 1)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setDate(today)
    setViewLob('All')
    setError('')
    setSuccess(false)
    setReloadCounter((prev) => prev + 1)
  }

  function getFieldsForLob(lob: string) {
    if (lob === 'SSD') {
      return [
        { key: 'capd', label: 'CAPD', hint: 'Calls made' },
        { key: 'signed_retainers', label: 'Signed', hint: 'Signed retainers' },
        { key: 'unsigned_retainers', label: 'Unsigned', hint: 'Unsigned retainers' },
        { key: 'rfc_sent', label: 'RFC', hint: 'RFC cases sent' },
        { key: 'crh', label: 'CRH', hint: 'Client Refused Help' },
        { key: 'case_rejected', label: 'Case Rejected', hint: 'Cases rejected' },
        { key: 'converted_cases', label: 'Converted', hint: 'Converted to Case' },
      ] as const
    }
    return [
      { key: 'capd', label: 'CAPD (Calls Made)', hint: 'Total calls made' },
      { key: 'inbound_calls', label: 'Inbound Calls', hint: 'Inbound calls answered' },
    ] as const
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 1100 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Daily Entry</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Log today's performance metrics for all active agents
              {!loadingAgents && activeAgentsList.length > 0 && (() => {
                const count = entries.filter((e) => viewLob === 'All' || e.lob === viewLob).length
                return (
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                    · {count} agent{count !== 1 ? 's' : ''} shown (of {activeAgentsList.length} active)
                  </span>
                )
              })()}
            </p>
          </div>

          {/* Date picker and LOB filter toggle */}
          <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <label className="field-label">Report Date</label>
              <input
                id="entry-date"
                type="date"
                className="input-field"
                style={{ width: 200 }}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Line of Business Filter</label>
              <select
                id="entry-lob-filter"
                className="input-field"
                style={{
                  width: 200,
                  marginBottom: 0,
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-primary)',
                  fontWeight: 600
                }}
                value={viewLob}
                onChange={(e) => setViewLob(e.target.value)}
              >
                {(() => {
                  const isSuper = userRole === 'master' || userRole === 'superadmin'
                  const allowed = userRole === 'admin'
                    ? (Array.isArray(userPerms?.allowedLobs) ? userPerms.allowedLobs : ['VA', 'SSD'])
                    : ['VA', 'SSD', 'APPS']
                  const showAll = isManager && (allowed.includes('All') || allowed.length > 1)
                  return (
                    <>
                      {showAll && <option value="All" style={{ background: '#1e1b4b', color: '#fff' }}>All Specialists</option>}
                      {(allowed.includes('VA') || allowed.includes('All') || isSuper) && <option value="VA" style={{ background: '#1e1b4b', color: '#fff' }}>VA Specialists</option>}
                      {(allowed.includes('SSD') || allowed.includes('All') || isSuper) && <option value="SSD" style={{ background: '#1e1b4b', color: '#fff' }}>SSD Specialists</option>}
                    </>
                  )
                })()}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', fontSize: 13, fontWeight: 700, padding: '6px 14px' }}
                onClick={() => setShowQuickCallModal(true)}
              >
                ⚡ Quick Import Call Report
              </button>
              <button id="btn-reset" type="button" className="btn-secondary" onClick={resetForm}>Reset</button>
            </div>
          </div>

          {/* Success/Error / Quick Call Toast */}
          {quickCallSuccessMsg && (
            <div style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#60a5fa', fontSize: 14, fontWeight: 700 }}>
              {quickCallSuccessMsg}
            </div>
          )}
          {success && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#10b981', fontSize: 14, fontWeight: 600 }}>
              ✅ Data saved successfully for {date}!
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 14 }}>
              ❌ {error}
            </div>
          )}

          {/* Loading agents */}
          {loadingAgents ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
              <span style={{ width: 20, height: 20, border: '2px solid rgba(184, 33, 5, 0.3)', borderTopColor: '#b82105', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              Loading active agents…
            </div>
          ) : activeAgentsList.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No active agents found</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
                Add users with the <strong>Regular</strong> role in User Management — they'll appear here automatically.
              </p>
              <button className="btn-primary" onClick={() => router.push('/users')}>
                Go to User Management →
              </button>
            </div>
          ) : (
            /* Entry form */
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {entries.map((entry, idx) => {
                  if (viewLob !== 'All' && entry.lob !== viewLob) return null
                  const color = COLOR_PALETTE[idx % COLOR_PALETTE.length]
                  const rate = getRate(entry)
                  const total = getTotal(entry)
                  const fields = getFieldsForLob(entry.lob)
                  return (
                    <div key={entry.agent_name} className="glass-card" style={{ padding: '16px 20px' }}>
                      {/* Agent header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{entry.agent_name}</span>
                          <span className="badge badge-accent" style={{ fontSize: 11, padding: '2px 8px' }}>
                            {entry.lob}
                          </span>
                        </div>

                        {/* Presence toggle */}
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                          {['SI', 'NO', 'TARDY'].map((p) => (
                            <button
                              key={p}
                              type="button"
                              id={`present-${idx}-${p}`}
                              style={{
                                padding: '4px 12px', fontSize: 12, fontWeight: 600,
                                border: '1px solid',
                                borderRadius: 8, cursor: 'pointer',
                                transition: 'all 0.15s',
                                background: entry.present === p
                                  ? p === 'SI' ? 'rgba(16,185,129,0.2)' : p === 'TARDY' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'
                                  : 'rgba(255,255,255,0.04)',
                                borderColor: entry.present === p
                                  ? p === 'SI' ? '#10b981' : p === 'TARDY' ? '#f59e0b' : '#ef4444'
                                  : 'var(--border)',
                                color: entry.present === p
                                  ? p === 'SI' ? '#10b981' : p === 'TARDY' ? '#f59e0b' : '#ef4444'
                                  : 'var(--text-muted)',
                              }}
                              onClick={() => update(idx, 'present', p)}
                            >
                              {p === 'SI' ? 'Present' : p === 'NO' ? 'Absent' : 'Tardy'}
                            </button>
                          ))}
                        </div>

                        {/* Live rate */}
                        {entry.lob === 'SSD' ? (
                          (entry.signed_retainers || 0) > 0 && (
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              Converted: <span style={{ color: '#10b981', fontWeight: 700 }}>{entry.converted_cases}</span>
                              {' / '}Signed: <span style={{ fontWeight: 600 }}>{entry.signed_retainers}</span>
                              {' · '}Rate: <span style={{ color: '#b82105', fontWeight: 700 }}>{rate}</span>
                            </div>
                          )
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                              📑 VA Tracker Live
                            </span>
                            <span>
                              Signed: <strong style={{ color: '#10b981' }}>{entry.signed_retainers || 0}</strong> · Unsigned: <strong style={{ color: '#f59e0b' }}>{entry.unsigned_retainers || 0}</strong> · CRH: <strong style={{ color: '#c084fc' }}>{entry.crh || 0}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Number fields */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                        {fields.map(({ key, label, hint }) => (
                          <div key={key}>
                            <label className="field-label" title={hint}>{label}</label>
                            <input
                              id={`entry-${idx}-${key}`}
                              type="number"
                              min={0}
                              className="input-field"
                              value={entry[key] === 0 ? '' : entry[key]}
                              placeholder="0"
                              onChange={(e) => update(idx, key, parseInt(e.target.value) || 0)}
                              disabled={entry.present === 'NO'}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Submit */}
              <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  id="btn-submit-entry"
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ padding: '12px 28px', fontSize: 15 }}
                >
                  {loading ? 'Saving…' : `Save Entry for ${date}`}
                </button>
                <button type="button" className="btn-secondary" onClick={() => router.push('/dashboard')}>
                  View Dashboard
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Quick Call Import Modal */}
      {showQuickCallModal && (
        <QuickCallImportModal
          onClose={() => setShowQuickCallModal(false)}
          onSuccess={(dateImported, count) => {
            setShowQuickCallModal(false)
            if (dateImported) setDate(dateImported)
            setQuickCallSuccessMsg(`⚡ Successfully processed ${count} calls! Form updated for ${dateImported || date}.`)
            setReloadCounter(prev => prev + 1)
            setTimeout(() => setQuickCallSuccessMsg(''), 5000)
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function QuickCallImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (date: string, count: number) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/call-report/import', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to process call report')
      
      const firstDate = json.agent_summaries?.[0]?.date || ''
      onSuccess(firstDate, json.total_calls_processed || 0)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20
      }}
      onClick={onClose}
    >
      <div
        className="glass-card fade-in"
        style={{ maxWidth: 500, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#60a5fa' }}>⚡ Quick Import CRM Call Report</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 16 }}>
          Upload raw <span style={{ color: '#60a5fa', fontWeight: 700 }}>CallReport.xlsx</span> downloaded from the CRM. 
          The system will automatically correct rep names (e.g. <em>"Daniel Castill"</em> ➔ <strong>Daniel Castillo</strong>), 
          sum <strong>CAPD</strong> and <strong>Inbound</strong> call totals, and populate this form instantly.
        </p>

        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ marginBottom: 20, width: '100%', fontSize: 13, color: '#cbd5e1' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleUpload} disabled={!file || loading}>
            {loading ? 'Processing...' : '⚡ Process & Populate'}
          </button>
        </div>
      </div>
    </div>
  )
}
