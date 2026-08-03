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

interface PipPlan {
  id: number
  agent_name: string
  creator_name: string
  start_date: string
  end_date: string
  target_score: number
  current_avg_score: number | null
  status: string // 'Active', 'Completed - Successful', 'Completed - Unsuccessful'
  check_in_frequency: string | null
  attachment_path: string | null
  notes: string | null
  created_at: string
  evaluations?: {
    id: number
    eval_date: string
    overall_score: number
    call_id: string | null
    tier: string
  }[]
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
  const [hubTab, setHubTab] = useState<'coaching' | 'pip' | 'requests'>('coaching')
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [pipPlans, setPipPlans] = useState<PipPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [pipLoading, setPipLoading] = useState(true)
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [evals, setEvals] = useState<EvaluationOption[]>([])
  
  // ── Requests Tracker State ──
  const [requests, setRequests] = useState<any[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [coachingRequestId, setCoachingRequestId] = useState<number | null>(null)
  const [declineRequestId, setDeclineRequestId] = useState<number | null>(null)
  const [declineNotes, setDeclineNotes] = useState('')
  const [submittingDecline, setSubmittingDecline] = useState(false)

  // ── Toggle Forms ──
  const [showForm, setShowForm] = useState(false)
  const [showPipForm, setShowPipForm] = useState(false)

  // ── Coaching Form State ──
  const [submitting, setSubmitting] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedFocus, setSelectedFocus] = useState<string[]>([])
  const [linkedEvalId, setLinkedEvalId] = useState<string>('')
  const [discussionNotes, setDiscussionNotes] = useState('')
  const [commitmentsAgent, setCommitmentsAgent] = useState('')
  const [commitmentsCoach, setCommitmentsCoach] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [formError, setFormError] = useState('')

  // ── PIP Form State ──
  const [pipSubmitting, setPipSubmitting] = useState(false)
  const [selectedPipAgent, setSelectedPipAgent] = useState('')
  const [pipStartDate, setPipStartDate] = useState(new Date().toISOString().split('T')[0])
  const [pipEndDate, setPipEndDate] = useState('')
  const [pipTargetScore, setPipTargetScore] = useState(80)
  const [pipFrequency, setPipFrequency] = useState('Weekly')
  const [pipNotes, setPipNotes] = useState('')
  const [pipFile, setPipFile] = useState<File | null>(null)
  const [pipFileUploading, setPipFileUploading] = useState(false)
  const [pipFilePath, setPipFilePath] = useState('')
  const [pipFormError, setPipFormError] = useState('')
  const [pipDragging, setPipDragging] = useState(false)

  // ── Calendar state ──
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)

  const userRole = (session?.user as any)?.role || 'regular'
  const userPerms = (session?.user as any)?.permissions
  const isMaster = userRole === 'master' || userRole === 'superadmin' || (userRole === 'admin' && Boolean(userPerms?.canManageCoaching))
  const userName = session?.user?.name || ''

  const fetchSessions = () => {
    const url = isMaster ? '/api/coaching' : `/api/coaching?agent=${encodeURIComponent(userName)}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }

  const fetchPipPlans = () => {
    const url = isMaster ? '/api/pip' : `/api/pip?agent=${encodeURIComponent(userName)}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => setPipPlans(Array.isArray(data) ? data : []))
      .catch(() => setPipPlans([]))
      .finally(() => setPipLoading(false))
  }

  const fetchRequests = () => {
    fetch('/api/coaching/requests')
      .then((r) => r.json())
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setRequestsLoading(false))
  }

  useEffect(() => {
    if (session) {
      fetchSessions()
      fetchPipPlans()
      fetchRequests()

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
          coaching_request_id: coachingRequestId,
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
      setCoachingRequestId(null)
      setShowForm(false)

      fetchSessions()
      fetchRequests()
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

  // ── PIP File Upload ──
  const handlePdfUpload = async (fileToUpload: File) => {
    if (!fileToUpload.name.toLowerCase().endsWith('.pdf')) {
      setPipFormError('Only PDF files are allowed.')
      return
    }
    setPipFile(fileToUpload)
    setPipFileUploading(true)
    setPipFormError('')
    
    const formData = new FormData()
    formData.append('file', fileToUpload)

    try {
      const res = await fetch('/api/pip/upload', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setPipFilePath(json.path)
    } catch (err: any) {
      setPipFormError(err.message)
      setPipFile(null)
    } finally {
      setPipFileUploading(false)
    }
  }

  const handlePipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPipAgent || !pipStartDate || !pipEndDate || !pipTargetScore) {
      setPipFormError('Please select an agent, start date, end date, and target score.')
      return
    }

    setPipSubmitting(true)
    setPipFormError('')

    try {
      const res = await fetch('/api/pip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: selectedPipAgent,
          start_date: pipStartDate,
          end_date: pipEndDate,
          target_score: Number(pipTargetScore),
          check_in_frequency: pipFrequency,
          attachment_path: pipFilePath || null,
          notes: pipNotes,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit')

      // Reset
      setSelectedPipAgent('')
      setPipEndDate('')
      setPipTargetScore(80)
      setPipFrequency('Weekly')
      setPipNotes('')
      setPipFile(null)
      setPipFilePath('')
      setShowPipForm(false)

      fetchPipPlans()
    } catch (err: any) {
      setPipFormError(err.message)
    } finally {
      setPipSubmitting(false)
    }
  }

  const handleUpdatePipStatus = async (id: number, status: string) => {
    try {
      const res = await fetch('/api/pip', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        fetchPipPlans()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeletePip = async (id: number) => {
    if (!confirm('Are you sure you want to delete this PIP plan?')) return
    try {
      const res = await fetch(`/api/pip?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchPipPlans()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleScheduleRequestClick = (request: any) => {
    setSelectedAgent(request.agent_name)
    setSessionDate(request.preferred_date || new Date().toISOString().split('T')[0])
    setLinkedEvalId(request.linked_evaluation_id ? String(request.linked_evaluation_id) : '')
    setSelectedFocus([]) 
    setDiscussionNotes(`Feedback request session. Agent notes: "${request.agent_notes}"`)
    setCoachingRequestId(request.id)
    setShowForm(true)
    setHubTab('coaching')
  }

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (declineRequestId === null || !declineNotes.trim()) return
    setSubmittingDecline(true)
    try {
      const res = await fetch('/api/coaching/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: declineRequestId,
          status: 'Declined',
          coach_notes: declineNotes.trim(),
        }),
      })
      if (res.ok) {
        setDeclineRequestId(null)
        setDeclineNotes('')
        fetchRequests()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmittingDecline(false)
    }
  }

  // Pre-calculate PIP Date ranges
  const setPipPreset = (days: number) => {
    const start = new Date(pipStartDate || new Date())
    const end = new Date(start)
    end.setDate(end.getDate() + days)
    setPipEndDate(end.toISOString().split('T')[0])
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

  // Get pending feedback requests mapped by preferred date
  const pendingRequestsMap: Record<string, any[]> = {}
  requests.forEach((r) => {
    if (r.status === 'Pending' && r.preferred_date) {
      if (!pendingRequestsMap[r.preferred_date]) {
        pendingRequestsMap[r.preferred_date] = []
      }
      pendingRequestsMap[r.preferred_date].push(r)
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

  // Calculate days elapsed for PIP progress bars
  const getPipTimeStats = (startStr: string, endStr: string) => {
    const start = new Date(startStr + 'T00:00:00')
    const end = new Date(endStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const totalDuration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const elapsed = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    const clampedElapsed = Math.max(0, Math.min(totalDuration, elapsed))
    const pct = totalDuration > 0 ? (clampedElapsed / totalDuration) * 100 : 0

    return {
      total: totalDuration,
      elapsed: clampedElapsed,
      pct: Math.round(pct),
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
        
        {/* Navigation Tabs at Top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => setHubTab('coaching')}
              style={{
                background: 'transparent',
                border: 'none',
                color: hubTab === 'coaching' ? '#b82105' : '#64748b',
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 12px',
                cursor: 'pointer',
                borderBottom: hubTab === 'coaching' ? '2px solid #b82105' : 'none',
                transition: 'color 0.2s',
              }}
            >
              🎯 Coaching Tracker
            </button>
            <button
              onClick={() => setHubTab('pip')}
              style={{
                background: 'transparent',
                border: 'none',
                color: hubTab === 'pip' ? '#ec4899' : '#64748b',
                fontSize: 15,
                fontWeight: 800,
                padding: '6px 12px',
                cursor: 'pointer',
                borderBottom: hubTab === 'pip' ? '2px solid #ec4899' : 'none',
                transition: 'color 0.2s',
              }}
            >
              📈 PIP Plans Pipeline
            </button>
            {isMaster && (
              <button
                onClick={() => setHubTab('requests')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: hubTab === 'requests' ? '#f59e0b' : '#64748b',
                  fontSize: 15,
                  fontWeight: 800,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderBottom: hubTab === 'requests' ? '2px solid #f59e0b' : 'none',
                  transition: 'color 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>🙋‍♂️ Feedback Requests</span>
                {requests.filter(r => r.status === 'Pending').length > 0 && (
                  <span style={{
                    background: '#f59e0b',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: '50%',
                    minWidth: 18,
                    height: 18,
                    padding: '0 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {requests.filter(r => r.status === 'Pending').length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Action button corresponding to active tab */}
          {isMaster && (
            hubTab === 'coaching' ? (
              <button
                onClick={() => setShowForm(!showForm)}
                style={{
                  background: 'linear-gradient(135deg, #b82105, #4f46e5)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {showForm ? '✕ Close Form' : '✏️ Log Coaching Check-in'}
              </button>
            ) : hubTab === 'pip' ? (
              <button
                onClick={() => setShowPipForm(!showPipForm)}
                style={{
                  background: 'linear-gradient(135deg, #ec4899, #db2777)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {showPipForm ? '✕ Close Form' : ' Initiate PIP Plan'}
              </button>
            ) : null
          )}
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* 💡 VIEW 1: COACHING TRACKER                     */}
        {/* ═══════════════════════════════════════════════ */}
        {hubTab === 'coaching' && (
          <>
            {/* Log Coaching Form */}
            {showForm && isMaster && (
              <div className="glass-card fade-in" style={{ padding: '24px 28px', marginBottom: 24, borderColor: 'rgba(184, 33, 5, 0.25)' }}>
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
                                background: isSelected ? 'linear-gradient(135deg, #b82105, #4f46e5)' : 'rgba(255,255,255,0.06)',
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
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Agent Commitments</label>
                      <textarea
                        value={commitmentsAgent}
                        onChange={(e) => setCommitmentsAgent(e.target.value)}
                        placeholder="Enter checklist items the agent committed to..."
                        rows={3}
                        style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Coach Commitments</label>
                      <textarea
                        value={commitmentsCoach}
                        onChange={(e) => setCommitmentsCoach(e.target.value)}
                        placeholder="Enter checklist support you will provide..."
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
              {/* Left Side: Sessions Feed */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {selectedCalendarDate ? `Sessions Scheduled for ${selectedCalendarDate}` : 'Coaching Feed'}
                  </h3>
                  {selectedCalendarDate && (
                    <button
                      onClick={() => setSelectedCalendarDate(null)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#b82105', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
                    >
                      ✕ Clear Calendar Filter
                    </button>
                  )}
                </div>

                {selectedCalendarDate && pendingRequestsMap[selectedCalendarDate]?.length > 0 && (
                  <div className="glass-card fade-in" style={{ padding: '16px 20px', marginBottom: 20, borderColor: 'rgba(245, 158, 11, 0.35)', background: 'rgba(245, 158, 11, 0.02)' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🙋‍♂️ Feedback Requests for {selectedCalendarDate}</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pendingRequestsMap[selectedCalendarDate].map((req: any) => (
                        <div key={req.id} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', padding: 12, borderRadius: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{req.agent_name}</span>
                            {req.linked_eval_score && (
                              <span style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                QA Score: {req.linked_eval_score}%
                              </span>
                            )}
                          </div>
                          <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8, fontStyle: 'italic' }}>
                            "{req.agent_notes}"
                          </p>
                          {isMaster && (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setDeclineRequestId(req.id)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Decline
                              </button>
                              <button
                                onClick={() => handleScheduleRequestClick(req)}
                                style={{
                                  background: 'linear-gradient(135deg, #b82105, #4f46e5)',
                                  color: '#fff',
                                  border: 'none',
                                  padding: '4px 12px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Schedule Session
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                          borderLeft: '4px solid #b82105',
                          position: 'relative',
                        }}
                      >
                        {isMaster && (
                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            style={{ position: 'absolute', top: 16, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}
                          >
                            🗑️
                          </button>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{session.agent_name}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>·</span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>Coach: {session.coach_name}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>·</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>Date: {session.session_date}</span>
                          {getFollowUpStatusBadge(session.follow_up_date)}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {session.focus_areas.split(',').map((area) => (
                            <span key={area} style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 8px', borderRadius: 12 }}>
                              {area.trim()}
                            </span>
                          ))}
                        </div>

                        {session.linked_evaluation_id && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#cbd5e1', marginBottom: 12 }}>
                            <span>📋 Linked Call Grade:</span>
                            <span style={{ fontWeight: 800, color: '#b82105' }}>{session.linked_eval_score}%</span>
                            <span style={{ color: '#64748b' }}>({session.linked_eval_date})</span>
                            {session.linked_eval_call_id && <span style={{ color: '#94a3b8' }}>Call: {session.linked_eval_call_id}</span>}
                          </div>
                        )}

                        {session.discussion_notes && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Discussion Summary</div>
                            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{session.discussion_notes}</div>
                          </div>
                        )}

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

              {/* Right Side: Calendar & Alerts */}
              <div>
                <div className="glass-card fade-in" style={{ padding: '20px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <button onClick={handlePrevMonth} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>◀</button>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{MONTH_NAMES[month]} {year}</div>
                    <button onClick={handleNextMonth} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>▶</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 8 }}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                      <span key={d} style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{d}</span>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {Array.from({ length: startDay }).map((_, idx) => {
                      const dayVal = prevMonthTotalDays - startDay + idx + 1
                      return (
                        <div key={`prev-${idx}`} style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(255,255,255,0.08)', cursor: 'default' }}>{dayVal}</div>
                      )
                    })}
                    {Array.from({ length: totalDays }).map((_, idx) => {
                      const dayVal = idx + 1
                      const cellDateString = getCellDateString(dayVal)
                      const dayFollowUps = followUpSessionsMap[cellDateString] || []
                      const hasFollowUp = dayFollowUps.length > 0
                      const dayPendingRequests = pendingRequestsMap[cellDateString] || []
                      const hasPendingRequest = dayPendingRequests.length > 0
                      const isClickable = hasFollowUp || hasPendingRequest
                      const isSelected = selectedCalendarDate === cellDateString
                      return (
                        <div
                          key={`curr-${dayVal}`}
                          onClick={() => isClickable && setSelectedCalendarDate(isSelected ? null : cellDateString)}
                          style={{
                            height: 34, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                            fontWeight: isClickable ? 700 : 500, color: isSelected ? '#fff' : hasFollowUp ? '#b82105' : hasPendingRequest ? '#f59e0b' : '#cbd5e1',
                            background: isSelected ? 'rgba(184, 33, 5, 0.25)' : hasFollowUp ? 'rgba(184, 33, 5, 0.08)' : hasPendingRequest ? 'rgba(245,158,11,0.05)' : 'transparent',
                            border: isSelected ? '1px solid #b82105' : hasPendingRequest ? '1px solid rgba(245,158,11,0.3)' : hasFollowUp ? '1px solid rgba(184, 33, 5, 0.2)' : '1px solid transparent',
                            borderRadius: 6, cursor: isClickable ? 'pointer' : 'default', transition: 'background 0.2s, border 0.2s'
                          }}
                          onMouseOver={(e) => isClickable && !isSelected && (e.currentTarget.style.background = 'rgba(184, 33, 5, 0.15)')}
                          onMouseOut={(e) => isClickable && !isSelected && (e.currentTarget.style.background = hasFollowUp ? 'rgba(184, 33, 5, 0.08)' : hasPendingRequest ? 'rgba(245,158,11,0.05)' : 'transparent')}
                        >
                          <span>{dayVal}</span>
                          {hasFollowUp && (
                            <span style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: '50%', background: '#b82105', boxShadow: '0 0 6px #b82105' }} />
                          )}
                          {hasPendingRequest && (
                            <span style={{ position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }} title={`${dayPendingRequests.length} pending request(s)`} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="glass-card fade-in" style={{ padding: '20px 18px' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>⏰ Upcoming Reviews</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sessions
                      .filter((s) => s.follow_up_date)
                      .sort((a, b) => new Date(a.follow_up_date!).getTime() - new Date(b.follow_up_date!).getTime())
                      .slice(0, 5)
                      .map((s) => (
                        <div key={s.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{s.agent_name}</span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{s.follow_up_date}</span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Coach: {s.coach_name}</div>
                          {getFollowUpStatusBadge(s.follow_up_date)}
                        </div>
                      ))}
                    {sessions.filter((s) => s.follow_up_date).length === 0 && (
                      <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>No reviews scheduled.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* 💡 VIEW 2: PIP PLANS PIPELINE                   */}
        {/* ═══════════════════════════════════════════════ */}
        {hubTab === 'pip' && (
          <>
            {/* Initiate PIP Form */}
            {showPipForm && isMaster && (
              <div className="glass-card fade-in" style={{ padding: '24px 28px', marginBottom: 24, borderColor: 'rgba(236,72,153,0.25)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: '#e2e8f0' }}>Initiate Performance Improvement Plan (PIP)</h3>
                {pipFormError && (
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                    ❌ {pipFormError}
                  </div>
                )}
                <form onSubmit={handlePipSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  
                  {/* Left panel inputs */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Select Agent</label>
                      <select
                        value={selectedPipAgent}
                        onChange={(e) => setSelectedPipAgent(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                      >
                        <option value="">Select agent…</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Start Date</label>
                        <input
                          type="date"
                          value={pipStartDate}
                          onChange={(e) => setPipStartDate(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>End Date</label>
                        <input
                          type="date"
                          value={pipEndDate}
                          onChange={(e) => setPipEndDate(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                        />
                      </div>
                    </div>

                    {/* Timeline Presets */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Timeline Presets</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[
                          { days: 30, label: '30 Days' },
                          { days: 45, label: '45 Days' },
                          { days: 60, label: '60 Days' },
                        ].map((preset) => (
                          <button
                            key={preset.days}
                            type="button"
                            onClick={() => setPipPreset(preset.days)}
                            style={{
                              flex: 1, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                              color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Target QA Score</label>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ec4899' }}>{pipTargetScore}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="95"
                        value={pipTargetScore}
                        onChange={(e) => setPipTargetScore(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#ec4899' }}
                      />
                    </div>
                  </div>

                  {/* Right panel inputs */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Check-in Frequency</label>
                        <select
                          value={pipFrequency}
                          onChange={(e) => setPipFrequency(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                        >
                          <option value="Weekly">Weekly</option>
                          <option value="Bi-weekly">Bi-weekly</option>
                          <option value="Monthly">Monthly</option>
                        </select>
                      </div>
                    </div>

                    {/* PDF Uploader */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Upload Signed PIP Document (PDF)</label>
                      <div
                        onDragOver={(e) => { e.preventDefault(); setPipDragging(true); }}
                        onDragLeave={() => setPipDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setPipDragging(false);
                          const f = e.dataTransfer.files[0];
                          if (f) handlePdfUpload(f);
                        }}
                        onClick={() => document.getElementById('pip-file-input')?.click()}
                        style={{
                          border: '2px dashed rgba(255,255,255,0.15)',
                          borderRadius: 8,
                          padding: '16px 20px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: pipDragging ? 'rgba(236,72,153,0.05)' : 'rgba(0,0,0,0.15)',
                          borderColor: pipDragging ? '#ec4899' : pipFilePath ? '#10b981' : 'rgba(255,255,255,0.15)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <input
                          id="pip-file-input"
                          type="file"
                          accept=".pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => e.target.files?.[0] && handlePdfUpload(e.target.files[0])}
                        />
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{pipFilePath ? '✅' : '📄'}</div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: pipFilePath ? '#10b981' : '#cbd5e1' }}>
                          {pipFileUploading ? 'Uploading PDF...' : pipFilePath ? `${pipFile?.name || 'document.pdf'} uploaded!` : 'Drag & drop signed PDF here or click to browse'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>PIP Notes & Strategy</label>
                      <textarea
                        value={pipNotes}
                        onChange={(e) => setPipNotes(e.target.value)}
                        placeholder="Detail performance goals, specific targets, check-in schedules, commitments..."
                        rows={3}
                        style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => setShowPipForm(false)}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={pipSubmitting || pipFileUploading}
                        style={{
                          background: 'linear-gradient(135deg, #ec4899, #db2777)',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 20px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          opacity: (pipSubmitting || pipFileUploading) ? 0.6 : 1,
                        }}
                      >
                        {pipSubmitting ? 'Initiating...' : ' Initiate PIP'}
                      </button>
                    </div>
                  </div>

                </form>
              </div>
            )}

            {/* PIP Plans List */}
            {pipLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading PIP plans...</div>
            ) : pipPlans.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                <span style={{ fontSize: 32 }}>📈</span>
                <p style={{ marginTop: 10, fontSize: 13 }}>No active or past PIP plans recorded.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {pipPlans.map((plan) => {
                  const timeStats = getPipTimeStats(plan.start_date, plan.end_date)
                  const isCurrentTargetMet = plan.current_avg_score != null && plan.current_avg_score >= plan.target_score
                  const elapsedPercent = timeStats.pct

                  return (
                    <div
                      key={plan.id}
                      className="glass-card fade-in"
                      style={{
                        padding: '24px 28px',
                        borderLeft: `4px solid ${plan.status === 'Active' ? '#f59e0b' : plan.status.includes('Successful') ? '#10b981' : '#ef4444'}`,
                        position: 'relative',
                      }}
                    >
                      {/* Delete button */}
                      {isMaster && (
                        <button
                          onClick={() => handleDeletePip(plan.id)}
                          style={{ position: 'absolute', top: 16, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}
                        >
                          🗑️
                        </button>
                      )}

                      {/* Header metadata */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{plan.agent_name}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: plan.status === 'Active' ? '#f59e0b' : plan.status.includes('Successful') ? '#10b981' : '#ef4444',
                          background: `${plan.status === 'Active' ? '#f59e0b' : plan.status.includes('Successful') ? '#10b981' : '#ef4444'}15`,
                          padding: '2px 8px', borderRadius: 4
                        }}>
                          {plan.status}
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Initiated by {plan.creator_name}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Timeline: {plan.start_date} to {plan.end_date}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Frequency: {plan.check_in_frequency || 'Weekly'}</span>
                      </div>

                      {/* Grid Progress Visualizers */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28, marginBottom: 20 }}>
                        {/* Progress metric bars */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          
                          {/* Time progress bar */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                              <span>PIP Time Duration</span>
                              <span style={{ fontWeight: 700 }}>Day {timeStats.elapsed} of {timeStats.total} ({elapsedPercent}% Elapsed)</span>
                            </div>
                            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', width: `${elapsedPercent}%`,
                                background: `linear-gradient(90deg, ${plan.status === 'Active' ? '#f59e0b' : plan.status.includes('Successful') ? '#10b981' : '#ef4444'}, #b82105)`,
                                borderRadius: 4
                              }} />
                            </div>
                          </div>

                          {/* Notes */}
                          {plan.notes && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Plan Objectives</div>
                              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{plan.notes}</div>
                            </div>
                          )}

                          {/* PDF attachment button */}
                          {plan.attachment_path && (
                            <div style={{ marginTop: 6 }}>
                              <a
                                href={plan.attachment_path}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 8,
                                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: 6, padding: '8px 14px', fontSize: 12, color: '#fff',
                                  fontWeight: 700, textDecoration: 'none', transition: 'background 0.2s'
                                }}
                                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                                onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                              >
                                📄 Open Signed PIP Document (PDF)
                              </a>
                            </div>
                          )}

                        </div>

                        {/* Current vs Target Gauge panel */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: 12, padding: '14px 20px'
                          }}>
                            <div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Target average QA</div>
                              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{plan.target_score}%</div>
                            </div>
                            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)' }} />
                            <div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Current PIP average</div>
                              <div style={{ fontSize: 22, fontWeight: 800, color: plan.current_avg_score != null ? (isCurrentTargetMet ? '#10b981' : '#ef4444') : '#64748b' }}>
                                {plan.current_avg_score != null ? `${plan.current_avg_score}%` : 'N/A'}
                              </div>
                            </div>
                          </div>

                          {/* Metric status text */}
                          {plan.current_avg_score != null && (
                            <div style={{
                              fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center',
                              color: isCurrentTargetMet ? '#10b981' : '#f59e0b'
                            }}>
                              <span>{isCurrentTargetMet ? '✅ Matching target score requirement!' : '⚠️ Below target requirement. Focus coaching needed.'}</span>
                            </div>
                          )}

                          {/* Evaluation log during PIP */}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Evaluations during PIP period</div>
                            {plan.evaluations && plan.evaluations.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                                {plan.evaluations.map((ev) => (
                                  <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                                      <span style={{ fontWeight: 700, color: ev.overall_score >= plan.target_score ? '#10b981' : '#ef4444' }}>{ev.overall_score}%</span>
                                      <span style={{ color: '#94a3b8' }}>{ev.eval_date}</span>
                                    </div>
                                    <span style={{ fontSize: 10, color: '#64748b' }}>{ev.call_id || 'No Call ID'}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>No call grades recorded within dates.</span>
                            )}
                          </div>

                        </div>
                      </div>

                      {/* Coach Action Bar */}
                      {isMaster && plan.status === 'Active' && (
                        <div style={{
                          display: 'flex', gap: 10, justifyContent: 'flex-end',
                          borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14, marginTop: 14
                        }}>
                          <button
                            onClick={() => handleUpdatePipStatus(plan.id, 'Completed - Successful')}
                            style={{
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6,
                              fontSize: 11, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            Mark Successful Completion
                          </button>
                          <button
                            onClick={() => handleUpdatePipStatus(plan.id, 'Completed - Unsuccessful')}
                            style={{
                              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                              color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6,
                              fontSize: 11, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            Mark Unsuccessful
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* 💡 VIEW 3: FEEDBACK REQUESTS                     */}
        {/* ═══════════════════════════════════════════════ */}
        {hubTab === 'requests' && isMaster && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Agent Feedback Requests</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Manage requests for feedback sessions submitted by agents from their QA evaluations.
                </p>
              </div>
            </div>

            {requestsLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading feedback requests...</div>
            ) : requests.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                <span style={{ fontSize: 32 }}>🙋‍♂️</span>
                <p style={{ marginTop: 10, fontSize: 13 }}>No feedback requests submitted yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {requests.map((request) => (
                  <div
                    key={request.id}
                    className="glass-card fade-in"
                    style={{
                      padding: '20px 24px',
                      borderLeft: `4px solid ${
                        request.status === 'Completed' ? '#10b981' : request.status === 'Scheduled' ? '#b82105' : request.status === 'Declined' ? '#ef4444' : '#f59e0b'
                      }`,
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{request.agent_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>·</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Requested: {new Date(request.requested_at).toLocaleDateString()}
                      </span>
                      {request.preferred_date && (
                        <>
                          <span style={{ fontSize: 11, color: '#64748b' }}>·</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa' }}>
                            Preferred Date: {request.preferred_date}
                          </span>
                        </>
                      )}
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: request.status === 'Completed' ? '#10b981' : request.status === 'Scheduled' ? '#b82105' : request.status === 'Declined' ? '#ef4444' : '#f59e0b',
                        background: `${request.status === 'Completed' ? '#10b981' : request.status === 'Scheduled' ? '#b82105' : request.status === 'Declined' ? '#ef4444' : '#f59e0b'}20`,
                        padding: '2px 8px',
                        borderRadius: 4,
                        marginLeft: 'auto'
                      }}>
                        {request.status.toUpperCase()}
                      </span>
                    </div>

                    {request.linked_evaluation_id && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#cbd5e1', marginBottom: 12 }}>
                        <span>📋 Linked Evaluation:</span>
                        <span style={{ fontWeight: 800, color: '#b82105' }}>{request.linked_eval_score}%</span>
                        <span style={{ color: '#64748b' }}>({request.linked_eval_date})</span>
                        {request.linked_eval_call_id && <span style={{ color: '#94a3b8' }}>Call: {request.linked_eval_call_id}</span>}
                      </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Agent Request Notes</div>
                      <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        "{request.agent_notes}"
                      </div>
                    </div>

                    {request.coach_notes && (
                      <div style={{
                        marginBottom: 14,
                        padding: '10px 14px',
                        background: request.status === 'Declined' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(184, 33, 5, 0.05)',
                        border: '1px solid ' + (request.status === 'Declined' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(184, 33, 5, 0.15)'),
                        borderRadius: 8,
                        fontSize: 12,
                        color: request.status === 'Declined' ? '#fca5a5' : '#a5b4fc',
                      }}>
                        <strong>Coach Response:</strong> "{request.coach_notes}"
                      </div>
                    )}

                    {request.status === 'Pending' && (
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                        <button
                          onClick={() => setDeclineRequestId(request.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '6px 14px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ❌ Decline Request
                        </button>
                        <button
                          onClick={() => handleScheduleRequestClick(request)}
                          style={{
                            background: 'linear-gradient(135deg, #b82105, #4f46e5)',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          📅 Schedule Session
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {declineRequestId !== null && (
        <div
          onClick={() => setDeclineRequestId(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(5, 11, 24, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{
              padding: '24px 28px',
              maxWidth: 480,
              width: '90%',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              background: 'rgba(10, 22, 40, 0.95)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>❌ Decline Feedback Request</h3>
              <button
                onClick={() => setDeclineRequestId(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDeclineSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                  Decline Reason / Notes for Agent *
                </label>
                <textarea
                  required
                  value={declineNotes}
                  onChange={(e) => setDeclineNotes(e.target.value)}
                  placeholder="Explain to the agent why this request is being declined (e.g. feedback already covered, scheduled elsewhere, etc.). This will be sent to the agent."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setDeclineRequestId(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDecline || !declineNotes.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: submittingDecline || !declineNotes.trim() ? 0.6 : 1,
                  }}
                >
                  {submittingDecline ? 'Declining...' : 'Decline Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
