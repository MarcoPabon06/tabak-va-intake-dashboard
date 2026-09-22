'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { safeFetchJson } from '@/lib/apiClient'
import { VA_OUTCOME_REASONS } from '@/app/va-tracker/page'

interface ScheduledCallback {
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
}

export default function ScheduledCallbackReminder() {
  const { data: session } = useSession()
  const user = session?.user as any
  const userRole = user?.role || 'regular'
  const userLob = user?.lob || 'VA'

  // Proactive pop-up alerts and chimes are strictly for the Intake Rep
  // Administrators and Team Leads are explicitly exempted from pop-up interruptions
  const isIntakeRep = userRole === 'regular' && userLob === 'VA'

  const [activeAlert, setActiveAlert] = useState<ScheduledCallback | null>(null)
  const [snoozedIds, setSnoozedIds] = useState<Record<number, number>>({}) // id -> snoozeUntil timestamp
  const [overdueCount, setOverdueCount] = useState(0)
  const [dueTodayCount, setDueTodayCount] = useState(0)

  // Outcome resolution state inside the alert modal
  const [showOutcomeForm, setShowOutcomeForm] = useState(false)
  const [outcomeStatus, setOutcomeStatus] = useState<string>('Contacting')
  const [outcomeReason, setOutcomeReason] = useState<string>('')
  const [outcomeNotes, setOutcomeNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [resolveError, setResolveError] = useState('')

  // Reschedule state
  const [showRescheduleForm, setShowRescheduleForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')

  const lastCheckedRef = useRef<number>(0)

  // Audio chime alert using browser Web Audio API (synthetic, 0 external files)
  const playAlertChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      const ctx = new AudioContextClass()
      
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc2.type = 'triangle'

      // First tone (D5 - 587.33 Hz) -> Second tone (A5 - 880 Hz)
      osc1.frequency.setValueAtTime(587.33, now)
      osc1.frequency.setValueAtTime(880, now + 0.15)
      
      osc2.frequency.setValueAtTime(587.33 / 2, now)
      osc2.frequency.setValueAtTime(880 / 2, now + 0.15)

      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.8)
      osc2.stop(now + 0.8)
    } catch {
      // Audio playback blocked by browser policy until interaction
    }
  }

  // Check alerts every 30 seconds
  const checkCallbacks = async () => {
    if (!isIntakeRep || !session) return
    try {
      const data = await safeFetchJson('/api/va-tracker/callbacks?view=alerts')
      setOverdueCount(data.overdueCount || 0)
      setDueTodayCount(data.dueTodayCount || 0)

      const dueList: ScheduledCallback[] = data.dueNow || []
      const nowMs = Date.now()

      // Find the first due callback that is NOT currently snoozed
      const urgentCallback = dueList.find(cb => {
        const snoozeUntil = snoozedIds[cb.id] || 0
        return nowMs > snoozeUntil
      })

      if (urgentCallback) {
        if (!activeAlert || activeAlert.id !== urgentCallback.id) {
          setActiveAlert(urgentCallback)
          playAlertChime()
        }
      } else {
        if (!showOutcomeForm && !showRescheduleForm) {
          setActiveAlert(null)
        }
      }
    } catch {
      // Ignore background network errors
    }
  }

  useEffect(() => {
    if (!session || !isIntakeRep) return

    checkCallbacks()
    const interval = setInterval(checkCallbacks, 30000) // Every 30 seconds

    // Listen for manual trigger from other parts of the dashboard
    const handleUpdate = () => checkCallbacks()
    window.addEventListener('va-tracker-updated', handleUpdate)

    return () => {
      clearInterval(interval)
      window.removeEventListener('va-tracker-updated', handleUpdate)
    }
  }, [session, isIntakeRep, snoozedIds])

  // Snooze for 5 minutes
  const handleSnooze = (minutes = 5) => {
    if (!activeAlert) return
    const snoozeUntil = Date.now() + minutes * 60 * 1000
    setSnoozedIds(prev => ({ ...prev, [activeAlert.id]: snoozeUntil }))
    setActiveAlert(null)
    setShowOutcomeForm(false)
    setShowRescheduleForm(false)
  }

  // Handle Resolving Outcome
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAlert) return

    if ((outcomeStatus === 'Client Refused Help' || outcomeStatus === 'Case Rejected') && !outcomeReason) {
      setResolveError('Outcome reason is required for Client Refused Help / Case Rejected.')
      return
    }

    setSubmitting(true)
    setResolveError('')

    try {
      await safeFetchJson('/api/va-tracker/callbacks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeAlert.id,
          action: 'resolve',
          outcome_status: outcomeStatus,
          outcome_reason: outcomeReason || undefined,
          other_reason_notes: outcomeNotes || undefined,
        }),
      })

      setActiveAlert(null)
      setShowOutcomeForm(false)
      // Broadcast update event so VA Tracker and dashboard refresh
      window.dispatchEvent(new CustomEvent('va-tracker-updated'))
      checkCallbacks()
    } catch (err: any) {
      setResolveError(err.message || 'Failed to update callback')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Rescheduling
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAlert) return
    if (!newDate || !newTime) {
      setResolveError('Please select both a date and time.')
      return
    }

    setSubmitting(true)
    setResolveError('')

    try {
      await safeFetchJson('/api/va-tracker/callbacks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeAlert.id,
          action: 'reschedule',
          callback_date: newDate,
          callback_time: newTime,
          notes: outcomeNotes || undefined,
        }),
      })

      setActiveAlert(null)
      setShowRescheduleForm(false)
      window.dispatchEvent(new CustomEvent('va-tracker-updated'))
      checkCallbacks()
    } catch (err: any) {
      setResolveError(err.message || 'Failed to reschedule callback')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isIntakeRep || !activeAlert) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 7, 18, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20,
      }}
    >
      <div
        className="glass-card fade-in"
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#0a1628',
          border: '2px solid #ef4444',
          boxShadow: '0 0 40px rgba(239, 68, 68, 0.35)',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 14,
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24, animation: 'bounce 1s infinite' }}>⏰</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>
                Scheduled Callback Due NOW!
              </h3>
              <div style={{ fontSize: 11, color: '#fecaca', fontWeight: 600 }}>
                Law Ruler VA Intake Reminder · Central US Time (CT)
              </div>
            </div>
          </div>
          <button
            onClick={() => handleSnooze(5)}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 700,
            }}
            title="Snooze for 5 minutes"
          >
            ⏳ Snooze 5m
          </button>
        </div>

        {/* Lead Details Body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                  {activeAlert.veteran_name}
                </div>
                {activeAlert.lead_id && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Lead ID: <strong style={{ color: '#60a5fa' }}>#{activeAlert.lead_id}</strong>
                  </div>
                )}
              </div>
              <span
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 12,
                }}
              >
                🔴 Due at {activeAlert.callback_time} CT
              </span>
            </div>

            {activeAlert.phone_number && (
              <div style={{ fontSize: 13, color: '#34d399', fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📞</span>
                <a href={`tel:${activeAlert.phone_number}`} style={{ color: '#34d399', textDecoration: 'underline' }}>
                  {activeAlert.phone_number}
                </a>
              </div>
            )}

            {activeAlert.notes && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 6, marginTop: 6, borderLeft: '3px solid #3b82f6' }}>
                <strong style={{ color: '#93c5fd' }}>Callback Notes:</strong> {activeAlert.notes}
              </div>
            )}
          </div>

          {resolveError && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '8px 14px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
              ⚠️ {resolveError}
            </div>
          )}

          {/* VIEW A: DEFAULT ACTION BUTTONS */}
          {!showOutcomeForm && !showRescheduleForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setShowOutcomeForm(true)
                  setShowRescheduleForm(false)
                  setOutcomeStatus('Sent E-Sign')
                }}
                style={{
                  padding: '12px 18px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)',
                }}
              >
                <span>📞</span>
                <span>Complete Call & Record Outcome</span>
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowRescheduleForm(true)
                    setShowOutcomeForm(false)
                    setNewDate(activeAlert.callback_date)
                    setNewTime(activeAlert.callback_time)
                  }}
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '9px 12px', fontWeight: 600 }}
                >
                  📅 Reschedule Date/Time
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(15)}
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '9px 12px', color: 'var(--text-secondary)' }}
                >
                  ⏳ Snooze 15 Min
                </button>
              </div>
            </div>
          )}

          {/* VIEW B: OUTCOME RESOLUTION FORM */}
          {showOutcomeForm && (
            <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 2 }}>
                Record Law Ruler Outcome:
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Call Result Status *
                </label>
                <select
                  value={outcomeStatus}
                  onChange={(e) => setOutcomeStatus(e.target.value)}
                  className="input-field"
                  style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff', width: '100%' }}
                >
                  <option value="Sent E-Sign">Sent E-Sign (Retainer Emailed)</option>
                  <option value="Signed E-Sign">Signed E-Sign (Retainer Completed)</option>
                  <option value="Contacting">Contacting (Reschedule / Still Reaching Out)</option>
                  <option value="Client Refused Help">Client Refused Help</option>
                  <option value="Case Rejected">Case Rejected</option>
                </select>
              </div>

              {(outcomeStatus === 'Client Refused Help' || outcomeStatus === 'Case Rejected') && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    Reason for Refusal/Rejection *
                  </label>
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
                <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Outcome Notes (Optional)
                </label>
                <textarea
                  placeholder="e.g. Veteran answered, reviewed terms, sent retainer via email..."
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  rows={2}
                  className="input-field"
                  style={{ margin: 0, fontSize: 12, resize: 'vertical', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowOutcomeForm(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ fontSize: 13, fontWeight: 700, background: '#10b981' }}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : '💾 Save & Complete Callback'}
                </button>
              </div>
            </form>
          )}

          {/* VIEW C: RESCHEDULE FORM */}
          {showRescheduleForm && (
            <form onSubmit={handleRescheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 2 }}>
                Reschedule Callback:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    New Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, fontSize: 12, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    New Time (Central US Time / CT) *
                  </label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, fontSize: 12, width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Reschedule Reason / Notes
                </label>
                <textarea
                  placeholder="e.g. Veteran requested to push to tomorrow at 10 AM..."
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  rows={2}
                  className="input-field"
                  style={{ margin: 0, fontSize: 12, resize: 'vertical', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowRescheduleForm(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ fontSize: 13, fontWeight: 700 }}
                  disabled={submitting}
                >
                  {submitting ? 'Updating...' : '📅 Save New Schedule'}
                </button>
              </div>
            </form>
          )}

        </div>

      </div>
    </div>
  )
}
