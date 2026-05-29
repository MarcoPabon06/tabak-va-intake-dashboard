'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { format } from 'date-fns'

const CURRENT_AGENTS = [
  'Daniel Castillo',
  'Adriana Soto',
  'Oliver Ortega',
  'Alejandra NicoleReyes',
  'Omar Soto',
]

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#6366f1',
  'Adriana Soto': '#ec4899',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f59e0b',
  'Omar Soto': '#3b82f6',
}

interface AgentEntry {
  agent_name: string
  present: string
  capd: number
  inbound_calls: number
  case_rejected: number
  crh: number
  signed_retainers: number
  unsigned_retainers: number
  ura: number
  reprocess: number
}

function emptyEntry(agent: string): AgentEntry {
  return {
    agent_name: agent,
    present: 'SI',
    capd: 0,
    inbound_calls: 0,
    case_rejected: 0,
    crh: 0,
    signed_retainers: 0,
    unsigned_retainers: 0,
    ura: 0,
    reprocess: 0,
  }
}

export default function EntryPage() {
  const router = useRouter()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(today)
  const [entries, setEntries] = useState<AgentEntry[]>(CURRENT_AGENTS.map(emptyEntry))
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  function update(agentIdx: number, field: keyof AgentEntry, value: any) {
    setEntries((prev) => {
      const next = [...prev]
      next[agentIdx] = { ...next[agentIdx], [field]: value }
      return next
    })
  }

  function getTotal(e: AgentEntry) {
    return (e.signed_retainers || 0) + (e.unsigned_retainers || 0)
  }

  function getRate(e: AgentEntry) {
    const total = getTotal(e)
    if (total === 0) return '—'
    return ((e.signed_retainers / total) * 100).toFixed(1) + '%'
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
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setEntries(CURRENT_AGENTS.map(emptyEntry))
    setDate(today)
    setError('')
    setSuccess(false)
  }

  const numFields = [
    { key: 'capd', label: 'CAPD', hint: 'Calls made' },
    { key: 'inbound_calls', label: 'Inbound', hint: 'Inbound calls' },
    { key: 'case_rejected', label: 'Rejected', hint: 'Cases rejected' },
    { key: 'crh', label: 'CRH', hint: 'Client Refused Help' },
    { key: 'signed_retainers', label: 'Signed', hint: 'Signed retainers' },
    { key: 'unsigned_retainers', label: 'Unsigned', hint: 'Unsigned retainers' },
    { key: 'ura', label: 'URA', hint: 'Unnecessary Req. Assistance' },
    { key: 'reprocess', label: 'Reprocess', hint: 'Times reprocessed' },
  ] as const

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 1100 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Daily Entry</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Log today's performance metrics for all agents</p>
          </div>

          {/* Date picker */}
          <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button id="btn-reset" type="button" className="btn-secondary" onClick={resetForm}>Reset</button>
            </div>
          </div>

          {/* Success/Error */}
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

          {/* Entry form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {entries.map((entry, idx) => {
                const color = AGENT_COLORS[entry.agent_name] || '#6366f1'
                const rate = getRate(entry)
                const total = getTotal(entry)
                return (
                  <div key={entry.agent_name} className="glass-card" style={{ padding: '16px 20px' }}>
                    {/* Agent header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{entry.agent_name}</span>
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
                      {total > 0 && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          Signed: <span style={{ color: '#10b981', fontWeight: 700 }}>{entry.signed_retainers}</span>
                          {' / '}Total: <span style={{ fontWeight: 600 }}>{total}</span>
                          {' · '}Rate: <span style={{ color: '#6366f1', fontWeight: 700 }}>{rate}</span>
                        </div>
                      )}
                    </div>

                    {/* Number fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                      {numFields.map(({ key, label, hint }) => (
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
        </div>
      </main>
    </div>
  )
}
