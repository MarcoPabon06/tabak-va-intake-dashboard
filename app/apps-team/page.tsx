'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { useSession } from 'next-auth/react'
import { format, startOfMonth, subDays } from 'date-fns'
import { generateEODReportHtml } from '@/lib/eodReport'

interface AppEntry {
  id: number
  lead_id: string
  client_name: string
  date_completed: string
  converted: 'YES' | 'NO'
  reason_not_converted?: string
  other_reason?: string
  rep_username: string
  rep_name: string
  converted_at?: string | null
  created_at: string
  updated_at: string
}

interface SummaryData {
  total: number
  converted: number
  pending: number
  conversion_rate: number
  bonus_rate?: number
  estimated_bonus?: number
  reasons_breakdown: Record<string, number>
}

const REASON_OPTIONS = [
  'Need Reps',
  'Need Wet 827',
  'Yellow Screen (CC with SSA scheduled)',
  'Rejected (While on Application)',
  'Other'
]

const DATE_PRESETS = [
  { label: 'This month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'All time', getValue: () => ({ from: '', to: '' }) },
]

export default function AppsTeamPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const userRole = (session?.user as any)?.role || 'regular'
  const isSuper = userRole === 'master' || userRole === 'superadmin'
  const isAdmin = userRole === 'admin'
  const perms = (session?.user as any)?.permissions

  const userLob = (session?.user as any)?.lob || 'VA'
  const userName = session?.user?.name || ''
  const allowedLobs: string[] = Array.isArray(perms?.allowedLobs) ? perms.allowedLobs : [userLob]
  const isRegularAppsRep = userRole === 'regular' && userLob === 'APPS'

  const isAuthorized = isSuper ||
    isRegularAppsRep ||
    (isAdmin && (userLob === 'SSD' || userLob === 'APPS' || allowedLobs.includes('SSD') || allowedLobs.includes('APPS') || allowedLobs.includes('All')))

  const canCopyEOD = isSuper || (isAdmin && (perms?.canCopyEOD ?? true))

  // Redirect unauthorized users to /dashboard
  useEffect(() => {
    if (status === 'authenticated' && !isAuthorized) {
      router.replace('/dashboard')
    }
  }, [status, isAuthorized, router])

  // Data & Filter State
  const [entries, setEntries] = useState<AppEntry[]>([])
  const [summary, setSummary] = useState<SummaryData>({
    total: 0, converted: 0, pending: 0, conversion_rate: 0, bonus_rate: 25.00, estimated_bonus: 0,
    reasons_breakdown: { 'Need Reps': 0, 'Need Wet 827': 0, 'Yellow Screen (CC with SSA scheduled)': 0, 'Rejected (While on Application)': 0, 'Other': 0 }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [activeTab, setActiveTab] = useState<'pending' | 'reasons' | 'history'>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [repFilter, setRepFilter] = useState('All')

  // Date Range Filtering State
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This month')

  // Log Modal State
  const [showLogModal, setShowLogModal] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [clientName, setClientName] = useState('')
  const [dateCompleted, setDateCompleted] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [converted, setConverted] = useState<'YES' | 'NO'>('NO')
  const [reasonCategory, setReasonCategory] = useState(REASON_OPTIONS[0])
  const [otherReasonNotes, setOtherReasonNotes] = useState('')
  const [repName, setRepName] = useState(userName || 'Estefani Cubides')
  const [submitting, setSubmitting] = useState(false)

  // Edit Modal State
  const [editingEntry, setEditingEntry] = useState<AppEntry | null>(null)

  // Excel Import Modal State
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const queryParams = new URLSearchParams()
      if (repFilter !== 'All') queryParams.append('rep', repFilter)
      if (searchQuery) queryParams.append('search', searchQuery)
      if (from) queryParams.append('from', from)
      if (to) queryParams.append('to', to)

      const res = await fetch(`/api/apps-team?${queryParams.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch Apps Team entries.')
      const data = await res.json()
      setEntries(data.entries || [])
      if (data.summary) setSummary(data.summary)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [repFilter, searchQuery, from, to])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle New Application Submit
  async function handleLogSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!leadId || !clientName || !dateCompleted) {
      setError('Lead ID, Client Name, and Date Completed are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/apps-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          client_name: clientName,
          date_completed: dateCompleted,
          converted,
          reason_not_converted: converted === 'NO' ? reasonCategory : null,
          other_reason: converted === 'NO' ? otherReasonNotes : null,
          rep_name: repName
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create entry.')

      setSuccess(`Application Lead ID "${leadId}" logged successfully!`)
      setShowLogModal(false)
      setLeadId('')
      setClientName('')
      setOtherReasonNotes('')
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Quick Conversion (Mark YES)
  async function handleQuickConvert(entry: AppEntry) {
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/apps-team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          converted: 'YES'
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update entry.')

      setSuccess(`Lead ID "${entry.lead_id}" (${entry.client_name}) marked as CONVERTED (YES)! 🎉`)
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Handle Edit Submit
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEntry) return
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/apps-team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEntry.id,
          lead_id: editingEntry.lead_id,
          client_name: editingEntry.client_name,
          date_completed: editingEntry.date_completed,
          converted: editingEntry.converted,
          reason_not_converted: editingEntry.reason_not_converted,
          other_reason: editingEntry.other_reason
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update entry.')

      setSuccess(`Lead ID "${editingEntry.lead_id}" updated successfully!`)
      setEditingEntry(null)
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Handle Excel Import
  async function handleExcelImportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!importFile) {
      setError('Please select an Excel file to import.')
      return
    }

    setError('')
    setSuccess('')
    setImporting(true)

    try {
      const formData = new FormData()
      formData.append('file', importFile)

      const res = await fetch('/api/apps-team/import', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to import Excel file.')

      setSuccess(json.message || 'Excel import completed successfully!')
      setShowImportModal(false)
      setImportFile(null)
      fetchData()
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  // Unique list of Reps for filtering
  const availableReps = Array.from(new Set(entries.map(e => e.rep_name))).filter(Boolean)

  async function handleCopyEODReport() {
    const { html, text } = generateEODReportHtml({
      lob: 'APPS',
      from: '',
      to: '',
      perfData: [],
      appsData: entries,
    })

    try {
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([text], { type: 'text/plain' })
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      })
      await navigator.clipboard.write([item])
    } catch {
      await navigator.clipboard.writeText(text)
    }

    setSuccess('EOD Report copied to clipboard! Open Outlook and press Ctrl+V to paste.')
    setTimeout(() => setSuccess(''), 4000)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />

      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 1200 }}>
          
          {/* Header */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 26 }}>📲</span>
                <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                  Apps Team Workspace
                </h1>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Track SSA application filings, clear pending conversions, and analyze non-conversion reasons.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {canCopyEOD && (
                <button 
                  className="btn-secondary" 
                  style={{ padding: '8px 16px', fontSize: 13, background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.35)', color: '#60a5fa', fontWeight: 700 }}
                  onClick={handleCopyEODReport}
                >
                  📋 Copy EOD Report
                </button>
              )}
              <button 
                className="btn-secondary" 
                style={{ padding: '8px 16px', fontSize: 13 }}
                onClick={() => setShowImportModal(true)}
              >
                📥 Import Excel Tracker
              </button>
              <button 
                className="btn-primary" 
                style={{ padding: '8px 18px', fontSize: 13 }}
                onClick={() => setShowLogModal(true)}
              >
                ➕ Log New Application
              </button>
            </div>
          </div>

          {/* Success / Error alerts */}
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

          {/* Date Range Filter Bar */}
          <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>📅 Date Filter:</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setActivePreset(p.label)
                      const { from: f, to: t } = p.getValue()
                      setFrom(f)
                      setTo(t)
                    }}
                    className={`btn-secondary ${activePreset === p.label ? 'btn-primary' : ''}`}
                    style={{
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      background: activePreset === p.label ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                      borderColor: activePreset === p.label ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 10 }}>
                <input
                  type="date"
                  className="input-field"
                  style={{ width: 140, padding: '5px 10px', fontSize: 12, margin: 0 }}
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setActivePreset('Custom') }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
                <input
                  type="date"
                  className="input-field"
                  style={{ width: 140, padding: '5px 10px', fontSize: 12, margin: 0 }}
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setActivePreset('Custom') }}
                />
              </div>
            </div>

            {isRegularAppsRep && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', padding: '6px 14px', borderRadius: 20, color: '#10b981', fontSize: 12, fontWeight: 700 }}>
                👤 Personal Applications Workspace ({userName})
              </div>
            )}
          </div>

          {/* Motivational Estimated Bonus Card */}
          <div 
            className="glass-card" 
            style={{ 
              padding: '20px 24px', 
              marginBottom: 24, 
              background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(14,165,233,0.06))', 
              border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>💵</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#10b981', margin: 0 }}>
                  Estimated Period Bonus Earnings ({activePreset === 'All time' ? 'All Time' : 'Selected Period'})
                </h3>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 6px' }}>
                Based on <strong>{summary.converted} converted applications</strong> recorded within the selected date filter at <strong>${summary.bonus_rate || 25.00}/converted case</strong>.
              </p>
              <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.25)', display: 'inline-block' }}>
                ⚠️ <strong>Preliminary Figure:</strong> This estimated bonus figure is calculated based on recorded conversions for the selected date range and is a preliminary figure subject to final verification and approval by management.
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Estimated Bonus
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#10b981', letterSpacing: '-0.02em' }}>
                ${(summary.estimated_bonus || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* KPI Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="glass-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Apps Completed (Period)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: '6px 0 2px' }}>
                {summary.total}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Filed applications in period</div>
            </div>

            <div className="glass-card" style={{ padding: 20, borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Converted Cases (YES)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', margin: '6px 0 2px' }}>
                {summary.converted}
              </div>
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Converted in period</div>
            </div>

            <div className="glass-card" style={{ padding: 20, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pending Conversion (NO)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', margin: '6px 0 2px' }}>
                {summary.pending}
              </div>
              <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>Action needed queue</div>
            </div>

            <div className="glass-card" style={{ padding: 20, borderLeft: '4px solid #b82105' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Conversion Rate %
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#b82105', margin: '6px 0 2px' }}>
                {summary.conversion_rate}%
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Period conversion ratio</div>
            </div>
          </div>

          {/* Tab & Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div className="glass-card" style={{ padding: '6px 10px', display: 'flex', gap: 6, width: 'fit-content' }}>
              <button
                className={`btn-secondary ${activeTab === 'pending' ? 'btn-primary' : ''}`}
                style={{ 
                  background: activeTab === 'pending' ? 'var(--accent-primary)' : 'transparent',
                  border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600
                }}
                onClick={() => setActiveTab('pending')}
              >
                ⏳ Pending Reminder Queue ({summary.pending})
              </button>
              <button
                className={`btn-secondary ${activeTab === 'reasons' ? 'btn-primary' : ''}`}
                style={{ 
                  background: activeTab === 'reasons' ? 'var(--accent-primary)' : 'transparent',
                  border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600
                }}
                onClick={() => setActiveTab('reasons')}
              >
                📊 Non-Conversion Analytics
              </button>
              <button
                className={`btn-secondary ${activeTab === 'history' ? 'btn-primary' : ''}`}
                style={{ 
                  background: activeTab === 'history' ? 'var(--accent-primary)' : 'transparent',
                  border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600
                }}
                onClick={() => setActiveTab('history')}
              >
                📜 All Filings History ({summary.total})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="text"
                className="input-field"
                placeholder="Search Lead ID, Name..."
                style={{ width: 220, fontSize: 13, margin: 0 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {!isRegularAppsRep && (
                <select
                  className="input-field"
                  style={{ width: 180, fontSize: 13, margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                  value={repFilter}
                  onChange={(e) => setRepFilter(e.target.value)}
                >
                  <option value="All" style={{ background: '#0a1628' }}>All Representatives</option>
                  {availableReps.map(r => (
                    <option key={r} value={r} style={{ background: '#0a1628' }}>{r}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* TAB 1: PENDING CONVERSION REMINDER QUEUE */}
          {activeTab === 'pending' && (
            <div className="glass-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                    ⏳ Pending Conversion Reminder Queue
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                    Applications marked as NO (Pending Conversion). Click &quot;Mark Converted (YES)&quot; as soon as wet forms, yellow screens, or reps are cleared.
                  </p>
                </div>
              </div>

              {loading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading pending queue...</p>
              ) : entries.filter(e => e.converted === 'NO').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                  <p style={{ fontSize: 14 }}>Pending queue clear! All filed applications are converted.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {entries.filter(e => e.converted === 'NO').map(entry => (
                    <div 
                      key={entry.id}
                      style={{
                        padding: 18,
                        borderRadius: 12,
                        background: 'rgba(245, 158, 11, 0.04)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginRight: 8 }}>
                              {entry.client_name}
                            </span>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', fontSize: 11 }}>
                              Lead ID: {entry.lead_id}
                            </span>
                          </div>
                          <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', fontSize: 11 }}>
                            Pending (NO)
                          </span>
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                          Filed: <strong>{entry.date_completed}</strong> &nbsp;|&nbsp; Rep: <strong>{entry.rep_name}</strong>
                        </div>

                        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                          <span style={{ color: '#fbbf24', fontWeight: 700 }}>Reason: </span>
                          <span>{entry.reason_not_converted}</span>
                          {entry.other_reason && (
                            <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                              &quot;{entry.other_reason}&quot;
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => setEditingEntry(entry)}
                        >
                          ✏️ Edit Lead
                        </button>
                        <button
                          className="btn-primary"
                          style={{ padding: '6px 14px', fontSize: 12, background: '#10b981' }}
                          onClick={() => handleQuickConvert(entry)}
                        >
                          ✅ Mark Converted (YES)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REASON ANALYTICS */}
          {activeTab === 'reasons' && (
            <div className="glass-card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
                📊 Non-Conversion Reasons Breakdown
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {Object.entries(summary.reasons_breakdown).map(([reason, count]) => {
                  const pct = summary.pending > 0 ? Math.round((count / summary.pending) * 100) : 0
                  return (
                    <div key={reason} style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        {reason}
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>
                        {count} <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>cases ({pct}%)</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ALL HISTORY LOG */}
          {activeTab === 'history' && (
            <div className="glass-card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
                📜 Application Filings History Log
              </h2>
              {loading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading history log...</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Lead ID</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Client Name</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Rep</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Date Completed</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Converted</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Converted Date / Time</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Non-Conversion Reason</th>
                        <th style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(entry => (
                        <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: 12, fontSize: 13, fontWeight: 700 }}>{entry.lead_id}</td>
                          <td style={{ padding: 12, fontSize: 13, fontWeight: 600 }}>{entry.client_name}</td>
                          <td style={{ padding: 12, fontSize: 13 }}>{entry.rep_name}</td>
                          <td style={{ padding: 12, fontSize: 13 }}>{entry.date_completed}</td>
                          <td style={{ padding: 12, fontSize: 13 }}>
                            {entry.converted === 'YES' ? (
                              <span className="badge badge-success">YES</span>
                            ) : (
                              <span className="badge badge-accent">NO</span>
                            )}
                          </td>
                          <td style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                            {entry.converted === 'YES' && entry.converted_at ? (
                              <span style={{ color: '#10b981', fontWeight: 600 }}>{entry.converted_at}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                            {entry.converted === 'NO' ? (
                              <span>{entry.reason_not_converted} {entry.other_reason && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(&quot;{entry.other_reason}&quot;)</span>}</span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: 12, fontSize: 13 }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={() => setEditingEntry(entry)}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Modal 1: ➕ Log New Application */}
          {showLogModal && (
            <div 
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
              }}
              onClick={() => setShowLogModal(false)}
            >
              <div 
                className="glass-card" 
                style={{ maxWidth: 500, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>➕ Log SSA Application Filing</h3>
                  <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }} onClick={() => setShowLogModal(false)}>✕</button>
                </div>

                <form onSubmit={handleLogSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="field-label">Lead ID</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="E.g., 752882"
                      value={leadId}
                      onChange={(e) => setLeadId(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Client Name</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="E.g., Michael Smith"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Date Completed</label>
                    <input
                      type="date"
                      className="input-field"
                      value={dateCompleted}
                      onChange={(e) => setDateCompleted(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Apps Representative</label>
                    <input
                      type="text"
                      className="input-field"
                      value={repName}
                      onChange={(e) => setRepName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Converted to Case?</label>
                    <select
                      className="input-field"
                      value={converted}
                      onChange={(e) => setConverted(e.target.value as any)}
                      style={{ background: '#0a1628', color: '#fff' }}
                    >
                      <option value="NO">NO (Pending Conversion)</option>
                      <option value="YES">YES (Converted)</option>
                    </select>
                  </div>

                  {converted === 'NO' && (
                    <>
                      <div>
                        <label className="field-label">Reason for Not Converted</label>
                        <select
                          className="input-field"
                          value={reasonCategory}
                          onChange={(e) => setReasonCategory(e.target.value)}
                          style={{ background: '#0a1628', color: '#fff' }}
                        >
                          {REASON_OPTIONS.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Explanation / Notes</label>
                        <textarea
                          className="input-field"
                          style={{ height: 70, resize: 'none' }}
                          placeholder="E.g. Lead needs wet 827 form sent via mail..."
                          value={otherReasonNotes}
                          onChange={(e) => setOtherReasonNotes(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowLogModal(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Logging...' : 'Log Application'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 2: ✏️ Edit Application Entry */}
          {editingEntry && (
            <div 
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
              }}
              onClick={() => setEditingEntry(null)}
            >
              <div 
                className="glass-card" 
                style={{ maxWidth: 500, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>✏️ Edit Application Lead ID {editingEntry.lead_id}</h3>
                  <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }} onClick={() => setEditingEntry(null)}>✕</button>
                </div>

                <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="field-label">Lead ID</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingEntry.lead_id}
                      onChange={(e) => setEditingEntry({ ...editingEntry, lead_id: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Client Name</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingEntry.client_name}
                      onChange={(e) => setEditingEntry({ ...editingEntry, client_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Converted to Case?</label>
                    <select
                      className="input-field"
                      value={editingEntry.converted}
                      onChange={(e) => setEditingEntry({ ...editingEntry, converted: e.target.value as any })}
                      style={{ background: '#0a1628', color: '#fff' }}
                    >
                      <option value="NO">NO (Pending Conversion)</option>
                      <option value="YES">YES (Converted)</option>
                    </select>
                  </div>

                  {editingEntry.converted === 'NO' && (
                    <>
                      <div>
                        <label className="field-label">Reason for Not Converted</label>
                        <select
                          className="input-field"
                          value={editingEntry.reason_not_converted || REASON_OPTIONS[0]}
                          onChange={(e) => setEditingEntry({ ...editingEntry, reason_not_converted: e.target.value })}
                          style={{ background: '#0a1628', color: '#fff' }}
                        >
                          {REASON_OPTIONS.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Explanation / Notes</label>
                        <textarea
                          className="input-field"
                          style={{ height: 70, resize: 'none' }}
                          value={editingEntry.other_reason || ''}
                          onChange={(e) => setEditingEntry({ ...editingEntry, other_reason: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => setEditingEntry(null)}>Cancel</button>
                    <button type="submit" className="btn-primary">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal 3: 📥 Import Excel Tracker */}
          {showImportModal && (
            <div 
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
              }}
              onClick={() => setShowImportModal(false)}
            >
              <div 
                className="glass-card" 
                style={{ maxWidth: 480, width: '100%', padding: 28, background: '#0a1628', border: '1px solid var(--border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📥 Import Apps Tracker Excel</h3>
                  <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }} onClick={() => setShowImportModal(false)}>✕</button>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Select your updated <strong>Applications Tracker - Andes Team.xlsx</strong> spreadsheet. Existing Lead IDs will be cleanly updated and new applications added.
                </p>

                <form onSubmit={handleExcelImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="field-label">Excel File (.xlsx)</label>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      className="input-field"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={importing}>
                      {importing ? 'Importing File...' : 'Start Import'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
