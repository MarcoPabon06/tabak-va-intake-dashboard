'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import { format, subDays, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns'
import * as XLSX from 'xlsx'

export const VA_STATUS_OPTIONS = [
  'Sent E-Sign',
  'Sign Follow Up',
  'Signed E-Sign',
  'Client Refused Help',
  'Case Rejected',
] as const

export const VA_OUTCOME_REASONS = [
  'Already Represented',
  'Not interested',
  'Fee is too high',
  'Say they will call back',
  'Second Hang Up',
  'Client will review FA',
  'Other',
] as const

interface VaLeadRecord {
  id: number
  rep_name: string
  rep_username: string
  veteran_name: string
  lead_id?: string | null
  date: string
  status: 'Sent E-Sign' | 'Sign Follow Up' | 'Signed E-Sign' | 'Client Refused Help' | 'Case Rejected'
  outcome_reason?: string | null
  other_reason_notes?: string | null
  signed_at?: string | null
  created_at: string
  updated_at?: string | null
  last_edited_by?: string | null
}

interface SummaryMetrics {
  total_leads: number
  sent_esigns: number
  follow_ups: number
  pending_signatures: number
  signed_esigns: number
  crh_count: number
  rejected_count: number
  conversion_rate: number
  reasons_breakdown: Record<string, number>
}

const PRESETS = [
  { label: 'Today', getValue: () => ({ from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 7 days', getValue: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'All time', getValue: () => ({ from: '2024-01-01', to: '2099-12-31' }) },
]

export default function VaTrackerPage() {
  const { data: session } = useSession()
  const [entries, setEntries] = useState<VaLeadRecord[]>([])
  const [summary, setSummary] = useState<SummaryMetrics>({
    total_leads: 0,
    sent_esigns: 0,
    follow_ups: 0,
    pending_signatures: 0,
    signed_esigns: 0,
    crh_count: 0,
    rejected_count: 0,
    conversion_rate: 0,
    reasons_breakdown: {},
  })
  const [repsList, setRepsList] = useState<{ rep_name: string; rep_username: string }[]>([])
  const [isPersonalView, setIsPersonalView] = useState(false)
  const [loading, setLoading] = useState(true)

  // Filters
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This month')
  const [selectedRep, setSelectedRep] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [reasonFilter, setReasonFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewTab, setViewTab] = useState<'all' | 'pending' | 'signed' | 'refused'>('all')

  // Modals
  const [showLogModal, setShowLogModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<VaLeadRecord | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [actionSuccessMsg, setActionSuccessMsg] = useState('')

  const userRole = (session?.user as any)?.role || 'regular'
  const userLob = (session?.user as any)?.lob || 'VA'
  const isMaster = userRole === 'master' || userRole === 'superadmin' || userRole === 'admin'

  const fetchTrackerData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (selectedRep && selectedRep !== 'All') params.set('rep', selectedRep)
      if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter)
      if (reasonFilter && reasonFilter !== 'All') params.set('reason', reasonFilter)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(`/api/va-tracker?${params.toString()}`)
      const json = await res.json()

      if (res.ok) {
        setEntries(json.entries || [])
        setSummary(json.summary || {
          total_leads: 0,
          sent_esigns: 0,
          follow_ups: 0,
          pending_signatures: 0,
          signed_esigns: 0,
          crh_count: 0,
          rejected_count: 0,
          conversion_rate: 0,
          reasons_breakdown: {},
        })
        setRepsList(json.reps_list || [])
        setIsPersonalView(Boolean(json.is_personal_view))
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [from, to, selectedRep, statusFilter, reasonFilter, searchQuery])

  useEffect(() => {
    fetchTrackerData()
  }, [fetchTrackerData])

  function showBannerMessage(msg: string) {
    setActionSuccessMsg(msg)
    setTimeout(() => setActionSuccessMsg(''), 4000)
  }

  // Quick 1-click Mark Signed
  async function handleMarkSigned(record: VaLeadRecord) {
    try {
      const res = await fetch('/api/va-tracker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          status: 'Signed E-Sign',
        }),
      })
      if (res.ok) {
        showBannerMessage(`✅ Successfully converted "${record.veteran_name}" to Signed E-Sign!`)
        fetchTrackerData()
      }
    } catch {
      // ignore
    }
  }

  // Delete Record
  async function handleDeleteRecord(id: number, name: string) {
    if (!confirm(`Are you sure you want to delete lead record for "${name}"?`)) return
    try {
      const res = await fetch(`/api/va-tracker?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        showBannerMessage(`🗑️ Record for "${name}" deleted.`)
        fetchTrackerData()
      }
    } catch {
      // ignore
    }
  }

  // Filter entries based on Tab
  const displayedEntries = useMemo(() => {
    if (viewTab === 'pending') {
      return entries.filter((e) => e.status === 'Sent E-Sign' || e.status === 'Sign Follow Up')
    }
    if (viewTab === 'signed') {
      return entries.filter((e) => e.status === 'Signed E-Sign')
    }
    if (viewTab === 'refused') {
      return entries.filter((e) => e.status === 'Client Refused Help' || e.status === 'Case Rejected')
    }
    return entries
  }, [entries, viewTab])

  // Export to XLSX
  function handleExportExcel() {
    const exportData = displayedEntries.map((e) => ({
      'Intake Rep': e.rep_name,
      "Veteran's Name": e.veteran_name,
      'Lead ID': e.lead_id || '',
      'Date Logged': e.date,
      'Status': e.status,
      'Outcome Reason': e.outcome_reason || '',
      'Other Notes': e.other_reason_notes || '',
      'Signed Timestamp': e.signed_at || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'VA Leads')
    XLSX.writeFile(workbook, `VA_Leads_Report_${from}_to_${to}.xlsx`)
  }

  // Helper for Status Badge styling
  function getStatusBadge(status: string) {
    switch (status) {
      case 'Signed E-Sign':
        return <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>✅ Signed E-Sign</span>
      case 'Sign Follow Up':
        return <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>⏳ Sign Follow Up</span>
      case 'Sent E-Sign':
        return <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>📤 Sent E-Sign</span>
      case 'Client Refused Help':
        return <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)' }}>🚫 Refused Help</span>
      case 'Case Rejected':
        return <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>❌ Case Rejected</span>
      default:
        return <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>{status}</span>
    }
  }

  // Helper for Pending Retainer Aging Badge
  function getAgingBadge(dateStr: string, status: string) {
    if (status !== 'Sent E-Sign' && status !== 'Sign Follow Up') return null
    const days = differenceInCalendarDays(new Date(), new Date(dateStr))
    if (days <= 2) {
      return <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>🟢 {days}d pending</span>
    }
    if (days <= 6) {
      return <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)' }}>🟡 {days}d pending</span>
    }
    if (days <= 13) {
      return <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.15)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(249,115,22,0.3)' }}>🟠 {days}d (Follow-up due)</span>
    }
    return <span style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.2)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)' }}>🔴 {days}d (Overdue)</span>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '28px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>

          {/* Banner Toast */}
          {actionSuccessMsg && (
            <div className="glass-card fade-in" style={{ padding: '12px 18px', background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', borderRadius: 8, marginBottom: 18, color: '#10b981', fontSize: 13, fontWeight: 700 }}>
              {actionSuccessMsg}
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📑 VA Lead & Retainer Tracker</h1>
                {isPersonalView ? (
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', padding: '3px 10px', borderRadius: 12 }}>
                    👤 Personal VA Workspace ({session?.user?.name})
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(167,139,250,0.15)', color: '#c084fc', border: '1px solid rgba(167,139,250,0.3)', padding: '3px 10px', borderRadius: 12 }}>
                    👥 Team Management View
                  </span>
                )}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                Track daily e-sign lifecycles, manage follow-up pipelines, and accurately calculate conversion rates without double-counting.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowImportModal(true)}
                className="btn-secondary"
                style={{ fontSize: 12, fontWeight: 700 }}
              >
                📥 Import Excel
              </button>
              <button
                onClick={handleExportExcel}
                className="btn-secondary"
                style={{ fontSize: 12, fontWeight: 700 }}
              >
                📤 Export XLSX
              </button>
              <button
                onClick={() => setShowLogModal(true)}
                className="btn-primary"
                style={{ fontSize: 12, fontWeight: 700 }}
              >
                + Log New Lead
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            {/* Total Leads */}
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>📝 Total Leads Logged</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{summary.total_leads}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>During selected period</div>
            </div>

            {/* Sent E-Signs */}
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #60a5fa' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>📤 Sent E-Signs</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#60a5fa' }}>{summary.sent_esigns}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{summary.follow_ups} in Follow-Up</div>
            </div>

            {/* Pending Signatures */}
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>⏳ Active Unsigned Pool</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{summary.pending_signatures}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Pending signature</div>
            </div>

            {/* Signed E-Signs */}
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>✅ Signed E-Signs</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{summary.signed_esigns}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Successfully converted</div>
            </div>

            {/* Conversion Rate */}
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #b82105' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>📈 True Conversion Rate</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: summary.conversion_rate >= 65 ? '#10b981' : '#f59e0b' }}>
                {summary.conversion_rate}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Signed / (Unsigned + Signed)</div>
            </div>

            {/* Refused & Rejected */}
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>🚫 Refused / Rejected</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c084fc' }}>{summary.crh_count + summary.rejected_count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{summary.crh_count} CRH · {summary.rejected_count} Ineligible</div>
            </div>
          </div>

          {/* Outcome Reasons Breakdown Strip */}
          <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
              📊 Lead Outcome Reasons Breakdown
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {VA_OUTCOME_REASONS.map((reason) => {
                const count = summary.reasons_breakdown[reason] || 0
                return (
                  <div
                    key={reason}
                    onClick={() => setReasonFilter(reasonFilter === reason ? 'All' : reason)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: reasonFilter === reason ? 'rgba(184,33,5,0.25)' : 'rgba(255,255,255,0.04)',
                      border: reasonFilter === reason ? '1px solid #b82105' : '1px solid rgba(255,255,255,0.08)',
                      color: reasonFilter === reason ? '#fff' : '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{reason}</span>
                    <span style={{ fontWeight: 800, background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{count}</span>
                  </div>
                )
              })}
              {reasonFilter !== 'All' && (
                <button
                  onClick={() => setReasonFilter('All')}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}
                >
                  ✕ Clear Reason Filter
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
              {/* Presets */}
              <div style={{ display: 'flex', gap: 6 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setActivePreset(p.label)
                      const range = p.getValue()
                      setFrom(range.from)
                      setTo(range.to)
                    }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: activePreset === p.label ? '#b82105' : 'rgba(255,255,255,0.05)',
                      color: activePreset === p.label ? '#fff' : '#94a3b8',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date Inputs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setActivePreset('Custom') }}
                  className="input-field"
                  style={{ width: 140, margin: 0, padding: '4px 8px', fontSize: 12 }}
                />
                <span style={{ color: '#64748b', fontSize: 12 }}>to</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setActivePreset('Custom') }}
                  className="input-field"
                  style={{ width: 140, margin: 0, padding: '4px 8px', fontSize: 12 }}
                />
              </div>

              {/* Rep Dropdown (Manager View) */}
              {!isPersonalView && repsList.length > 0 && (
                <div>
                  <select
                    value={selectedRep}
                    onChange={(e) => setSelectedRep(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, padding: '5px 10px', fontSize: 12, background: '#0a1628', color: '#fff' }}
                  >
                    <option value="All">All Specialists</option>
                    {repsList.map((r) => (
                      <option key={r.rep_username} value={r.rep_username}>{r.rep_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Dropdown */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-field"
                  style={{ margin: 0, padding: '5px 10px', fontSize: 12, background: '#0a1628', color: '#fff' }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">⏳ Pending Signatures (Sent + Follow Up)</option>
                  <option value="Signed E-Sign">✅ Signed E-Sign Only</option>
                  <option value="Sent E-Sign">📤 Sent E-Sign Only</option>
                  <option value="Sign Follow Up">🔄 Sign Follow Up Only</option>
                  <option value="Refused/Rejected">🚫 Refused / Rejected</option>
                </select>
              </div>

              {/* Search Box */}
              <div style={{ marginLeft: 'auto', minWidth: 200 }}>
                <input
                  type="text"
                  placeholder="🔍 Search veteran, lead ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field"
                  style={{ margin: 0, padding: '5px 12px', fontSize: 12, width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* View Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <button
              onClick={() => setViewTab('all')}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: viewTab === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: viewTab === 'all' ? '#fff' : '#94a3b8', border: 'none'
              }}
            >
              📋 All Leads ({summary.total_leads})
            </button>
            <button
              onClick={() => setViewTab('pending')}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: viewTab === 'pending' ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: viewTab === 'pending' ? '#f59e0b' : '#94a3b8', border: 'none'
              }}
            >
              ⏳ Pending Signatures ({summary.pending_signatures})
            </button>
            <button
              onClick={() => setViewTab('signed')}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: viewTab === 'signed' ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: viewTab === 'signed' ? '#10b981' : '#94a3b8', border: 'none'
              }}
            >
              ✅ Signed E-Signs ({summary.signed_esigns})
            </button>
            <button
              onClick={() => setViewTab('refused')}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: viewTab === 'refused' ? 'rgba(168,85,247,0.15)' : 'transparent',
                color: viewTab === 'refused' ? '#c084fc' : '#94a3b8', border: 'none'
              }}
            >
              🚫 Refused & Ineligible ({summary.crh_count + summary.rejected_count})
            </button>
          </div>

          {/* Interactive Lead Records Table */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                ⏳ Loading VA leads data...
              </div>
            ) : displayedEntries.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No VA lead records found matching the selected filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                      {!isPersonalView && <th style={{ padding: '12px 16px' }}>Intake Rep</th>}
                      <th style={{ padding: '12px 16px' }}>Veteran's Name</th>
                      <th style={{ padding: '12px 16px' }}>Lead ID</th>
                      <th style={{ padding: '12px 16px' }}>Date Logged</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px' }}>Aging / Follow-Up</th>
                      <th style={{ padding: '12px 16px' }}>Outcome Reason & Notes</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedEntries.map((e) => (
                      <tr
                        key={e.id}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s ease' }}
                        className="hover-row"
                      >
                        {!isPersonalView && (
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: '#fff' }}>{e.rep_name}</td>
                        )}
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>
                          {e.veteran_name}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                          {e.lead_id ? (
                            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}>
                              {e.lead_id}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{e.date}</td>
                        <td style={{ padding: '12px 16px' }}>{getStatusBadge(e.status)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {getAgingBadge(e.date, e.status) || (
                            e.status === 'Signed E-Sign' && e.signed_at ? (
                              <span style={{ fontSize: 10, color: '#10b981' }}>Converted {e.signed_at.slice(0, 10)}</span>
                            ) : (
                              '—'
                            )
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                          <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{e.outcome_reason || '—'}</div>
                          {e.other_reason_notes && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>
                              "{e.other_reason_notes}"
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            {(e.status === 'Sent E-Sign' || e.status === 'Sign Follow Up') && (
                              <button
                                onClick={() => handleMarkSigned(e)}
                                style={{
                                  background: 'rgba(16,185,129,0.15)',
                                  color: '#10b981',
                                  border: '1px solid rgba(16,185,129,0.3)',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                ✅ Mark Signed
                              </button>
                            )}
                            <button
                              onClick={() => setEditingRecord(e)}
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                color: '#cbd5e1',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              ✏️
                            </button>
                            {(isMaster || e.rep_username === (session?.user as any)?.email) && (
                              <button
                                onClick={() => handleDeleteRecord(e.id, e.veteran_name)}
                                style={{
                                  background: 'transparent',
                                  color: '#ef4444',
                                  border: 'none',
                                  padding: '4px 6px',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal: Log New Lead */}
        {showLogModal && (
          <LogLeadModal
            onClose={() => setShowLogModal(false)}
            onSaved={() => {
              setShowLogModal(false)
              showBannerMessage('✅ New lead record logged successfully!')
              fetchTrackerData()
            }}
            repsList={repsList}
            isMaster={isMaster}
          />
        )}

        {/* Modal: Edit Lead */}
        {editingRecord && (
          <EditLeadModal
            record={editingRecord}
            onClose={() => setEditingRecord(null)}
            onSaved={() => {
              setEditingRecord(null)
              showBannerMessage('💾 Lead record updated successfully!')
              fetchTrackerData()
            }}
            repsList={repsList}
            isMaster={isMaster}
          />
        )}

        {/* Modal: Import Excel */}
        {showImportModal && (
          <ImportExcelModal
            onClose={() => setShowImportModal(false)}
            onImported={(count) => {
              setShowImportModal(false)
              showBannerMessage(`📥 Successfully imported ${count} records from spreadsheet!`)
              fetchTrackerData()
            }}
          />
        )}
      </main>
    </div>
  )
}

// Modal: Log New Lead
function LogLeadModal({
  onClose,
  onSaved,
  repsList,
  isMaster,
}: {
  onClose: () => void
  onSaved: () => void
  repsList: { rep_name: string; rep_username: string }[]
  isMaster: boolean
}) {
  const [veteranName, setVeteranName] = useState('')
  const [leadId, setLeadId] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [status, setStatus] = useState<string>('Sent E-Sign')
  const [outcomeReason, setOutcomeReason] = useState<string>('')
  const [otherReasonNotes, setOtherReasonNotes] = useState('')
  const [repName, setRepName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!veteranName.trim()) {
      setError("Veteran's Name is required")
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/va-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          veteran_name: veteranName.trim(),
          lead_id: leadId.trim() || null,
          date,
          status,
          outcome_reason: outcomeReason || null,
          other_reason_notes: otherReasonNotes.trim() || null,
          rep_name: isMaster && repName ? repName : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save lead record')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
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
        style={{ maxWidth: 540, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>+ Log New VA Lead</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isMaster && repsList.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Intake Rep</label>
              <select
                value={repName}
                onChange={(e) => setRepName(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff' }}
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
              placeholder="e.g. John Doe"
              value={veteranName}
              onChange={(e) => setVeteranName(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Lead ID</label>
              <input
                type="text"
                placeholder="e.g. 104829"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Status *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff' }}
            >
              {VA_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Reason for Outcome</label>
            <select
              value={outcomeReason}
              onChange={(e) => setOutcomeReason(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff' }}
            >
              <option value="">-- Select Outcome Reason (Optional) --</option>
              {VA_OUTCOME_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Other Reason / Follow-up Notes</label>
            <textarea
              value={otherReasonNotes}
              onChange={(e) => setOtherReasonNotes(e.target.value)}
              placeholder="Free-hand notes, veteran follow-up details..."
              rows={3}
              className="input-field"
              style={{ margin: 0, fontSize: 13, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : '💾 Log Lead'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal: Edit Lead
function EditLeadModal({
  record,
  onClose,
  onSaved,
  repsList,
  isMaster,
}: {
  record: VaLeadRecord
  onClose: () => void
  onSaved: () => void
  repsList: { rep_name: string; rep_username: string }[]
  isMaster: boolean
}) {
  const [veteranName, setVeteranName] = useState(record.veteran_name)
  const [leadId, setLeadId] = useState(record.lead_id || '')
  const [date, setDate] = useState(record.date)
  const [status, setStatus] = useState<string>(record.status)
  const [outcomeReason, setOutcomeReason] = useState<string>(record.outcome_reason || '')
  const [otherReasonNotes, setOtherReasonNotes] = useState(record.other_reason_notes || '')
  const [repName, setRepName] = useState(record.rep_name)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!veteranName.trim()) {
      setError("Veteran's Name is required")
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/va-tracker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          veteran_name: veteranName.trim(),
          lead_id: leadId.trim() || null,
          date,
          status,
          outcome_reason: outcomeReason || null,
          other_reason_notes: otherReasonNotes.trim() || null,
          rep_name: isMaster && repName ? repName : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update lead record')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
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
        style={{ maxWidth: 540, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>✏️ Edit VA Lead ({record.veteran_name})</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isMaster && repsList.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Intake Rep</label>
              <select
                value={repName}
                onChange={(e) => setRepName(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff' }}
              >
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
              value={veteranName}
              onChange={(e) => setVeteranName(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Lead ID</label>
              <input
                type="text"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
                style={{ margin: 0, fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Status *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff' }}
            >
              {VA_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Reason for Outcome</label>
            <select
              value={outcomeReason}
              onChange={(e) => setOutcomeReason(e.target.value)}
              className="input-field"
              style={{ margin: 0, fontSize: 13, background: '#0a1628', color: '#fff' }}
            >
              <option value="">-- Select Outcome Reason --</option>
              {VA_OUTCOME_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Other Reason / Follow-up Notes</label>
            <textarea
              value={otherReasonNotes}
              onChange={(e) => setOtherReasonNotes(e.target.value)}
              rows={3}
              className="input-field"
              style={{ margin: 0, fontSize: 13, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : '💾 Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal: Import Excel
function ImportExcelModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (count: number) => void
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
      const res = await fetch('/api/va-tracker/import', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to import spreadsheet')
      onImported(json.imported || 0)
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
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📥 Import VA Leads Spreadsheet</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16, lineHeight: 1.5 }}>
          Upload your online spreadsheet (.xlsx). The importer automatically matches:
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>Column 1: Intake Rep Name</li>
            <li>Column 2: Veteran's Name</li>
            <li>Column 3: Lead ID</li>
            <li>Column 4: Date</li>
            <li>Column 5: Status (Sent E-Sign, Signed E-Sign, etc.)</li>
            <li>Column 6: Reason for previous outcome</li>
            <li>Column 7: Other reason notes</li>
          </ul>
        </div>

        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ marginBottom: 16, width: '100%', fontSize: 13, color: '#cbd5e1' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleUpload} disabled={!file || loading}>
            {loading ? 'Importing...' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
