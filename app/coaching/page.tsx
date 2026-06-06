'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'

interface CoachingSession {
  id: number
  agent_name: string
  coach_name: string
  session_date: string
  focus_areas: string
  linked_evaluation_id: number | null
  discussion_notes: string | null
  commitments_agent: string | null
  commitments_coach: string | null
  follow_up_date: string | null
  created_at: string
  linked_eval_date?: string | null
  linked_eval_score?: number | null
  linked_eval_call_id?: string | null
}

interface AgentOption {
  id: number
  name: string
  active: number
}

interface EvaluationOption {
  id: number
  agent_name: string
  eval_date: string
  overall_score: number
  call_id: string | null
}

const FOCUS_AREA_OPTIONS = [
  'Objection Handling',
  'Professional Introduction',
  'Eligibility Assessment',
  'Process & Deadline',
  'Documentation in CRM',
  'PK & Policies',
  'Active Listening',
  'Empathy & Tone',
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function CoachingPage() {
  const { data: session } = useSession()
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [evals, setEvals] = useState<EvaluationOption[]>([])
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ── Form State ──
  const [selectedAgent, setSelectedAgent] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedFocus, setSelectedFocus] = useState<string[]>([])
  const [linkedEvalId, setLinkedEvalId] = useState<string>('')
  const [discussionNotes, setDiscussionNotes] = useState('')
  const [commitmentsAgent, setCommitmentsAgent] = useState('')
  const [commitmentsCoach, setCommitmentsCoach] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [formError, setFormError] = useState('')

  // ── Calendar state ──
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)

  const isMaster = (session?.user as any)?.role === 'master'
  const userName = session?.user?.name || ''

  const fetchSessions = () => {
    const url = isMaster ? '/api/coaching' : `/api/coaching?agent=${encodeURIComponent(userName)}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (session) {
      fetchSessions()

      if (isMaster) {
        // Fetch active agents
        fetch('/api/agents')
          .then((r) => r.json())
          .then((data) => setAgents(data.filter((a: AgentOption) => a.active === 1)))
          .catch(() => {})

        // Fetch all evaluations for linking
        fetch('/api/qa')
          .then((r) => r.json())
          .then((data) => setEvals(Array.isArray(data) ? data : []))
          .catch(() => {})
      }
    }
  }, [session, isMaster, userName])

  const handleFocusToggle = (area: string) => {
    setSelectedFocus((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    )
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgent || !sessionDate || selectedFocus.length === 0) {
      setFormError('Please select an agent, session date, and at least one focus area.')
      return
    }

    setSubmitting(true)
    setFormError('')

    try {
      const res = await fetch('/api/coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: selectedAgent,
          session_date: sessionDate,
          focus_areas: selectedFocus,
          linked_evaluation_id: linkedEvalId ? Number(linkedEvalId) : null,
          discussion_notes: discussionNotes,
          commitments_agent: commitmentsAgent,
          commitments_coach: commitmentsCoach,
          follow_up_date: followUpDate || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')

      // Reset form
      setSelectedAgent('')
      setSelectedFocus([])
      setLinkedEvalId('')
      setDiscussionNotes('')
      setCommitmentsAgent('')
      setCommitmentsCoach('')
      setFollowUpDate('')
      setShowForm(false)

      fetchSessions()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSession = async (id: number) => {
    if (!confirm('Are you sure you want to delete this coaching log?')) return
    try {
      const res = await fetch(`/api/coaching?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchSessions()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Filter evaluations list based on selected agent in form
  const filteredEvals = evals.filter((e) => e.agent_name === selectedAgent)

  // ── Month Calendar rendering helper math ──
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const startDay = firstDay.getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const prevMonthTotalDays = new Date(year, month, 0).getDate()

  const handlePrevMonth = () => {
    setCalendarDate(new Date(year, month - 1, 1))
  }
  const handleNextMonth = () => {
    setCalendarDate(new Date(year, month + 1, 1))
  }

  const getCellDateString = (day: number) => {
    const y = year
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Get followups scheduled in viewing month
  const followUpSessionsMap: Record<string, CoachingSession[]> = {}
  sessions.forEach((s) => {
    if (s.follow_up_date) {
      if (!followUpSessionsMap[s.follow_up_date]) {
        followUpSessionsMap[s.follow_up_date] = []
      }
      followUpSessionsMap[s.follow_up_date].push(s)
    }
  })

  // Date differences for alert badge
  const getFollowUpStatusBadge = (dateStr: string | null) => {
    if (!dateStr) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const targetDate = new Date(dateStr + 'T00:00:00')
    const diffTime = targetDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      return (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 4 }}>
          🗓️ Follow-up in {diffDays} day{diffDays !== 1 ? 's' : ''} ({dateStr})
        </span>
      )
    } else if (diffDays === 0) {
      return (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 4 }}>
          ⚠️ Follow-up is TODAY! ({dateStr})
        </span>
      )
    } else {
      const absDays = Math.abs(diffDays)
      return (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '2px 8px', borderRadius: 4 }}>
          🚨 Overdue by {absDays} day{absDays !== 1 ? 's' : ''} ({dateStr})
        </span>
      )
    }
  }

  // Sessions to display (filters by clicked calendar date if active)
  const displayedSessions = selectedCalendarDate
    ? sessions.filter((s) => s.follow_up_date === selectedCalendarDate)
    : sessions

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ flex: 1, marginLeft: 'var(--sidebar-width)', padding: '32px 36px', maxWidth: 1200 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="fade-in" style={{
              fontSize: 22, fontWeight: 800, marginBottom: 6,
              background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              🎯 Coaching Logs & Commitments
            </h1>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              {isMaster ? 'Document regular agent check-ins, commitments, and calendar follow-ups.' : 'Track your logged coaching focus areas, manager commitments, and scheduled reviews.'}
            </p>
          </div>
          {isMaster && (
            <button
              onClick={() => setShowForm(!showForm)}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                transition: 'transform 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              {showForm ? '✕ Close Log Form' : '✏️ Log Coaching Session'}
            </button>
          )}
        </div>

        {/* ── Section A: Log Coaching Session Form (Coaches only) ── */}
        {showForm && isMaster && (
          <div className="glass-card fade-in" style={{ padding: '24px 28px', marginBottom: 24, borderColor: 'rgba(99,102,241,0.25)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: '#e2e8f0' }}>New Coaching Check-in</h3>
            {formError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                ❌ {formError}
              </div>
            )}
            <form onSubmit={handleCreateSession} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Select Agent</label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => { setSelectedAgent(e.target.value); setLinkedEvalId(''); }}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                  >
                    <option value="">Select agent…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Session Date</label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Link to Graded Call (Optional)</label>
                  <select
                    value={linkedEvalId}
                    disabled={!selectedAgent}
                    onChange={(e) => setLinkedEvalId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', opacity: selectedAgent ? 1 : 0.5 }}
                  >
                    <option value="">Select graded call…</option>
                    {filteredEvals.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.eval_date} — Score: {ev.overall_score}% {ev.call_id ? `(${ev.call_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Focus Areas</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {FOCUS_AREA_OPTIONS.map((area) => {
                      const isSelected = selectedFocus.includes(area)
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => handleFocusToggle(area)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 14,
                            fontSize: 11,
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: isSelected ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(255,255,255,0.06)',
                            color: isSelected ? '#fff' : '#94a3b8',
                          }}
                        >
                          {area}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Follow-up Date</label>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Right Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Discussion Notes</label>
                  <textarea
                    value={discussionNotes}
                    onChange={(e) => setDiscussionNotes(e.target.value)}
                    placeholder="Document call issues, coaching notes, performance targets..."
                    rows={4}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Agent Commitments (Actions they will take)</label>
                  <textarea
                    value={commitmentsAgent}
                    onChange={(e) => setCommitmentsAgent(e.target.value)}
                    placeholder="Enter checklist items the agent committed to..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Coach Commitments (Support you will provide)</label>
                  <textarea
                    value={commitmentsCoach}
                    onChange={(e) => setCommitmentsCoach(e.target.value)}
                    placeholder="Enter checklist items you will provide (e.g. side-by-side coaching)..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 20px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? 'Saving...' : '💾 Save Check-in'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          
          {/* ── Left Side: Sessions Feed ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>
                {selectedCalendarDate ? `Sessions Scheduled for ${selectedCalendarDate}` : 'Coaching Feed'}
              </h3>
              {selectedCalendarDate && (
                <button
                  onClick={() => setSelectedCalendarDate(null)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6366f1', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
                >
                  ✕ Clear Calendar Filter
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading coaching sessions...</div>
            ) : displayedSessions.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                <span style={{ fontSize: 32 }}>🎯</span>
                <p style={{ marginTop: 10, fontSize: 13 }}>No coaching check-ins logged yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {displayedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="glass-card fade-in"
                    style={{
                      padding: '20px 24px',
                      borderLeft: '4px solid #6366f1',
                      position: 'relative',
                    }}
                  >
                    {/* Delete action */}
                    {isMaster && (
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        style={{
                          position: 'absolute',
                          top: 16,
                          right: 18,
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseOut={(e) => (e.currentTarget.style.color = '#64748b')}
                      >
                        🗑️
                      </button>
                    )}

                    {/* Metadata Header */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{session.agent_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>·</span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Coach: {session.coach_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>·</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>Date: {session.session_date}</span>
                      {getFollowUpStatusBadge(session.follow_up_date)}
                    </div>

                    {/* Focus Areas */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {session.focus_areas.split(',').map((area) => (
                        <span key={area} style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 8px', borderRadius: 12 }}>
                          {area.trim()}
                        </span>
                      ))}
                    </div>

                    {/* Linked Evaluation */}
                    {session.linked_evaluation_id && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 11,
                        color: '#cbd5e1',
                        marginBottom: 12,
                      }}>
                        <span>📋 Linked Call Grade:</span>
                        <span style={{ fontWeight: 800, color: '#6366f1' }}>{session.linked_eval_score}%</span>
                        <span style={{ color: '#64748b' }}>({session.linked_eval_date})</span>
                        {session.linked_eval_call_id && <span style={{ color: '#94a3b8' }}>Call: {session.linked_eval_call_id}</span>}
                      </div>
                    )}

                    {/* Discussion notes */}
                    {session.discussion_notes && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Discussion Summary</div>
                        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{session.discussion_notes}</div>
                      </div>
                    )}

                    {/* Commitments Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', marginBottom: 6 }}>📝 Agent Commitments</div>
                        {session.commitments_agent ? (
                          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {session.commitments_agent.split('\n').map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                <span style={{ color: '#a78bfa' }}>▪</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>No commitments logged</span>
                        )}
                      </div>

                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 6 }}>🤝 Coach Commitments</div>
                        {session.commitments_coach ? (
                          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {session.commitments_coach.split('\n').map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                <span style={{ color: '#10b981' }}>▪</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>No commitments logged</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right Side: Calendar & Upcoming Alerts ── */}
          <div>
            {/* Calendar Card */}
            <div className="glass-card fade-in" style={{ padding: '20px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button
                  onClick={handlePrevMonth}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                >
                  ◀
                </button>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {MONTH_NAMES[month]} {year}
                </div>
                <button
                  onClick={handleNextMonth}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
                >
                  ▶
                </button>
              </div>

              {/* Day names */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 8 }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <span key={d} style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{d}</span>
                ))}
              </div>

              {/* Month day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {/* Pad previous month */}
                {Array.from({ length: startDay }).map((_, idx) => {
                  const dayVal = prevMonthTotalDays - startDay + idx + 1
                  return (
                    <div
                      key={`prev-${idx}`}
                      style={{
                        height: 34,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.08)',
                        cursor: 'default',
                      }}
                    >
                      {dayVal}
                    </div>
                  )
                })}

                {/* Current month days */}
                {Array.from({ length: totalDays }).map((_, idx) => {
                  const dayVal = idx + 1
                  const cellDateString = getCellDateString(dayVal)
                  const dayFollowUps = followUpSessionsMap[cellDateString] || []
                  const hasFollowUp = dayFollowUps.length > 0
                  const isSelected = selectedCalendarDate === cellDateString

                  return (
                    <div
                      key={`curr-${dayVal}`}
                      onClick={() => hasFollowUp && setSelectedCalendarDate(isSelected ? null : cellDateString)}
                      style={{
                        height: 34,
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: hasFollowUp ? 700 : 500,
                        color: isSelected ? '#fff' : hasFollowUp ? '#6366f1' : '#cbd5e1',
                        background: isSelected ? 'rgba(99,102,241,0.25)' : hasFollowUp ? 'rgba(99,102,241,0.08)' : 'transparent',
                        border: isSelected ? '1px solid #6366f1' : hasFollowUp ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        borderRadius: 6,
                        cursor: hasFollowUp ? 'pointer' : 'default',
                        transition: 'background 0.2s, border 0.2s',
                      }}
                      onMouseOver={(e) => hasFollowUp && !isSelected && (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                      onMouseOut={(e) => hasFollowUp && !isSelected && (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                      title={hasFollowUp ? `${dayFollowUps.length} follow-up(s) scheduled` : ''}
                    >
                      <span>{dayVal}</span>
                      {hasFollowUp && (
                        <span style={{
                          position: 'absolute',
                          bottom: 4,
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: '#6366f1',
                          boxShadow: '0 0 6px #6366f1',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Upcoming Followups Alerts */}
            <div className="glass-card fade-in" style={{ padding: '20px 18px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
                ⏰ Upcoming Reviews
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sessions
                  .filter((s) => s.follow_up_date)
                  .sort((a, b) => new Date(a.follow_up_date!).getTime() - new Date(b.follow_up_date!).getTime())
                  .slice(0, 5)
                  .map((s) => {
                    const statusText = getFollowUpStatusBadge(s.follow_up_date)
                    return (
                      <div
                        key={s.id}
                        style={{
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{s.agent_name}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{s.follow_up_date}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Coach: {s.coach_name}
                        </div>
                        {statusText}
                      </div>
                    )
                  })}
                {sessions.filter((s) => s.follow_up_date).length === 0 && (
                  <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                    No reviews scheduled.
                  </span>
                )}
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  )
}
