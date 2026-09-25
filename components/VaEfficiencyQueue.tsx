'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { safeFetchJson } from '@/lib/apiClient'
import { getBusinessDate } from '@/lib/dateUtils'

export interface EfficiencyRecord {
  id: number
  date: string
  agent_name: string
  agent_username: string
  lob: string
  avg_talk_time: string
  total_talk_time_sec: number
  time_available_sec: number
  wrap_up_time_sec: number
  busy_time_sec: number
  offline_time_sec: number
  inbound_talk_time_sec: number
  outbound_talk_time_sec: number
  calls_made: number
  calls_received: number
  calls_recycled: number
  calls_declined: number
  calls_missed: number
  total_calls_handled: number
  avg_wrap_up_per_call_sec: number
  is_narrative_rep: number
  is_onboarding_rep: number
  meeting_credit_sec: number
  meeting_notes?: string | null
  exception_status: 'NONE' | 'APPROVED_EXCEPTION' | 'PENDING_REVIEW' | 'REJECTED'
  exception_reason?: string | null
  exception_reviewed_by?: string | null
  exception_reviewed_at?: string | null
  wrap_up_status: 'COMPLIANT' | 'WARNING' | 'VIOLATION' | 'EXCUSED'
  busy_status: 'COMPLIANT' | 'WARNING' | 'VIOLATION' | 'EXCUSED'
  raw_date_range?: string | null
}

interface SummaryStats {
  total_specialists: number
  total_calls_handled: number
  avg_talk_time_sec: number
  avg_wrap_up_time_sec: number
  avg_busy_time_sec: number
  avg_wrap_up_per_call_sec: number
  compliant_count: number
  violation_count: number
  warning_count: number
  excused_count: number
  adherence_rate: number
}

interface Props {
  isMaster: boolean
}

// Convert seconds to clean HH:mm:ss
function formatHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Format seconds to compact display e.g. "1h 20m" or "45s"
function formatCompact(sec: number): string {
  if (sec < 60) return `${sec}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function VaEfficiencyQueue({ isMaster }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(getBusinessDate(new Date()))
  const [records, setRecords] = useState<EfficiencyRecord[]>([])
  const [summary, setSummary] = useState<SummaryStats>({
    total_specialists: 0,
    total_calls_handled: 0,
    avg_talk_time_sec: 0,
    avg_wrap_up_time_sec: 0,
    avg_busy_time_sec: 0,
    avg_wrap_up_per_call_sec: 0,
    compliant_count: 0,
    violation_count: 0,
    warning_count: 0,
    excused_count: 0,
    adherence_rate: 100,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [bannerMsg, setBannerMsg] = useState('')

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showNarrativeModal, setShowNarrativeModal] = useState(false)
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [selectedRecordForMeeting, setSelectedRecordForMeeting] = useState<EfficiencyRecord | null>(null)
  const [showExceptionModal, setShowExceptionModal] = useState(false)
  const [selectedRecordForException, setSelectedRecordForException] = useState<EfficiencyRecord | null>(null)

  const showToast = (msg: string) => {
    setBannerMsg(msg)
    setTimeout(() => setBannerMsg(''), 4500)
  }

  // Fetch Efficiency Data
  const fetchEfficiency = useCallback(async () => {
    setLoading(true)
    try {
      let url = `/api/va-tracker/efficiency?date=${selectedDate}`
      if (statusFilter !== 'all') url += `&status=${statusFilter}`
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`

      const res = await safeFetchJson(url)
      setRecords(res.records || [])
      if (res.summary) setSummary(res.summary)
      if (res.selectedDate && res.selectedDate !== selectedDate) {
        setSelectedDate(res.selectedDate)
      }
    } catch (err: any) {
      console.error('Failed to fetch VA efficiency records:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, statusFilter, searchQuery])

  useEffect(() => {
    fetchEfficiency()
  }, [fetchEfficiency])

  // Quick Date Selectors
  const setQuickDate = (offsetDays: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    setSelectedDate(getBusinessDate(d))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toast message */}
      {bannerMsg && (
        <div
          className="fade-in"
          style={{
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.35)',
            color: '#34d399',
            padding: '12px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>✅</span>
          <span>{bannerMsg}</span>
        </div>
      )}

      {/* Top Action & Date Bar */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        {/* Left: Date Selection & Quick Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>📅 Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, padding: '5px 10px', width: 140 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setQuickDate(0)}
              className="btn-secondary"
              style={{
                fontSize: 11,
                padding: '4px 10px',
                background: selectedDate === getBusinessDate(new Date()) ? 'rgba(184, 33, 5, 0.2)' : undefined,
                borderColor: selectedDate === getBusinessDate(new Date()) ? '#b82105' : undefined,
              }}
            >
              Today
            </button>
            <button
              onClick={() => setQuickDate(-1)}
              className="btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              Yesterday
            </button>
          </div>
        </div>

        {/* Right: Actions Suite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* External Exception Portal Button */}
          <a
            href="https://forms.cloud.microsoft/r/KmyM1LBSzh"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{
              fontSize: 12,
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#38bdf8',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.08)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
            title="Open official Microsoft Exception Reporting Form Portal"
          >
            <span>📝</span>
            <span>MS Exception Portal ↗</span>
          </a>

          {isMaster && (
            <>
              {/* Add Team Meeting Allowance */}
              <button
                onClick={() => {
                  setSelectedRecordForMeeting(null)
                  setShowMeetingModal(true)
                }}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                title="Add meeting/training credit to all specialists on this date"
              >
                <span>🤝</span>
                <span>Team Meeting Credit</span>
              </button>

              {/* Weekly Narrative Roster */}
              <button
                onClick={() => setShowNarrativeModal(true)}
                className="btn-secondary"
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#fbbf24',
                  borderColor: 'rgba(251, 191, 36, 0.3)',
                }}
                title="Manage weekly assignments for 2.5h daily busy allowance"
              >
                <span>👥</span>
                <span>Narrative Project Roster</span>
              </button>

              {/* Upload Report Button */}
              <button
                onClick={() => setShowUploadModal(true)}
                className="btn-primary"
                style={{
                  fontSize: 12,
                  padding: '7px 16px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'linear-gradient(135deg, #b82105 0%, #8b1802 100%)',
                }}
              >
                <span>📥</span>
                <span>Import Law Ruler Report</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Metric Summary Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {/* Team Wrap-Up KPI */}
        <div className="glass-card" style={{ padding: '14px 18px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
            Team Avg Wrap-Up Velocity
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: summary.avg_wrap_up_per_call_sec > 120 ? '#ef4444' : summary.avg_wrap_up_per_call_sec > 90 ? '#f59e0b' : '#fff' }}>
              {summary.avg_wrap_up_per_call_sec}s
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ call (Target: ≤90s)</span>
          </div>
          <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4, fontWeight: 600 }}>
            Total avg duration: {formatHms(summary.avg_wrap_up_time_sec)}
          </div>
        </div>

        {/* Team Busy KPI */}
        <div className="glass-card" style={{ padding: '14px 18px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
            Team Avg Time on Busy
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: summary.avg_busy_time_sec > 1800 ? '#f59e0b' : '#fff' }}>
              {formatHms(summary.avg_busy_time_sec)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 00:30:00 std</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            2.5h allowed for Narrative Reps
          </div>
        </div>

        {/* Policy Adherence Rate */}
        <div className="glass-card" style={{ padding: '14px 18px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
            Policy Adherence Rate
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: summary.adherence_rate >= 80 ? '#10b981' : '#ef4444' }}>
              {summary.adherence_rate}%
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({summary.compliant_count + summary.excused_count} / {summary.total_specialists} compliant)
            </span>
          </div>
          <div style={{ fontSize: 11, color: summary.violation_count > 0 ? '#f87171' : '#34d399', marginTop: 4 }}>
            {summary.violation_count > 0 ? `⚠️ ${summary.violation_count} Over-Target Flags` : '✅ All Reps Within Policy'}
          </div>
        </div>

        {/* Total Calls Handled */}
        <div className="glass-card" style={{ padding: '14px 18px', borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
            Total Calls Handled
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>
              {summary.total_calls_handled.toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>across {summary.total_specialists} reps</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Avg Talk: {formatHms(summary.avg_talk_time_sec)}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="glass-card"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Filter:</span>
          <button
            onClick={() => setStatusFilter('all')}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', background: statusFilter === 'all' ? 'rgba(255,255,255,0.1)' : undefined }}
          >
            All Reps ({summary.total_specialists})
          </button>
          <button
            onClick={() => setStatusFilter('violation')}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', color: '#f87171', background: statusFilter === 'violation' ? 'rgba(239,68,68,0.2)' : undefined }}
          >
            🔴 Over Target ({summary.violation_count})
          </button>
          <button
            onClick={() => setStatusFilter('compliant')}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', color: '#34d399', background: statusFilter === 'compliant' ? 'rgba(16,185,129,0.2)' : undefined }}
          >
            🟢 Compliant ({summary.compliant_count})
          </button>
          <button
            onClick={() => setStatusFilter('excused')}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', color: '#c084fc', background: statusFilter === 'excused' ? 'rgba(192,132,252,0.2)' : undefined }}
          >
            🟣 Excused ({summary.excused_count})
          </button>
          <button
            onClick={() => setStatusFilter('narrative')}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '3px 10px', color: '#fbbf24', background: statusFilter === 'narrative' ? 'rgba(251,191,36,0.2)' : undefined }}
          >
            📝 Narrative Reps
          </button>
        </div>

        <input
          type="text"
          placeholder="🔍 Search specialist name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field"
          style={{ fontSize: 12, padding: '5px 12px', margin: 0, width: 220 }}
        />
      </div>

      {/* Main Efficiency Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Specialist</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Calls Handled</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Total Talk Time</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Available</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Wrap-Up Pacing (Target: ≤90s)</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Time on Busy</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>Time Offline</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 8px' }} />
                    Loading dialer efficiency metrics...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '45px 0', color: 'var(--text-secondary)' }}>
                    <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>📊</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>No dialer metrics found for {selectedDate}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Click <strong>"Import Law Ruler Report"</strong> above to upload the day's Call Center Agent Metrics spreadsheet.
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isViolation = r.wrap_up_status === 'VIOLATION' || r.busy_status === 'VIOLATION'
                  const isExcused = r.exception_status === 'APPROVED_EXCEPTION' || r.wrap_up_status === 'EXCUSED' || r.busy_status === 'EXCUSED'
                  const isWarning = (r.wrap_up_status === 'WARNING' || r.busy_status === 'WARNING') && !isViolation && !isExcused

                  // Allowed busy calculation
                  const baseBusyAllowed = r.is_narrative_rep ? 9000 : 1800
                  const totalBusyAllowed = baseBusyAllowed + (r.meeting_credit_sec || 0)

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: isViolation
                          ? 'rgba(239, 68, 68, 0.05)'
                          : isExcused
                          ? 'rgba(192, 132, 252, 0.04)'
                          : isWarning
                          ? 'rgba(245, 158, 11, 0.03)'
                          : 'transparent',
                      }}
                    >
                      {/* Specialist Name & Badges */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #b82105 0%, #07092d 100%)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: 11,
                            }}
                          >
                            {r.agent_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#fff', fontSize: 13 }}>
                              {r.agent_name}
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                              {r.is_narrative_rep === 1 && (
                                <span style={{ fontSize: 9.5, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.4)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  📝 Narrative Rep (2.5h)
                                </span>
                              )}
                              {r.is_onboarding_rep === 1 && (
                                <span style={{ fontSize: 9.5, background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.4)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  🎓 Onboarding
                                </span>
                              )}
                              {r.meeting_credit_sec > 0 && (
                                <span style={{ fontSize: 9.5, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  🤝 +{Math.round(r.meeting_credit_sec / 60)}m Meeting
                                </span>
                              )}
                              {r.exception_status === 'APPROVED_EXCEPTION' && (
                                <span style={{ fontSize: 9.5, background: 'rgba(192, 132, 252, 0.2)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.4)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  🟣 Excused
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Calls Handled */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 13 }}>
                          {r.total_calls_handled} calls
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                          {r.calls_made} made · {r.calls_received} in
                        </div>
                      </td>

                      {/* Talk Time */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>
                          {formatHms(r.total_talk_time_sec)}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                          Avg: {r.avg_talk_time}
                        </div>
                      </td>

                      {/* Available */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {formatHms(r.time_available_sec)}
                      </td>

                      {/* Wrap-Up Pacing with Avg per call (90s target) */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, color: r.wrap_up_status === 'VIOLATION' && !isExcused ? '#f87171' : r.wrap_up_status === 'WARNING' && !isExcused ? '#fbbf24' : '#fff' }}>
                            {r.avg_wrap_up_per_call_sec}s
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 3 }}>/ call</span>
                          </span>
                          {r.wrap_up_status === 'VIOLATION' && !isExcused && (
                            <span style={{ fontSize: 10, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>
                              Outlier (&gt;{r.is_onboarding_rep ? '150s' : '120s'})
                            </span>
                          )}
                          {r.wrap_up_status === 'WARNING' && !isExcused && (
                            <span style={{ fontSize: 10, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                              Near Limit
                            </span>
                          )}
                          {r.wrap_up_status === 'COMPLIANT' && (
                            <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                              On Target
                            </span>
                          )}
                          {isExcused && (
                            <span style={{ fontSize: 10, background: 'rgba(192, 132, 252, 0.2)', color: '#c084fc', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                              Excused
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          Total: {formatHms(r.wrap_up_time_sec)}
                          {r.is_onboarding_rep === 1 && (
                            <span style={{ color: '#c084fc', marginLeft: 4 }}>&bull; 🌱 Trainee (≤120s)</span>
                          )}
                        </div>
                      </td>

                      {/* Time on Busy */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, color: r.busy_time_sec > totalBusyAllowed && !isExcused ? '#f87171' : '#fff' }}>
                            {formatHms(r.busy_time_sec)}
                          </span>
                          {r.busy_status === 'VIOLATION' && !isExcused && (
                            <span style={{ fontSize: 10, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>
                              Over Budget
                            </span>
                          )}
                          {r.busy_status === 'WARNING' && !isExcused && (
                            <span style={{ fontSize: 10, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                              Near Limit
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          Budget: {r.is_narrative_rep ? '2.5h' : '30m'}
                          {r.meeting_credit_sec > 0 && ` + ${Math.round(r.meeting_credit_sec / 60)}m`}
                        </div>
                      </td>

                      {/* Offline Time */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {formatHms(r.offline_time_sec)}
                      </td>

                      {/* Management Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {isMaster ? (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            {/* Approve Exception button */}
                            {isViolation && (
                              <button
                                onClick={() => {
                                  setSelectedRecordForException(r)
                                  setShowExceptionModal(true)
                                }}
                                className="btn-secondary"
                                style={{
                                  fontSize: 10.5,
                                  padding: '3px 8px',
                                  color: '#c084fc',
                                  borderColor: 'rgba(192, 132, 252, 0.3)',
                                  background: 'rgba(192, 132, 252, 0.08)',
                                  fontWeight: 700,
                                }}
                                title="Approve exception from Microsoft Form or technical issue"
                              >
                                🛡️ Excuse
                              </button>
                            )}

                            {/* Add Individual Meeting Credit */}
                            <button
                              onClick={() => {
                                setSelectedRecordForMeeting(r)
                                setShowMeetingModal(true)
                              }}
                              className="btn-secondary"
                              style={{ fontSize: 10.5, padding: '3px 8px' }}
                              title="Add meeting or coaching credit"
                            >
                              🤝 Meeting
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Upload Excel Report */}
      {showUploadModal && (
        <UploadReportModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={(date) => {
            setShowUploadModal(false)
            setSelectedDate(date)
            showToast(`Report imported successfully for ${date}!`)
            fetchEfficiency()
          }}
        />
      )}

      {/* MODAL 2: Weekly Narrative Roster */}
      {showNarrativeModal && (
        <NarrativeRosterModal
          currentDate={selectedDate}
          onClose={() => setShowNarrativeModal(false)}
          onSaved={() => {
            setShowNarrativeModal(false)
            showToast('Weekly Narrative Project Roster updated! 2.5h allowance applied.')
            fetchEfficiency()
          }}
        />
      )}

      {/* MODAL 3: Add Meeting Credit */}
      {showMeetingModal && (
        <MeetingCreditModal
          date={selectedDate}
          record={selectedRecordForMeeting}
          onClose={() => setShowMeetingModal(false)}
          onSaved={(msg) => {
            setShowMeetingModal(false)
            showToast(msg)
            fetchEfficiency()
          }}
        />
      )}

      {/* MODAL 4: Approve Exception (MS Form) */}
      {showExceptionModal && selectedRecordForException && (
        <ApproveExceptionModal
          record={selectedRecordForException}
          onClose={() => setShowExceptionModal(false)}
          onSaved={() => {
            setShowExceptionModal(false)
            showToast(`Exception approved for ${selectedRecordForException.agent_name}.`)
            fetchEfficiency()
          }}
        />
      )}
    </div>
  )
}

// SUBCOMPONENT: Upload Law Ruler Excel Report Modal
function UploadReportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (date: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [customDate, setCustomDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a .xlsx or .xls file')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (customDate) formData.append('date', customDate)

      const res = await fetch('/api/va-tracker/efficiency/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload report')

      onSuccess(data.reportDate)
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 480, width: '100%', padding: 24, background: '#0a1628', border: '1px solid rgba(184, 33, 5, 0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>📥</span>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#fff' }}>Import Law Ruler Agent Metrics</h3>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f87171', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Select Law Ruler Report (.xlsx) *
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input-field"
              style={{ margin: 0, fontSize: 12, padding: '8px 12px', width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Supports Law Ruler "Call Center Agent Metrics Report" spreadsheets.
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Override Date (Optional)
            </label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 12, width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Leave blank to automatically detect date from report header.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={uploading}
              style={{ background: '#b82105', fontWeight: 800 }}
            >
              {uploading ? 'Processing Metrics...' : '🚀 Process & Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// SUBCOMPONENT: Weekly Narrative Project Roster Modal
function NarrativeRosterModal({
  currentDate,
  onClose,
  onSaved,
}: {
  currentDate: string
  onClose: () => void
  onSaved: () => void
}) {
  const [weekDate, setWeekDate] = useState(currentDate)
  const [allReps, setAllReps] = useState<{ name: string; username: string }[]>([])
  const [assignedNames, setAssignedNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchRoster = useCallback(async () => {
    setLoading(true)
    try {
      const res = await safeFetchJson(`/api/va-tracker/efficiency/narrative-roster?week=${weekDate}`)
      setAllReps(res.allVaReps || [])
      setAssignedNames(res.assignedNames || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load roster')
    } finally {
      setLoading(false)
    }
  }, [weekDate])

  useEffect(() => {
    fetchRoster()
  }, [fetchRoster])

  const toggleRep = (name: string) => {
    setAssignedNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await safeFetchJson('/api/va-tracker/efficiency/narrative-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: weekDate,
          agent_names: assignedNames,
        }),
      })
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to save roster')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 480, width: '100%', padding: 24, background: '#0a1628', border: '1px solid rgba(251, 191, 36, 0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>👥</span>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#fbbf24' }}>Weekly Narrative Project Roster</h3>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Grants 2.5h daily Busy allowance (2h Narratives + 30m break)</div>
            </div>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f87171', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
            Select Active Week (Any date in week):
          </label>
          <input
            type="date"
            value={weekDate}
            onChange={(e) => setWeekDate(e.target.value)}
            className="input-field"
            style={{ margin: 0, fontSize: 12, width: '100%' }}
          />
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          Check Specialists Assigned to Narrative Project for this Week:
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading roster...</div>
        ) : (
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            {allReps.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>No active VA intake specialists found</div>
            ) : (
              allReps.map(rep => {
                const checked = assignedNames.includes(rep.name)
                return (
                  <label
                    key={rep.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: checked ? 'rgba(251, 191, 36, 0.12)' : 'transparent',
                      border: checked ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRep(rep.name)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12.5, fontWeight: checked ? 700 : 500, color: checked ? '#fbbf24' : '#f1f5f9' }}>
                      {rep.name}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary"
            disabled={saving}
            style={{ background: '#f59e0b', fontWeight: 800 }}
          >
            {saving ? 'Saving Roster...' : `💾 Save Roster (${assignedNames.length} Reps)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// SUBCOMPONENT: Meeting Credit Modal
function MeetingCreditModal({
  date,
  record,
  onClose,
  onSaved,
}: {
  date: string
  record: EfficiencyRecord | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [creditMinutes, setCreditMinutes] = useState(30)
  const [notes, setNotes] = useState(record ? `1-on-1 meeting credit` : `Team Meeting: All-Hands Training`)
  const [applyAll, setApplyAll] = useState(!record)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await safeFetchJson('/api/va-tracker/efficiency', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_meeting_credit',
          id: record ? record.id : undefined,
          date,
          credit_minutes: creditMinutes,
          meeting_notes: notes,
          apply_all: applyAll,
        }),
      })

      onSaved(res.message || 'Meeting credit successfully applied!')
    } catch (err: any) {
      setError(err.message || 'Failed to apply meeting credit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 440, width: '100%', padding: 24, background: '#0a1628', border: '1px solid rgba(16, 185, 129, 0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🤝</span>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#34d399' }}>
              {record ? `Meeting Credit: ${record.agent_name}` : `Team Meeting Allowance (${date})`}
            </h3>
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
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Meeting Credit Duration (Minutes) *
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[15, 30, 45, 60].map(m => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setCreditMinutes(m)}
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '6px 0',
                    background: creditMinutes === m ? 'rgba(16, 185, 129, 0.25)' : undefined,
                    borderColor: creditMinutes === m ? '#10b981' : undefined,
                    color: creditMinutes === m ? '#34d399' : undefined,
                    fontWeight: creditMinutes === m ? 800 : 500,
                  }}
                >
                  +{m}m
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={240}
              value={creditMinutes}
              onChange={(e) => setCreditMinutes(parseInt(e.target.value) || 0)}
              className="input-field"
              style={{ marginTop: 8, fontSize: 13, width: '100%' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Meeting Reason / Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. VA All-Hands Training, Coaching 1-on-1..."
              className="input-field"
              style={{ margin: 0, fontSize: 12, width: '100%' }}
            />
          </div>

          {!record && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#94a3b8', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
              />
              <span>Apply to <strong>all specialists</strong> with logged metrics on {date}</span>
            </label>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ background: '#10b981', fontWeight: 800 }}
            >
              {submitting ? 'Applying...' : `🤝 Apply +${creditMinutes}m Credit`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// SUBCOMPONENT: Approve Exception Modal (Microsoft Form Review)
function ApproveExceptionModal({
  record,
  onClose,
  onSaved,
}: {
  record: EfficiencyRecord
  onClose: () => void
  onSaved: () => void
}) {
  const [reason, setReason] = useState('MS Form Submitted & Verified: Technical / Dialer Issues')
  const [customNotes, setCustomNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const fullReason = customNotes ? `${reason} — ${customNotes}` : reason

    try {
      await safeFetchJson('/api/va-tracker/efficiency', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_exception',
          id: record.id,
          exception_reason: fullReason,
        }),
      })

      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to approve exception')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }} onClick={onClose}>
      <div className="glass-card fade-in" style={{ maxWidth: 440, width: '100%', padding: 24, background: '#0a1628', border: '1px solid rgba(192, 132, 252, 0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🛡️</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#c084fc' }}>
                Approve Exception: {record.agent_name}
              </h3>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Excuses target flag for {record.date}</div>
            </div>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#f87171', fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleApprove} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Exception Justification Category *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 12.5, background: '#0a1628', color: '#fff', width: '100%' }}
            >
              <option value="MS Form Submitted & Verified: Technical / Dialer Issues">
                📝 MS Form Verified: Technical / Dialer Issues
              </option>
              <option value="MS Form Submitted & Verified: Complex Crisis Veteran Call">
                📝 MS Form Verified: Complex Crisis Veteran Call
              </option>
              <option value="Approved Supervisor Operational Pause">
                🤝 Approved Supervisor Operational Pause
              </option>
              <option value="Hardware / Network Infrastructure Outage">
                ⚡ Hardware / Network Infrastructure Outage
              </option>
              <option value="Other Legitimate Operational Reason">
                Other Legitimate Operational Reason
              </option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Verification Notes (Optional)
            </label>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="e.g. Form submitted at 2:15 PM, dialer freezing logged..."
              rows={2}
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
              style={{ background: '#9333ea', fontWeight: 800 }}
            >
              {submitting ? 'Excusing...' : '🛡️ Approve & Excuse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
