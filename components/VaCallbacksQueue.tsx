'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { safeFetchJson } from '@/lib/apiClient'
import { format, parseISO } from 'date-fns'
import { getCentralDiffMinutes, getBusinessDate } from '@/lib/dateUtils'
import { VA_OUTCOME_REASONS } from '@/app/va-tracker/page'

export interface ScheduledCallback {
  id: number
  lead_id?: string | null
  veteran_name: string
  phone_number?: string | null
  rep_name: string
  rep_username: string
  callback_date: string
  callback_time: string
  scheduled_datetime: string
  notes?: string | null
  status: 'PENDING' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED'
  outcome_status?: string | null
  outcome_reason?: string | null
  other_reason_notes?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  created_at: string
}

interface Props {
  isMaster: boolean
  repsList: { rep_name: string; rep_username: string }[]
  onCallbackResolved?: () => void
  showScheduleModal: boolean
  setShowScheduleModal: (open: boolean) => void
  callbackCounts: { pending: number; overdue: number; today: number; completed: number }
  onCountsUpdated: (counts: { pending: number; overdue: number; today: number; completed: number }) => void
}

export function downloadIcsFile(cb: ScheduledCallback) {
  try {
    const [year, month, day] = cb.callback_date.split('-').map(Number)
    const [hour, minute] = cb.callback_time.split(':').map(Number)
    const pad = (n: number) => String(n).padStart(2, '0')
    const startStr = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`

    // Default 30 min duration
    let endHour = hour
    let endMinute = minute + 30
    if (endMinute >= 60) {
      endHour += 1
      endMinute -= 60
    }
    const endStr = `${year}${pad(month)}${pad(day)}T${pad(endHour)}${pad(endMinute)}00`

    const formatIcsDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tabak LLC//VA Intake Callbacks//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:va-callback-${cb.id}-${Date.now()}@tabaklaw.com`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART;TZID=America/Chicago:${startStr}`,
      `DTEND;TZID=America/Chicago:${endStr}`,
      `SUMMARY:VA Callback (CT): ${cb.veteran_name}${cb.lead_id ? ` (#${cb.lead_id})` : ''}`,
      `DESCRIPTION:Scheduled Law Ruler callback with ${cb.veteran_name} (US Central Time).\n${cb.phone_number ? `Phone: ${cb.phone_number}\n` : ''}${cb.notes ? `Notes: ${cb.notes}\n` : ''}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT5M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder: VA Intake Callback (Central US Time)',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Callback_${cb.veteran_name.replace(/[^a-zA-Z0-9]/g, '_')}_CT.ics`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to generate ICS file:', err)
  }
}

export default function VaCallbacksQueue({
  isMaster,
  repsList,
  onCallbackResolved,
  showScheduleModal,
  setShowScheduleModal,
  callbackCounts,
  onCountsUpdated,
}: Props) {
  const [callbacks, setCallbacks] = useState<ScheduledCallback[]>([])
  const [loading, setLoading] = useState(true)
  const [subView, setSubView] = useState<'pending' | 'overdue' | 'today' | 'upcoming' | 'completed'>('pending')
  const [selectedRep, setSelectedRep] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentDateTime, setCurrentDateTime] = useState('')

  // Action Modals
  const [resolvingCallback, setResolvingCallback] = useState<ScheduledCallback | null>(null)
  const [reschedulingCallback, setReschedulingCallback] = useState<ScheduledCallback | null>(null)
  const [bannerMsg, setBannerMsg] = useState('')

  const fetchCallbacks = useCallback(async () => {
    setLoading(true)
    try {
      let url = `/api/va-tracker/callbacks?view=${subView}`
      if (selectedRep !== 'All') url += `&rep=${encodeURIComponent(selectedRep)}`
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`

      const res = await safeFetchJson(url)
      setCallbacks(res.callbacks || [])
      if (res.counts) onCountsUpdated(res.counts)
      if (res.currentDateTime) setCurrentDateTime(res.currentDateTime)
    } catch (err: any) {
      console.error('Failed to fetch callbacks:', err)
    } finally {
      setLoading(false)
    }
  }, [subView, selectedRep, searchQuery, onCountsUpdated])

  useEffect(() => {
    fetchCallbacks()
  }, [fetchCallbacks])

  // Listen for background updates
  useEffect(() => {
    const handleUpdate = () => fetchCallbacks()
    window.addEventListener('va-tracker-updated', handleUpdate)
    return () => window.removeEventListener('va-tracker-updated', handleUpdate)
  }, [fetchCallbacks])

  const showToast = (msg: string) => {
    setBannerMsg(msg)
    setTimeout(() => setBannerMsg(''), 4000)
  }

  // Delete Callback
  const handleDelete = async (cb: ScheduledCallback) => {
    if (!confirm(`Are you sure you want to remove the scheduled callback for "${cb.veteran_name}"?`)) return
    try {
      await safeFetchJson(`/api/va-tracker/callbacks?id=${cb.id}`, { method: 'DELETE' })
      showToast(`🗑️ Callback for "${cb.veteran_name}" removed.`)
      fetchCallbacks()
      window.dispatchEvent(new CustomEvent('va-tracker-updated'))
    } catch (err: any) {
      alert(`Error deleting: ${err.message}`)
    }
  }

  // Status Badge and Relative Countdown Helper (Central US Time / CT)
  const renderTimeStatus = (cb: ScheduledCallback) => {
    if (cb.status === 'COMPLETED') {
      return (
        <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
          ✅ Completed ({cb.outcome_status})
        </span>
      )
    }

    const diffMins = getCentralDiffMinutes(cb.callback_date, cb.callback_time)

    if (diffMins < 0) {
      const overdueMins = Math.abs(diffMins)
      const label = overdueMins < 60 ? `${overdueMins}m overdue` : `${Math.floor(overdueMins / 60)}h ${overdueMins % 60}m overdue`
      return (
        <span style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, animation: 'pulse 2s infinite' }}>
          🔴 {label}
        </span>
      )
    } else if (diffMins <= 60) {
      return (
        <span style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
          🟡 In {diffMins} mins
        </span>
      )
    } else {
      return (
        <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
          🟢 Scheduled
        </span>
      )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toast */}
      {bannerMsg && (
        <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
          {bannerMsg}
        </div>
      )}

      {/* Sub-Tabs & Actions Bar */}
      <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'pending', label: 'All Pending', count: callbackCounts.pending, color: '#60a5fa' },
            { id: 'overdue', label: 'Overdue', count: callbackCounts.overdue, color: '#f87171' },
            { id: 'today', label: 'Due Today', count: callbackCounts.today, color: '#fbbf24' },
            { id: 'upcoming', label: 'Upcoming', count: null, color: '#a78bfa' },
            { id: 'completed', label: 'Completed History', count: callbackCounts.completed, color: '#34d399' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id as any)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: subView === tab.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                border: subView === tab.id ? `1px solid ${tab.color}` : '1px solid rgba(255,255,255,0.06)',
                color: subView === tab.id ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  style={{
                    background: subView === tab.id ? tab.color : 'rgba(255,255,255,0.08)',
                    color: subView === tab.id ? '#0f172a' : '#cbd5e1',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter Controls & New Schedule Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isMaster && repsList.length > 0 && (
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="input-field"
              style={{ fontSize: 12, padding: '6px 10px', margin: 0, background: '#0a1628', color: '#fff' }}
            >
              <option value="All">All Specialists</option>
              {repsList.map(r => (
                <option key={r.rep_username} value={r.rep_name}>{r.rep_name}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="🔍 Search veteran, lead ID, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field"
            style={{ fontSize: 12, padding: '6px 12px', margin: 0, width: 220 }}
          />

          <button
            onClick={() => setShowScheduleModal(true)}
            className="btn-primary"
            style={{
              padding: '7px 16px',
              fontSize: 12,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 0 12px rgba(245,158,11,0.35)',
              cursor: 'pointer',
            }}
          >
            <span>⏰</span>
            <span>+ Schedule Callback</span>
          </button>
        </div>
      </div>

      {/* Callbacks Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Veteran Name</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Lead ID</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Phone</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Scheduled Date & Time (CT)</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Status / Countdown</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Notes</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Specialist</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 8px' }} />
                    Loading scheduled callbacks...
                  </td>
                </tr>
              ) : callbacks.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '45px 0', color: 'var(--text-secondary)' }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>🎉</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>No scheduled callbacks in this queue</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>All scheduled veteran follow-ups are up to date!</div>
                  </td>
                </tr>
              ) : (
                callbacks.map((cb) => (
                  <tr
                    key={cb.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: cb.status === 'PENDING' && renderTimeStatus(cb).props.children?.[1]?.includes('overdue')
                        ? 'rgba(239, 68, 68, 0.05)'
                        : 'transparent',
                    }}
                  >
                    {/* Veteran Name */}
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>
                      {cb.veteran_name}
                    </td>

                    {/* Lead ID */}
                    <td style={{ padding: '12px 14px' }}>
                      {cb.lead_id ? (
                        <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          #{cb.lead_id}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Phone */}
                    <td style={{ padding: '12px 14px' }}>
                      {cb.phone_number ? (
                        <a href={`tel:${cb.phone_number}`} style={{ color: '#34d399', fontWeight: 600, textDecoration: 'none' }}>
                          📞 {cb.phone_number}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Scheduled Date & Time */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>{cb.callback_date}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>at {cb.callback_time} CT</div>
                    </td>

                    {/* Countdown / Status */}
                    <td style={{ padding: '12px 14px' }}>
                      {renderTimeStatus(cb)}
                    </td>

                    {/* Notes */}
                    <td style={{ padding: '12px 14px', maxWidth: 220 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cb.notes || ''}>
                        {cb.notes || '—'}
                      </div>
                    </td>

                    {/* Specialist */}
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {cb.rep_name}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {cb.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setResolvingCallback(cb)}
                              style={{
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                padding: '5px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Resolve Law Ruler outcome"
                            >
                              📞 Resolve
                            </button>
                            <button
                              type="button"
                              onClick={() => setReschedulingCallback(cb)}
                              style={{
                                background: 'rgba(245,158,11,0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245,158,11,0.3)',
                                padding: '5px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                              title="Reschedule Date/Time"
                            >
                              📅
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => downloadIcsFile(cb)}
                          style={{
                            background: 'rgba(59,130,246,0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.3)',
                            padding: '5px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                          title="Download Outlook Calendar (.ics) event"
                        >
                          📥 Outlook
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(cb)}
                          style={{
                            background: 'none',
                            color: 'var(--text-muted)',
                            border: 'none',
                            padding: '5px 6px',
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                          title="Delete callback"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Resolve Callback Outcome */}
      {resolvingCallback && (
        <ResolveCallbackModal
          callback={resolvingCallback}
          onClose={() => setResolvingCallback(null)}
          onResolved={() => {
            setResolvingCallback(null)
            showToast('💾 Callback outcome updated and synchronized!')
            fetchCallbacks()
            if (onCallbackResolved) onCallbackResolved()
            window.dispatchEvent(new CustomEvent('va-tracker-updated'))
          }}
        />
      )}

      {/* Modal: Quick Reschedule */}
      {reschedulingCallback && (
        <QuickRescheduleModal
          callback={reschedulingCallback}
          onClose={() => setReschedulingCallback(null)}
          onRescheduled={() => {
            setReschedulingCallback(null)
            showToast('📅 Callback rescheduled successfully!')
            fetchCallbacks()
            window.dispatchEvent(new CustomEvent('va-tracker-updated'))
          }}
        />
      )}
    </div>
  )
}

// MODAL: Schedule New Callback
export function ScheduleCallbackModal({
  onClose,
  onScheduled,
  isMaster,
  repsList,
}: {
  onClose: () => void
  onScheduled: () => void
  isMaster: boolean
  repsList: { rep_name: string; rep_username: string }[]
}) {
  const [veteranName, setVeteranName] = useState('')
  const [leadId, setLeadId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [callbackDate, setCallbackDate] = useState(getBusinessDate())
  const [callbackTime, setCallbackTime] = useState('14:00')
  const [repName, setRepName] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!veteranName.trim()) {
      setError("Veteran's Name is required")
      return
    }
    if (!callbackDate || !callbackTime) {
      setError('Date and time are required')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await safeFetchJson('/api/va-tracker/callbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          veteran_name: veteranName.trim(),
          lead_id: leadId.trim() || undefined,
          phone_number: phoneNumber.trim() || undefined,
          callback_date: callbackDate,
          callback_time: callbackTime,
          notes: notes.trim() || undefined,
          rep_name: isMaster && repName ? repName : undefined,
        }),
      })

      onScheduled()
    } catch (err: any) {
      setError(err.message || 'Failed to schedule callback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 520, width: '100%', padding: 26, background: '#0a1628', border: '1px solid rgba(245,158,11,0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>⏰</span>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#fbbf24' }}>Schedule VA Call Back · Central US Time (CT)</h3>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 11.5, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <span>⏰</span>
          <span>All callbacks are scheduled and monitored in <strong>US Central Time (CT / America/Chicago)</strong>.</span>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f87171', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isMaster && repsList.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Intake Specialist</label>
              <select
                value={repName}
                onChange={(e) => setRepName(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff', width: '100%' }}
              >
                <option value="">-- Auto (Current User) --</option>
                {repsList.map((r) => (
                  <option key={r.rep_username} value={r.rep_name}>{r.rep_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Veteran's Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Marcus Vance"
              value={veteranName}
              onChange={(e) => setVeteranName(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Lead ID (Law Ruler)</label>
              <input
                type="text"
                placeholder="e.g. 849201"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. (555) 234-5678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Callback Date *</label>
              <input
                type="date"
                required
                value={callbackDate}
                onChange={(e) => setCallbackDate(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Callback Time (Central US Time / CT) *</label>
              <input
                type="time"
                required
                value={callbackTime}
                onChange={(e) => setCallbackTime(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Callback Instructions / Notes</label>
            <textarea
              placeholder="e.g. Veteran requested to be called after 2 PM to review Fee Agreement..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input-field"
              style={{ margin: 0, fontSize: 12, resize: 'vertical', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ background: '#f59e0b', fontWeight: 700 }}
            >
              {submitting ? 'Scheduling...' : '⏰ Set Scheduled Callback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// MODAL: Resolve Callback Outcome
function ResolveCallbackModal({
  callback,
  onClose,
  onResolved,
}: {
  callback: ScheduledCallback
  onClose: () => void
  onResolved: () => void
}) {
  const [outcomeStatus, setOutcomeStatus] = useState('Sent E-Sign')
  const [outcomeReason, setOutcomeReason] = useState('')
  const [notes, setNotes] = useState(callback.notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if ((outcomeStatus === 'Client Refused Help' || outcomeStatus === 'Case Rejected') && !outcomeReason) {
      setError('Outcome reason is required for Client Refused Help or Case Rejected.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await safeFetchJson('/api/va-tracker/callbacks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: callback.id,
          action: 'resolve',
          outcome_status: outcomeStatus,
          outcome_reason: outcomeReason || undefined,
          other_reason_notes: notes || undefined,
        }),
      })

      onResolved()
    } catch (err: any) {
      setError(err.message || 'Failed to resolve callback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 500, width: '100%', padding: 26, background: '#0a1628', border: '1px solid rgba(16,185,129,0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#34d399' }}>Record Callback Outcome</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Veteran: <strong>{callback.veteran_name}</strong> {callback.lead_id ? `(#${callback.lead_id})` : ''}
            </div>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f87171', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Law Ruler Result Status *</label>
            <select
              value={outcomeStatus}
              onChange={(e) => setOutcomeStatus(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff', width: '100%' }}
            >
              <option value="Sent E-Sign">Sent E-Sign (Retainer Emailed)</option>
              <option value="Signed E-Sign">Signed E-Sign (Retainer Completed)</option>
              <option value="Contacting">Contacting (Reschedule / Follow-up)</option>
              <option value="Client Refused Help">Client Refused Help</option>
              <option value="Case Rejected">Case Rejected</option>
            </select>
          </div>

          {(outcomeStatus === 'Client Refused Help' || outcomeStatus === 'Case Rejected') && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Reason for Refusal/Rejection *</label>
              <select
                value={outcomeReason}
                onChange={(e) => setOutcomeReason(e.target.value)}
                required
                className="input-field"
                style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff', width: '100%' }}
              >
                <option value="">-- Select Outcome Reason --</option>
                {VA_OUTCOME_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Outcome Notes</label>
            <textarea
              placeholder="e.g. Veteran agreed, sent retainer for e-signature..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input-field"
              style={{ margin: 0, fontSize: 12, resize: 'vertical', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ background: '#10b981', fontWeight: 700 }}
            >
              {submitting ? 'Saving...' : '💾 Save & Complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// MODAL: Quick Reschedule
function QuickRescheduleModal({
  callback,
  onClose,
  onRescheduled,
}: {
  callback: ScheduledCallback
  onClose: () => void
  onRescheduled: () => void
}) {
  const [newDate, setNewDate] = useState(callback.callback_date)
  const [newTime, setNewTime] = useState(callback.callback_time)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDate || !newTime) {
      setError('Date and time are required')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await safeFetchJson('/api/va-tracker/callbacks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: callback.id,
          action: 'reschedule',
          callback_date: newDate,
          callback_time: newTime,
          notes: notes.trim() || undefined,
        }),
      })

      onRescheduled()
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule callback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 440, width: '100%', padding: 24, background: '#0a1628', border: '1px solid rgba(245,158,11,0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#fbbf24' }}>Reschedule Callback · Central US Time (CT)</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f87171', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>New Date *</label>
              <input
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>New Time (Central US Time / CT) *</label>
              <input
                type="time"
                required
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Reschedule Notes</label>
            <textarea
              placeholder="e.g. Veteran asked to push to Friday at 11 AM..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input-field"
              style={{ margin: 0, fontSize: 12, resize: 'vertical', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ background: '#f59e0b', fontWeight: 700 }}
            >
              {submitting ? 'Updating...' : '📅 Save Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
