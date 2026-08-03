'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'

interface TimeOffRequest {
  id: number
  username: string
  agent_name: string
  lob: string
  start_date: string
  end_date: string
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
  reviewed_by?: string
  reviewed_at?: string
  manager_notes?: string
  created_at: string
}

interface ActiveSpecialist {
  username: string
  display_name: string
  lob: 'VA' | 'SSD'
}

export default function TimeOffPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userRole = (session?.user as any)?.role || 'regular'
  const userPerms = (session?.user as any)?.permissions
  const userLob = (session?.user as any)?.lob || 'VA'
  const username = session?.user?.name || ''

  const isManager = userRole === 'master' || userRole === 'superadmin' || (userRole === 'admin' && Boolean(userPerms?.canViewTimeOff || userPerms?.canApproveTimeOff))
  const canApprove = userRole === 'master' || userRole === 'superadmin' || (userRole === 'admin' && Boolean(userPerms?.canApproveTimeOff))

  // Common State
  const [activeTab, setActiveTab] = useState<'calendar' | 'pending' | 'history' | 'request'>('request')
  const [requests, setRequests] = useState<TimeOffRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reloadCounter, setReloadCounter] = useState(0)

  // Specialist Form State
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Specialist Edit State
  const [editingRequest, setEditingRequest] = useState<TimeOffRequest | null>(null)
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Manager & Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedLobFilter, setSelectedLobFilter] = useState<'All' | 'VA' | 'SSD'>('All')
  const [activeSpecialists, setActiveSpecialists] = useState<ActiveSpecialist[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  
  // Manager inline notes
  const [managerNotes, setManagerNotes] = useState('')
  const [reviewingId, setReviewingId] = useState<number | null>(null)

  // Sync state on load
  useEffect(() => {
    if (session?.user && isManager) {
      setSelectedLobFilter('All')
      setActiveTab('calendar')
    } else if (session?.user) {
      setSelectedLobFilter(userLob as any)
      setActiveTab('request')
    }
  }, [session, isManager, userLob])

  // Fetch requests and coverage metadata for calendar
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError('')
      try {
        // Fetch requests history
        const resRequests = await fetch('/api/time-off')
        if (!resRequests.ok) throw new Error('Failed to fetch requests')
        const dataRequests = await resRequests.json()
        setRequests(dataRequests)

        // Fetch coverage metadata for both regular and master users
        const monthStr = format(currentMonth, 'yyyy-MM')
        const resCoverage = await fetch(`/api/time-off/coverage?month=${monthStr}`)
        if (!resCoverage.ok) throw new Error('Failed to fetch coverage info')
        const dataCoverage = await resCoverage.json()
        setActiveSpecialists(dataCoverage.activeSpecialists || [])
      } catch (err: any) {
        setError(err.message || 'An error occurred while loading data.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [reloadCounter, currentMonth, userRole])

  // Handle Request Submit (Specialist New Request)
  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    
    if (!startDate || !endDate) {
      setError('Please select both start and end dates.')
      return
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (startDate < todayStr) {
      setError('Start date cannot be in the past.')
      return
    }

    if (startDate > endDate) {
      setError('Start date cannot be after end date.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to submit request')
      
      setSuccess('Time off request submitted successfully!')
      setStartDate('')
      setEndDate('')
      setReason('')
      setReloadCounter(prev => prev + 1)
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Open Edit Modal
  function openEditModal(req: TimeOffRequest) {
    setEditingRequest(req)
    setEditStartDate(req.start_date)
    setEditEndDate(req.end_date)
    setEditReason(req.reason || '')
  }

  // Handle Request Edit Submit (Specialist Modify Request)
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingRequest) return
    setError('')
    setSuccess('')

    if (!editStartDate || !editEndDate) {
      setError('Please select both start and end dates.')
      return
    }

    if (editStartDate > editEndDate) {
      setError('Start date cannot be after end date.')
      return
    }

    setEditSubmitting(true)
    try {
      const res = await fetch('/api/time-off', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRequest.id,
          start_date: editStartDate,
          end_date: editEndDate,
          reason: editReason
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update request')
      
      const statusNotice = json.status === 'Pending' ? ' (Status set to Pending for manager re-approval).' : ''
      setSuccess(`Request updated successfully!${statusNotice}`)
      setEditingRequest(null)
      setReloadCounter(prev => prev + 1)
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  // Handle Request Cancel (Specialist or Manager)
  async function handleRequestCancel(id: number, currentStatus: string) {
    const isApproved = currentStatus === 'Approved'
    const confirmMsg = isApproved
      ? 'Are you sure you want to cancel this approved time off request? It will remain in your history log as Cancelled, and managers will be notified.'
      : 'Are you sure you want to cancel this time off request?'

    if (!confirm(confirmMsg)) return
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/time-off?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to cancel request')
      }
      setSuccess('Request canceled successfully.')
      setReloadCounter(prev => prev + 1)
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Handle Request Approval / Rejection (Manager)
  async function handleReviewSubmit(id: number, status: 'Approved' | 'Rejected') {
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/time-off', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, manager_notes: managerNotes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update request')

      setSuccess(`Request successfully ${status.toLowerCase()}!`)
      setReloadCounter(prev => prev + 1)
      setReviewingId(null)
      setManagerNotes('')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Calculate Coverage Health for a specific date
  function getDayCoverageMetrics(date: Date, lob: 'VA' | 'SSD') {
    const dateStr = format(date, 'yyyy-MM-dd')
    
    // Filter active specialists for LOB
    const specialistsInLob = activeSpecialists.filter(s => s.lob === lob)
    const totalCount = specialistsInLob.length

    if (totalCount === 0) return { total: 0, off: 0, pending: 0, working: 0, pct: 100, status: 'green' }

    // Count approved off for this date
    const approvedOff = requests.filter(r => 
      r.lob === lob && 
      r.status === 'Approved' && 
      r.start_date <= dateStr && 
      r.end_date >= dateStr
    )
    const offCount = approvedOff.length

    // Count pending off for this date
    const pendingOff = requests.filter(r => 
      r.lob === lob && 
      r.status === 'Pending' && 
      r.start_date <= dateStr && 
      r.end_date >= dateStr
    )
    const pendingCount = pendingOff.length

    const workingCount = totalCount - offCount
    const pct = Math.round((workingCount / totalCount) * 100)

    let healthStatus = 'green'
    if (pct < 60) {
      healthStatus = 'red'
    } else if (pct < 80) {
      healthStatus = 'yellow'
    }

    return {
      total: totalCount,
      off: offCount,
      pending: pendingCount,
      working: workingCount,
      pct,
      status: healthStatus
    }
  }

  // Render Calendar Cells
  function renderCalendar() {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const dateInterval = eachDayOfInterval({ start: monthStart, end: monthEnd })
    
    // Day of week offset for padding
    const startDayOfWeek = monthStart.getDay() // 0 = Sunday, 1 = Monday, etc.
    const paddingCells = Array.from({ length: startDayOfWeek })

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {/* Days of week headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontWeight: 700, padding: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            {d}
          </div>
        ))}

        {/* Empty padding cells */}
        {paddingCells.map((_, i) => (
          <div key={`pad-${i}`} style={{ background: 'rgba(255, 255, 255, 0.01)', borderRadius: 10, minHeight: 90 }} />
        ))}

        {/* Calendar days */}
        {dateInterval.map(day => {
          const isToday = isSameDay(day, new Date())
          const isSelected = selectedDay && isSameDay(day, selectedDay)
          const va = getDayCoverageMetrics(day, 'VA')
          const ssd = getDayCoverageMetrics(day, 'SSD')

          // Determine day's background color indicator based on filter LOB
          let dayStatus = 'green'
          if (selectedLobFilter === 'All') {
            if (va.status === 'red' || ssd.status === 'red') dayStatus = 'red'
            else if (va.status === 'yellow' || ssd.status === 'yellow') dayStatus = 'yellow'
          } else if (selectedLobFilter === 'VA') {
            dayStatus = va.status
          } else {
            dayStatus = ssd.status
          }

          let statusBorder = 'rgba(255, 255, 255, 0.06)'
          let statusBg = 'rgba(255, 255, 255, 0.02)'
          
          if (dayStatus === 'red') {
            statusBorder = 'rgba(239, 68, 68, 0.4)'
            statusBg = 'rgba(239, 68, 68, 0.06)'
          } else if (dayStatus === 'yellow') {
            statusBorder = 'rgba(245, 158, 11, 0.4)'
            statusBg = 'rgba(245, 158, 11, 0.06)'
          } else {
            statusBorder = 'rgba(16, 185, 129, 0.2)'
            statusBg = 'rgba(16, 185, 129, 0.02)'
          }

          return (
            <div
              key={day.toString()}
              onClick={() => setSelectedDay(day)}
              className="calendar-day-card"
              style={{
                minHeight: 95,
                padding: '10px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                background: isSelected ? 'rgba(184, 33, 5, 0.15)' : statusBg,
                border: isSelected 
                  ? '2px solid #b82105' 
                  : isToday 
                    ? '2px solid rgba(255, 255, 255, 0.4)' 
                    : `1px solid ${statusBorder}`,
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isSelected ? '0 0 15px rgba(184, 33, 5, 0.3)' : 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: isToday ? '#fff' : 'var(--text-secondary)' }}>
                  {format(day, 'd')}
                </span>
                {dayStatus !== 'green' && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: dayStatus === 'red' ? '#ef4444' : '#f59e0b',
                    boxShadow: `0 0 8px ${dayStatus === 'red' ? '#ef4444' : '#f59e0b'}`
                  }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, marginTop: 10 }}>
                {(selectedLobFilter === 'All' || selectedLobFilter === 'VA') && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: va.status === 'red' ? '#f87171' : va.status === 'yellow' ? '#fbbf24' : 'var(--text-muted)' }}>
                    <span>VA:</span>
                    <span style={{ fontWeight: 600 }}>{va.working}/{va.total} {va.pending > 0 && `(+${va.pending}⏳)`}</span>
                  </div>
                )}
                {(selectedLobFilter === 'All' || selectedLobFilter === 'SSD') && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: ssd.status === 'red' ? '#f87171' : ssd.status === 'yellow' ? '#fbbf24' : 'var(--text-muted)' }}>
                    <span>SSD:</span>
                    <span style={{ fontWeight: 600 }}>{ssd.working}/{ssd.total} {ssd.pending > 0 && `(+${ssd.pending}⏳)`}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Render Status Badge
  function renderStatusBadge(status: string) {
    if (status === 'Approved') return <span className="badge badge-success">Approved</span>
    if (status === 'Rejected') return <span className="badge badge-danger">Rejected</span>
    if (status === 'Cancelled') return <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }}>Cancelled</span>
    return <span className="badge badge-accent">Pending</span>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 1200 }}>
          
          {/* Header */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
                Time Off & Coverage Planner
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {isManager 
                  ? 'Approve leaves, manage requests, and track daily team coverage ratios.' 
                  : `Request time off, manage your leaves, and check team coverage (${userLob} Intake Division).`}
              </p>
            </div>
          </div>

          {/* Success / Error Message alerts */}
          {success && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#10b981', fontSize: 14, fontWeight: 600 }}>
              ✅ {success}
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 14 }}>
              ❌ {error}
            </div>
          )}

          {/* Regular User Tab Switcher */}
          {userRole === 'regular' && (
            <div className="glass-card" style={{ padding: '8px 12px', display: 'flex', gap: 8, marginBottom: 20, width: 'fit-content' }}>
              <button
                className={`btn-secondary ${activeTab === 'request' ? 'btn-primary' : ''}`}
                style={{ 
                  background: activeTab === 'request' ? 'var(--accent-primary)' : 'transparent',
                  border: 'none',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: activeTab === 'request' ? '0 4px 12px rgba(184, 33, 5, 0.2)' : 'none'
                }}
                onClick={() => setActiveTab('request')}
              >
                <span style={{ marginRight: 6 }}>✍️</span>
                Request & History
              </button>
              <button
                className={`btn-secondary ${activeTab === 'calendar' ? 'btn-primary' : ''}`}
                style={{ 
                  background: activeTab === 'calendar' ? 'var(--accent-primary)' : 'transparent',
                  border: 'none',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: activeTab === 'calendar' ? '0 4px 12px rgba(184, 33, 5, 0.2)' : 'none'
                }}
                onClick={() => setActiveTab('calendar')}
              >
                <span style={{ marginRight: 6 }}>📅</span>
                Coverage Calendar ({userLob})
              </button>
            </div>
          )}

          {/* Specialist View: Tab 1 (Form & History) */}
          {userRole === 'regular' && activeTab === 'request' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: 24, alignItems: 'start' }}>
              
              {/* Form Card */}
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>✍️</span> Request Time Off
                </h2>
                <form onSubmit={handleRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="field-label">Start Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">End Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Reason / Notes</label>
                    <textarea
                      className="input-field"
                      style={{ height: 100, resize: 'none' }}
                      value={reason}
                      placeholder="E.g., Family vacation, personal appointment, medical leave..."
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={submitting} 
                    style={{ width: '100%', padding: 12, fontSize: 14 }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </form>
              </div>

              {/* History Card */}
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📜</span> Request History Log
                </h2>
                {loading ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading history...</p>
                ) : requests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🏝️</div>
                    <p style={{ fontSize: 14 }}>No requests submitted yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {requests.map(req => (
                      <div 
                        key={req.id} 
                        style={{ 
                          padding: 16, 
                          borderRadius: 12, 
                          border: '1px solid var(--border)', 
                          background: 'rgba(255, 255, 255, 0.01)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            {format(parseISO(req.start_date), 'MMM d, yyyy')} – {format(parseISO(req.end_date), 'MMM d, yyyy')}
                          </span>
                          {renderStatusBadge(req.status)}
                        </div>
                        {req.reason && (
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                            <strong>Reason:</strong> {req.reason}
                          </p>
                        )}
                        {req.manager_notes && (
                          <div style={{ 
                            fontSize: 12, 
                            color: req.status === 'Approved' ? '#10b981' : '#f87171',
                            padding: '8px 12px',
                            background: req.status === 'Approved' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                            borderRadius: 8,
                            border: `1px solid ${req.status === 'Approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`
                          }}>
                            <strong>Manager Response:</strong> {req.manager_notes}
                          </div>
                        )}

                        {/* Specialist Actions: Edit / Cancel (Only for current or future requests) */}
                        {(() => {
                          const todayStr = format(new Date(), 'yyyy-MM-dd')
                          const isPast = req.end_date < todayStr
                          if (isPast || (req.status !== 'Pending' && req.status !== 'Approved')) return null
                          return (
                            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', marginTop: 4 }}>
                              <button
                                className="btn-secondary"
                                style={{ padding: '4px 12px', fontSize: 12 }}
                                onClick={() => openEditModal(req)}
                              >
                                ✏️ Edit Request
                              </button>
                              <button 
                                className="btn-secondary" 
                                style={{ 
                                  padding: '4px 12px', 
                                  fontSize: 12, 
                                  borderColor: 'rgba(239,68,68,0.3)',
                                  color: '#f87171'
                                }}
                                onClick={() => handleRequestCancel(req.id, req.status)}
                              >
                                ❌ Cancel Request
                              </button>
                            </div>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Calendar View (Shared for Regular and Master) */}
          {activeTab === 'calendar' && (
            <div style={{ display: 'grid', gridTemplateColumns: selectedDay ? '2fr 1fr' : '1fr', gap: 24, alignItems: 'start' }}>
              
              {/* Calendar main Card */}
              <div className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                  {/* Month navigations */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    >
                      ◀
                    </button>
                    <h2 style={{ fontSize: 18, fontWeight: 800, minWidth: 140, textAlign: 'center' }}>
                      {format(currentMonth, 'MMMM yyyy')}
                    </h2>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    >
                      ▶
                    </button>
                  </div>

                  {/* LOB Filters */}
                  {isManager ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Coverage LOB:</span>
                      <select
                        className="input-field"
                        style={{ width: 140, margin: 0, padding: '6px 10px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                        value={selectedLobFilter}
                        onChange={(e) => setSelectedLobFilter(e.target.value as any)}
                      >
                        <option value="All" style={{ background: '#0a1628' }}>All Teams</option>
                        <option value="VA" style={{ background: '#0a1628' }}>VA Specialists</option>
                        <option value="SSD" style={{ background: '#0a1628' }}>SSD Specialists</option>
                      </select>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Coverage for: <span style={{ color: '#b82105' }}>{userLob} Intake Division</span>
                    </div>
                  )}
                </div>

                {/* Safety indicators legend */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    <span>Safe Coverage (≥ 80%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                    <span>Caution (60% - 79%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                    <span>Shortage (&lt; 60%)</span>
                  </div>
                </div>

                {renderCalendar()}
              </div>

              {/* Day Drawer Overlay (Sidebar style) */}
              {selectedDay && (() => {
                const dateStr = format(selectedDay, 'yyyy-MM-dd')
                
                // Filter active specs for selected view filter
                const specs = activeSpecialists.filter(s => selectedLobFilter === 'All' || s.lob === selectedLobFilter)
                
                // Approved off for day
                const approvedList = requests.filter(r => 
                  r.status === 'Approved' && 
                  r.start_date <= dateStr && 
                  r.end_date >= dateStr &&
                  (selectedLobFilter === 'All' || r.lob === selectedLobFilter)
                )
                const approvedUsernames = approvedList.map(r => r.username)

                // Pending requests for day
                const pendingList = requests.filter(r => 
                  r.status === 'Pending' && 
                  r.start_date <= dateStr && 
                  r.end_date >= dateStr &&
                  (selectedLobFilter === 'All' || r.lob === selectedLobFilter)
                )

                // Working list (active specs minus approved off)
                const workingList = specs.filter(s => !approvedUsernames.includes(s.username))

                return (
                  <div className="glass-card" style={{ padding: 24, position: 'sticky', top: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                        📅 Details: {format(selectedDay, 'MMM d, yyyy')}
                      </h3>
                      <button 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
                        onClick={() => setSelectedDay(null)}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Pending requests inline approval (Manager only) */}
                    {canApprove && pendingList.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.05em', marginBottom: 10 }}>
                          ⏳ Pending Decisions ({pendingList.length})
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {pendingList.map(req => (
                            <div 
                              key={req.id} 
                              style={{ 
                                padding: 12, 
                                borderRadius: 10, 
                                background: 'rgba(245, 158, 11, 0.05)', 
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: 13 }}>{req.agent_name} ({req.lob})</span>
                                <span className="badge badge-accent" style={{ fontSize: 10 }}>Pending</span>
                              </div>
                              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Range: {req.start_date} to {req.end_date}
                              </p>
                              {req.reason && (
                                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                  &quot;{req.reason}&quot;
                                </p>
                              )}

                              {/* Manager note submission */}
                              {reviewingId === req.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                                  <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Add note (optional)"
                                    style={{ fontSize: 12, padding: 6, margin: 0 }}
                                    value={managerNotes}
                                    onChange={(e) => setManagerNotes(e.target.value)}
                                  />
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button 
                                      className="btn-primary" 
                                      style={{ padding: '4px 10px', fontSize: 11, background: '#10b981' }}
                                      onClick={() => handleReviewSubmit(req.id, 'Approved')}
                                    >
                                      Confirm Approve
                                    </button>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: '4px 10px', fontSize: 11, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                                      onClick={() => handleReviewSubmit(req.id, 'Rejected')}
                                    >
                                      Confirm Reject
                                    </button>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: '4px 10px', fontSize: 11 }}
                                      onClick={() => { setReviewingId(null); setManagerNotes('') }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button 
                                  className="btn-primary" 
                                  style={{ padding: '6px 12px', fontSize: 11, alignSelf: 'flex-start', marginTop: 4 }}
                                  onClick={() => setReviewingId(req.id)}
                                >
                                  Review Request
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pending list for specialists (read-only) */}
                    {userRole === 'regular' && pendingList.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.05em', marginBottom: 10 }}>
                          ⏳ Pending Requests ({pendingList.length})
                        </h4>
                        <ul style={{ paddingLeft: 16, margin: 0, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {pendingList.map(req => (
                            <li key={req.id}>
                              <strong>{req.agent_name}</strong> ({req.lob})
                              {req.reason && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> — &quot;{req.reason}&quot;</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Approved Off */}
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#f87171', letterSpacing: '0.05em', marginBottom: 10 }}>
                        🏝️ Approved Out ({approvedList.length})
                      </h4>
                      {approvedList.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No one scheduled out.</p>
                      ) : (
                        <ul style={{ paddingLeft: 16, margin: 0, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {approvedList.map(req => (
                            <li key={req.id}>
                              <strong>{req.agent_name}</strong> ({req.lob})
                              {req.reason && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> — &quot;{req.reason}&quot;</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Working roster */}
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.05em', marginBottom: 10 }}>
                        👥 Scheduled Present ({workingList.length})
                      </h4>
                      {workingList.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No active specialists scheduled.</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {workingList.map(spec => (
                            <span 
                              key={spec.username} 
                              className="badge" 
                              style={{ 
                                padding: '4px 10px', 
                                background: 'rgba(255,255,255,0.03)', 
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                                fontSize: 12
                              }}
                            >
                              {spec.display_name} ({spec.lob})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )
              })()}
            </div>
          )}

          {/* Manager View Layout */}
          {isManager && (
            <div>
              {/* Tab Selector */}
              <div className="glass-card" style={{ padding: '8px 12px', display: 'flex', gap: 8, marginBottom: 20, width: 'fit-content' }}>
                {[
                  { id: 'calendar', label: 'Coverage Calendar', icon: '📅' },
                  { id: 'pending', label: `Pending Requests (${requests.filter(r => r.status === 'Pending').length})`, icon: '⏳' },
                  { id: 'history', label: 'All Requests History', icon: '📜' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    className={`btn-secondary ${activeTab === tab.id ? 'btn-primary' : ''}`}
                    style={{ 
                      background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
                      border: 'none',
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      boxShadow: activeTab === tab.id ? '0 4px 12px rgba(184, 33, 5, 0.2)' : 'none'
                    }}
                    onClick={() => setActiveTab(tab.id as any)}
                  >
                    <span style={{ marginRight: 6 }}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Loader */}
              {loading && activeTab !== 'calendar' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 20, height: 20, border: '2px solid rgba(184, 33, 5, 0.3)', borderTopColor: '#b82105', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  Loading data...
                </div>
              )}

              {/* TAB 2: PENDING QUEUE (Manager) */}
              {activeTab === 'pending' && (
                <div className="glass-card" style={{ padding: 24 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>
                    ⏳ Pending Requests Queue
                  </h2>
                  {requests.filter(r => r.status === 'Pending').length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                      <p style={{ fontSize: 14 }}>Queue clear! No pending requests.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {requests.filter(r => r.status === 'Pending').map(req => (
                        <div 
                          key={req.id} 
                          style={{ 
                            padding: 20, 
                            borderRadius: 12, 
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            background: 'rgba(255, 255, 255, 0.01)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <span style={{ fontWeight: 800, fontSize: 15, marginRight: 8 }}>{req.agent_name}</span>
                              <span className="badge badge-accent" style={{ fontSize: 11 }}>{req.lob} Specialist</span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                              Submitted: {format(parseISO(req.created_at || new Date().toISOString()), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>

                          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                              Range: <span style={{ color: '#b82105' }}>{req.start_date}</span> to <span style={{ color: '#b82105' }}>{req.end_date}</span>
                            </div>
                            {req.reason && (
                              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                                <strong>Notes:</strong> &quot;{req.reason}&quot;
                              </p>
                            )}
                          </div>

                          {/* Review Input */}
                          {reviewingId === req.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
                              <div>
                                <label className="field-label" style={{ fontSize: 11 }}>Decision Notes / Response</label>
                                <input
                                  type="text"
                                  className="input-field"
                                  placeholder="E.g., Approved based on coverage. Or: Denied, too many out."
                                  value={managerNotes}
                                  onChange={(e) => setManagerNotes(e.target.value)}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button 
                                  className="btn-primary" 
                                  style={{ padding: '8px 16px', background: '#10b981' }}
                                  onClick={() => handleReviewSubmit(req.id, 'Approved')}
                                >
                                  Approve Request
                                </button>
                                <button 
                                  className="btn-secondary" 
                                  style={{ padding: '8px 16px', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                                  onClick={() => handleReviewSubmit(req.id, 'Rejected')}
                                >
                                  Reject Request
                                </button>
                                <button 
                                  className="btn-secondary" 
                                  onClick={() => { setReviewingId(null); setManagerNotes('') }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button 
                              className="btn-primary" 
                              style={{ width: 'fit-content', padding: '8px 20px', fontSize: 13 }}
                              onClick={() => setReviewingId(req.id)}
                            >
                              ✍️ Review & Decide
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ALL HISTORY (Manager) */}
              {activeTab === 'history' && (
                <div className="glass-card" style={{ padding: 24 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>
                    📜 Time Off History Log
                  </h2>
                  {requests.filter(r => r.status !== 'Pending').length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No historical request log records found.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Agent</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Team</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Start Date</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>End Date</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Reason</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Status</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Reviewed By</th>
                            <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Response Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requests.filter(r => r.status !== 'Pending').map(req => (
                            <tr key={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding: 12, fontSize: 13, fontWeight: 600 }}>{req.agent_name}</td>
                              <td style={{ padding: 12, fontSize: 13 }}>
                                <span className="badge" style={{ padding: '2px 8px', fontSize: 10 }}>{req.lob}</span>
                              </td>
                              <td style={{ padding: 12, fontSize: 13 }}>{req.start_date}</td>
                              <td style={{ padding: 12, fontSize: 13 }}>{req.end_date}</td>
                              <td style={{ padding: 12, fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.reason}>
                                {req.reason || '—'}
                              </td>
                              <td style={{ padding: 12, fontSize: 13 }}>
                                {renderStatusBadge(req.status)}
                              </td>
                              <td style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>{req.reviewed_by || '—'}</td>
                              <td style={{ padding: 12, fontSize: 13, color: 'var(--text-secondary)' }}>{req.manager_notes || '—'}</td>
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

          {/* Edit Request Modal Overlay for Specialists */}
          {editingRequest && (
            <div 
              style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 20
              }}
              onClick={() => setEditingRequest(null)}
            >
              <div 
                className="glass-card" 
                style={{ maxWidth: 480, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>✏️ Modify Time Off Request</h3>
                  <button 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
                    onClick={() => setEditingRequest(null)}
                  >
                    ✕
                  </button>
                </div>

                {editingRequest.status === 'Approved' && (
                  <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '10px 14px', borderRadius: 8, fontSize: 12, color: '#fbbf24', marginBottom: 16 }}>
                    ⚠️ <strong>Note:</strong> Modifying the start or end dates of an approved request will reset its status back to <strong>Pending</strong> for manager re-approval.
                  </div>
                )}

                <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="field-label">Start Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">End Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Reason / Notes</label>
                    <textarea
                      className="input-field"
                      style={{ height: 90, resize: 'none' }}
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => setEditingRequest(null)}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      disabled={editSubmitting}
                    >
                      {editSubmitting ? 'Saving Changes...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>

      <style>{`
        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }
        .calendar-day-card:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.05) !important;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  )
}
