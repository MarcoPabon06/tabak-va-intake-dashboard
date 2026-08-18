'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import { format, subDays, startOfMonth, endOfMonth, differenceInDays } from 'date-fns'
import * as XLSX from 'xlsx'
import { SSD_STATUS_OPTIONS, SSD_CLAIM_TYPES, SSD_OUTCOME_REASONS } from '@/lib/ssdTrackerConstants'

interface SSDLeadRecord {
  id: number
  rep_name: string
  rep_username: string
  client_name: string
  lead_id?: string
  date: string
  status: string
  claim_type?: string
  outcome_reason?: string
  other_reason_notes?: string
  signed_at?: string
  converted_at?: string
  is_converted?: number
  created_at: string
  updated_at: string
  last_edited_by?: string
}

interface SsdSummary {
  total_leads: number
  sent_esigns: number
  paper_sent: number
  pending_signatures: number
  signed_esigns: number
  sent_rfc: number
  rescheduled: number
  crh_count: number
  rejected_count: number
  converted_count: number
  signed_success_rate: number
  case_conversion_rate: number
  reasons_breakdown: Record<string, number>
  claims_breakdown: Record<string, number>
}

const PRESETS = [
  { label: 'Today', getValue: () => ({ from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Yesterday', getValue: () => ({ from: format(subDays(new Date(), 1), 'yyyy-MM-dd'), to: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
  { label: 'Last 7 days', getValue: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'All time', getValue: () => ({ from: '', to: '' }) },
]

export default function SSDTrackerPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const userRole = user?.role || 'regular'
  const userLob = user?.lob || 'SSD'
  const isSuper = userRole === 'master' || userRole === 'superadmin'
  const isAdmin = userRole === 'admin'
  const isSSDTeam = userLob === 'SSD' || isSuper || (isAdmin && (user?.permissions?.allowedLobs?.includes('SSD') || user?.permissions?.allowedLobs?.includes('All')))
  const canManageTeam = isSuper || (isAdmin && (user?.permissions?.allowedLobs?.includes('SSD') || user?.permissions?.allowedLobs?.includes('All') || userLob === 'SSD'))

  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [repFilter, setRepFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [claimFilter, setClaimFilter] = useState('All')
  const [reasonFilter, setReasonFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'signed' | 'rfc' | 'converted' | 'refused'>('all')

  const [entries, setEntries] = useState<SSDLeadRecord[]>([])
  const [summary, setSummary] = useState<SsdSummary | null>(null)
  const [repsList, setRepsList] = useState<{ rep_name: string; rep_username: string }[]>([])
  const [historicalReps, setHistoricalReps] = useState<{ rep_name: string; rep_username: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number | 'all'>(50)

  // Modals
  const [showLogModal, setShowLogModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showConvertedModal, setShowConvertedModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SSDLeadRecord | null>(null)

  // Form State
  const [formClientName, setFormClientName] = useState('')
  const [formLeadId, setFormLeadId] = useState('')
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formStatus, setFormStatus] = useState<string>('Sent E-Sign')
  const [formClaimType, setFormClaimType] = useState<string>('SSDI+SSI')
  const [formOutcomeReason, setFormOutcomeReason] = useState<string>('')
  const [formOtherNotes, setFormOtherNotes] = useState('')
  const [formRepName, setFormRepName] = useState('')
  const [formIsConverted, setFormIsConverted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null)
  const [convertedFile, setConvertedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  // Safe fetch helper
  async function safeFetchJson(url: string, options?: RequestInit) {
    const res = await fetch(url, options)
    const text = await res.text()
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      if (res.status === 429) {
        throw new Error('Rate limit exceeded: The server is experiencing high traffic. Please wait a moment.')
      }
      throw new Error(`Server Error (${res.status}): ${text.slice(0, 150)}`)
    }
    if (!res.ok) {
      throw new Error(json.error || `HTTP error ${res.status}`)
    }
    return json
  }

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (repFilter !== 'All') params.set('rep', repFilter)

      if (activeTab === 'pending') {
        params.set('status', 'Pending')
      } else if (activeTab === 'signed') {
        params.set('status', 'Signed E-Sign')
      } else if (activeTab === 'rfc') {
        params.set('status', 'Sent RFC')
      } else if (activeTab === 'converted') {
        params.set('status', 'Converted')
      } else if (activeTab === 'refused') {
        params.set('status', 'Refused/Rejected')
      } else if (statusFilter !== 'All') {
        params.set('status', statusFilter)
      }

      if (claimFilter !== 'All') params.set('claim_type', claimFilter)
      if (reasonFilter !== 'All') params.set('reason', reasonFilter)
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())

      const json = await safeFetchJson(`/api/ssd-tracker?${params.toString()}`)
      setEntries(json.entries || [])
      setSummary(json.summary || null)
      if (json.active_reps || json.reps) setRepsList(json.active_reps || json.reps)
      if (json.historical_reps) setHistoricalReps(json.historical_reps)
      setCurrentPage(1)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [from, to, repFilter, activeTab, statusFilter, claimFilter, reasonFilter, debouncedSearch])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset form
  function resetForm() {
    setFormClientName('')
    setFormLeadId('')
    setFormDate(format(new Date(), 'yyyy-MM-dd'))
    setFormStatus('Sent E-Sign')
    setFormClaimType('SSDI+SSI')
    setFormOutcomeReason('')
    setFormOtherNotes('')
    setFormRepName('')
    setFormIsConverted(false)
    setEditingRecord(null)
  }

  // Open Log Modal
  function handleOpenLog() {
    resetForm()
    setFormRepName(session?.user?.name || '')
    setShowLogModal(true)
  }

  // Open Edit Modal
  function handleOpenEdit(record: SSDLeadRecord) {
    setEditingRecord(record)
    setFormClientName(record.client_name)
    setFormLeadId(record.lead_id || '')
    setFormDate(record.date)
    setFormStatus(record.status)
    setFormClaimType(record.claim_type || 'SSDI+SSI')
    setFormOutcomeReason(record.outcome_reason || '')
    setFormOtherNotes(record.other_reason_notes || '')
    setFormRepName(record.rep_name)
    setFormIsConverted(Boolean(record.is_converted))
    setShowEditModal(true)
  }

  // Save Lead (Create or Update)
  async function handleSaveLead(e: React.FormEvent) {
    e.preventDefault()
    if (!formClientName.trim()) {
      setError("Please provide the Lead/Client's Name.")
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (editingRecord) {
        await safeFetchJson('/api/ssd-tracker', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingRecord.id,
            client_name: formClientName,
            lead_id: formLeadId || null,
            date: formDate,
            status: formStatus,
            claim_type: formClaimType || null,
            outcome_reason: formOutcomeReason || null,
            other_reason_notes: formOtherNotes || null,
            is_converted: formIsConverted,
            rep_name: (isSuper || isAdmin) ? formRepName : undefined,
          }),
        })
        setSuccess(`Lead record for "${formClientName}" updated successfully!`)
        setShowEditModal(false)
      } else {
        await safeFetchJson('/api/ssd-tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: formClientName,
            lead_id: formLeadId || null,
            date: formDate,
            status: formStatus,
            claim_type: formClaimType || null,
            outcome_reason: formOutcomeReason || null,
            other_reason_notes: formOtherNotes || null,
            rep_name: (isSuper || isAdmin) ? formRepName : undefined,
          }),
        })
        setSuccess(`Lead record for "${formClientName}" logged successfully!`)
        setShowLogModal(false)
      }
      resetForm()
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 1-Click Quick Status Updates
  async function handleQuickStatus(record: SSDLeadRecord, newStatus: string) {
    try {
      await safeFetchJson('/api/ssd-tracker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          status: newStatus,
        }),
      })
      setSuccess(`Lead "${record.client_name}" marked as ${newStatus}! 🎉`)
      fetchData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Delete Lead
  async function handleDelete(record: SSDLeadRecord) {
    if (!window.confirm(`Are you sure you want to delete lead record for "${record.client_name}"?`)) return
    try {
      await safeFetchJson(`/api/ssd-tracker?id=${record.id}`, { method: 'DELETE' })
      setSuccess(`Lead "${record.client_name}" deleted.`)
      fetchData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Import SSD Leads Spreadsheet
  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await safeFetchJson('/api/ssd-tracker/import', {
        method: 'POST',
        body: formData,
      })
      setSuccess(res.message || 'SSD Leads Spreadsheet imported successfully!')
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

  // Import Converted Cases Report
  async function handleConvertedSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!convertedFile) return
    setImporting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', convertedFile)
      const res = await safeFetchJson('/api/ssd-tracker/import-converted', {
        method: 'POST',
        body: formData,
      })
      setSuccess(res.message || 'CRM Converted Cases imported & synchronized successfully!')
      setShowConvertedModal(false)
      setConvertedFile(null)
      fetchData()
      setTimeout(() => setSuccess(''), 6000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  // Export to Excel
  function handleExportExcel() {
    if (entries.length === 0) {
      alert('No data to export.')
      return
    }
    const exportData = entries.map((e) => ({
      'Intake Rep Name': e.rep_name,
      "Lead's Name": e.client_name,
      'Lead ID': e.lead_id || '',
      'Date': e.date,
      'Status': e.status,
      'Type of Claim': e.claim_type || '',
      'Reasoning': e.outcome_reason || '',
      'Other Notes': e.other_reason_notes || '',
      'Converted': e.is_converted ? 'YES' : 'NO',
      'Signed At': e.signed_at || '',
      'Last Edited By': e.last_edited_by || '',
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'SSD Tracker')
    XLSX.writeFile(wb, `SSD_Intake_Tracker_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  // Status Badge Helper
  const getStatusBadge = (status: string, isConverted?: number) => {
    if (isConverted) {
      return <span style={{ background: 'rgba(16,185,129,0.25)', color: '#34d399', border: '1px solid rgba(16,185,129,0.5)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🎉 Converted to Case</span>
    }
    switch (status) {
      case 'Signed E-Sign':
        return <span style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399', border: '1px solid rgba(16,185,129,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>✅ Signed E-Sign</span>
      case 'Sent E-Sign':
        return <span style={{ background: 'rgba(59,130,246,0.18)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>⏳ Sent E-Sign</span>
      case 'Paper Retainer Sent':
        return <span style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>📄 Paper Retainer</span>
      case 'Sent RFC':
        return <span style={{ background: 'rgba(139,92,246,0.18)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>📑 Sent RFC</span>
      case 'Appointment Rescheduled':
        return <span style={{ background: 'rgba(6,182,212,0.18)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🗓️ Rescheduled</span>
      case 'Client Refused Help':
        return <span style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🚫 Refused Help</span>
      case 'Case Rejected':
        return <span style={{ background: 'rgba(107,114,128,0.25)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.4)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>❌ Rejected</span>
      default:
        return <span style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11 }}>{status}</span>
    }
  }

  // Claim Type Badge Helper
  const getClaimBadge = (claim?: string) => {
    if (!claim) return null
    return (
      <span style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
        {claim}
      </span>
    )
  }

  // Computed paginated entries
  const totalRecords = entries.length
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalRecords / (pageSize as number)) || 1
  const paginatedEntries = useMemo(() => {
    if (pageSize === 'all') return entries
    const start = (currentPage - 1) * (pageSize as number)
    return entries.slice(start, start + (pageSize as number))
  }, [entries, currentPage, pageSize])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navigation />

      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', maxWidth: 1400 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>💼</span>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                SSD Intake Tracker
              </h1>
              <span style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                Social Security Disability
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              Live SSD Intake workflow tracker with automated CRM Converted Cases synchronization.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {canManageTeam && (
              <>
                <button
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: 13, background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.35)', color: '#34d399', fontWeight: 700 }}
                  onClick={() => setShowConvertedModal(true)}
                >
                  🎉 Sync Converted Cases
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: 13 }}
                  onClick={() => setShowImportModal(true)}
                >
                  📥 Import Spreadsheet
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: 13 }}
                  onClick={handleExportExcel}
                >
                  📤 Export XLSX
                </button>
              </>
            )}
            <button
              className="btn-primary"
              style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700 }}
              onClick={handleOpenLog}
            >
              ➕ Log New SSD Lead
            </button>
          </div>
        </div>

        {/* Success & Error Toasts */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '12px 18px', borderRadius: 10, marginBottom: 20, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {success && (
          <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', padding: '12px 18px', borderRadius: 10, marginBottom: 20, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{success}</span>
            <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}

        {/* KPI Summary Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-primary)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Leads Logged</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{summary.total_leads}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Period total volume</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pending Retainers</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fbbf24' }}>{summary.pending_signatures}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{summary.sent_esigns} E-Sign · {summary.paper_sent} Paper</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Signed E-Signs</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399' }}>{summary.signed_esigns}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Signed conversion: {summary.signed_success_rate}%</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Sent RFC</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#c084fc' }}>{summary.sent_rfc}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Residual Functional Capacity</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #06b6d4' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Converted Cases</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#22d3ee' }}>{summary.converted_count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Case Conversion: {summary.case_conversion_rate}%</div>
            </div>
          </div>
        )}

        {/* Claim Types Breakdown Strip */}
        {summary && summary.claims_breakdown && (
          <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Claim Types Breakdown:</span>
            {Object.entries(summary.claims_breakdown).map(([claim, count]) => (
              <span
                key={claim}
                onClick={() => setClaimFilter(claimFilter === claim ? 'All' : claim)}
                style={{
                  background: claimFilter === claim ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.05)',
                  border: claimFilter === claim ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.1)',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  color: claimFilter === claim ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {claim}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Outcome Reasoning Breakdown Strip */}
        {summary && summary.reasons_breakdown && (
          <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Outcome Reasons:</span>
            {Object.entries(summary.reasons_breakdown).map(([reason, count]) => (
              <span
                key={reason}
                onClick={() => setReasonFilter(reasonFilter === reason ? 'All' : reason)}
                style={{
                  background: reasonFilter === reason ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.05)',
                  border: reasonFilter === reason ? '1px solid #c084fc' : '1px solid rgba(255,255,255,0.1)',
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  color: reasonFilter === reason ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {reason}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Tab & Filter Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          {/* Tabs */}
          <div className="glass-card" style={{ padding: '6px 10px', display: 'flex', gap: 6, width: 'fit-content', flexWrap: 'wrap' }}>
            <button
              className={`btn-secondary ${activeTab === 'all' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'all' ? 'var(--accent-primary)' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600 }}
              onClick={() => setActiveTab('all')}
            >
              📋 All Leads ({summary?.total_leads || 0})
            </button>
            <button
              className={`btn-secondary ${activeTab === 'pending' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'pending' ? '#f59e0b' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: activeTab === 'pending' ? '#000' : 'var(--text-secondary)' }}
              onClick={() => setActiveTab('pending')}
            >
              ⏳ Pending Retainers ({summary?.pending_signatures || 0})
            </button>
            <button
              className={`btn-secondary ${activeTab === 'signed' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'signed' ? '#10b981' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: activeTab === 'signed' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setActiveTab('signed')}
            >
              ✅ Signed E-Signs ({summary?.signed_esigns || 0})
            </button>
            <button
              className={`btn-secondary ${activeTab === 'rfc' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'rfc' ? '#8b5cf6' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: activeTab === 'rfc' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setActiveTab('rfc')}
            >
              📑 Sent RFC ({summary?.sent_rfc || 0})
            </button>
            <button
              className={`btn-secondary ${activeTab === 'converted' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'converted' ? '#06b6d4' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: activeTab === 'converted' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setActiveTab('converted')}
            >
              🎉 Converted Cases ({summary?.converted_count || 0})
            </button>
            <button
              className={`btn-secondary ${activeTab === 'refused' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'refused' ? '#ef4444' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: activeTab === 'refused' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setActiveTab('refused')}
            >
              🚫 Refused / Rejected ({(summary?.crh_count || 0) + (summary?.rejected_count || 0)})
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Search Client, Lead ID, Notes..."
              style={{ width: 220, fontSize: 13, margin: 0 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {(isSuper || isAdmin) && (
              <select
                className="input-field"
                style={{ width: 190, fontSize: 13, margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
              >
                <option value="All" style={{ background: '#0a1628' }}>All Specialists</option>
                {repsList.length > 0 && (
                  <optgroup label="Active Specialists" style={{ background: '#0a1628', color: '#60a5fa' }}>
                    {repsList.map((r) => (
                      <option key={r.rep_username} value={r.rep_username} style={{ background: '#0a1628', color: '#fff' }}>
                        {r.rep_name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {historicalReps.length > 0 && (
                  <optgroup label="Historical / Inactive" style={{ background: '#0a1628', color: '#9ca3af' }}>
                    {historicalReps.map((r) => (
                      <option key={r.rep_username} value={r.rep_username} style={{ background: '#0a1628', color: '#d1d5db' }}>
                        {r.rep_name} (Past)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}

            <input
              type="date"
              className="input-field"
              style={{ width: 140, fontSize: 13, margin: 0 }}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>to</span>
            <input
              type="date"
              className="input-field"
              style={{ width: 140, fontSize: 13, margin: 0 }}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {/* Leads Table */}
        <div className="glass-card" style={{ padding: 20, overflowX: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              ⏳ Loading SSD Intake leads...
            </div>
          ) : entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              No SSD lead records found for this period and filter selection.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Specialist</th>
                  <th style={{ padding: '10px 12px' }}>Lead / Client Name</th>
                  <th style={{ padding: '10px 12px' }}>Lead ID</th>
                  <th style={{ padding: '10px 12px' }}>Claim Type</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Outcome / Notes</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aging</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEntries.map((record) => {
                  const daysOld = differenceInDays(new Date(), new Date(record.date))
                  const isPending = record.status === 'Sent E-Sign' || record.status === 'Paper Retainer Sent'

                  return (
                    <tr
                      key={record.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {record.date}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 600 }}>
                        {record.rep_name}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#fff' }}>
                        {record.client_name}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                        {record.lead_id || '—'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {getClaimBadge(record.claim_type)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {getStatusBadge(record.status, record.is_converted)}
                      </td>
                      <td style={{ padding: '12px', maxWidth: 260 }}>
                        {record.outcome_reason && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>
                            {record.outcome_reason}
                          </span>
                        )}
                        {record.other_reason_notes && (
                          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontStyle: 'italic' }}>
                            "{record.other_reason_notes}"
                          </span>
                        )}
                        {!record.outcome_reason && !record.other_reason_notes && '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {isPending ? (
                          <span style={{
                            background: daysOld > 5 ? 'rgba(239,68,68,0.2)' : daysOld > 2 ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)',
                            color: daysOld > 5 ? '#f87171' : daysOld > 2 ? '#fbbf24' : '#60a5fa',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            {daysOld}d pending
                          </span>
                        ) : record.is_converted ? (
                          <span style={{ color: '#34d399', fontSize: 11, fontWeight: 700 }}>Converted 🎉</span>
                        ) : record.status === 'Signed E-Sign' ? (
                          <span style={{ color: '#34d399', fontSize: 11, fontWeight: 600 }}>Signed</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Completed</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleQuickStatus(record, 'Signed E-Sign')}
                              title="Mark as Signed E-Sign"
                              style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', padding: '4px 8px', borderRadius: 6, fontSize: 12, marginRight: 6, cursor: 'pointer', fontWeight: 600 }}
                            >
                              ✅ Sign
                            </button>
                            <button
                              onClick={() => handleQuickStatus(record, 'Sent RFC')}
                              title="Mark as Sent RFC"
                              style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#c084fc', padding: '4px 8px', borderRadius: 6, fontSize: 12, marginRight: 6, cursor: 'pointer', fontWeight: 600 }}
                            >
                              📑 RFC
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleOpenEdit(record)}
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12, marginRight: 6, cursor: 'pointer' }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(record)}
                          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Pagination Controls */}
          {totalRecords > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Showing <strong>{pageSize === 'all' ? 1 : Math.min((currentPage - 1) * (pageSize as number) + 1, totalRecords)}</strong> to{' '}
                <strong>{pageSize === 'all' ? totalRecords : Math.min(currentPage * (pageSize as number), totalRecords)}</strong> of{' '}
                <strong>{totalRecords.toLocaleString()}</strong> leads
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rows:</span>
                  <select
                    className="input-field"
                    style={{ padding: '4px 8px', fontSize: 12, margin: 0, width: 75, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    value={pageSize}
                    onChange={(e) => {
                      const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value)
                      setPageSize(val)
                      setCurrentPage(1)
                    }}
                  >
                    <option value={25} style={{ background: '#0a1628' }}>25</option>
                    <option value={50} style={{ background: '#0a1628' }}>50</option>
                    <option value={100} style={{ background: '#0a1628' }}>100</option>
                    <option value={250} style={{ background: '#0a1628' }}>250</option>
                    <option value="all" style={{ background: '#0a1628' }}>All</option>
                  </select>
                </div>

                {pageSize !== 'all' && totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    >
                      ◀ Prev
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 4px' }}>
                      Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                    </span>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* LOG NEW LEAD MODAL */}
        {showLogModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 550, padding: 28, background: '#0a1628', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>➕ Log New SSD Lead</h3>
                <button onClick={() => setShowLogModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>

              <form onSubmit={handleSaveLead}>
                {(isSuper || isAdmin) && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Intake Representative</label>
                    <select
                      className="input-field"
                      style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                      value={formRepName}
                      onChange={(e) => setFormRepName(e.target.value)}
                      required
                    >
                      <option value="" disabled style={{ background: '#0a1628' }}>Select Specialist</option>
                      {repsList.map((r) => (
                        <option key={r.rep_username} value={r.rep_name} style={{ background: '#0a1628' }}>{r.rep_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Lead / Client Name *</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '100%', margin: 0 }}
                      placeholder="e.g. Suzanne Stanley"
                      value={formClientName}
                      onChange={(e) => setFormClientName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Lead ID</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '100%', margin: 0 }}
                      placeholder="e.g. 809469"
                      value={formLeadId}
                      onChange={(e) => setFormLeadId(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Date *</label>
                    <input
                      type="date"
                      className="input-field"
                      style={{ width: '100%', margin: 0 }}
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Type of Claim *</label>
                    <select
                      className="input-field"
                      style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                      value={formClaimType}
                      onChange={(e) => setFormClaimType(e.target.value)}
                    >
                      {SSD_CLAIM_TYPES.map((c) => (
                        <option key={c} value={c} style={{ background: '#0a1628' }}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Status *</label>
                  <select
                    className="input-field"
                    style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                  >
                    {SSD_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s} style={{ background: '#0a1628' }}>{s}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Reasoning (Optional)</label>
                  <select
                    className="input-field"
                    style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    value={formOutcomeReason}
                    onChange={(e) => setFormOutcomeReason(e.target.value)}
                  >
                    <option value="" style={{ background: '#0a1628' }}>Select Outcome Reason...</option>
                    {SSD_OUTCOME_REASONS.map((r) => (
                      <option key={r} value={r} style={{ background: '#0a1628' }}>{r}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Free Hand Notes for "Other" / Follow-up</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    style={{ width: '100%', margin: 0 }}
                    placeholder="Specific follow-up notes, details for other reasons..."
                    value={formOtherNotes}
                    onChange={(e) => setFormOtherNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowLogModal(false)}
                    style={{ padding: '8px 16px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ padding: '8px 20px', fontWeight: 700 }}
                  >
                    {submitting ? 'Saving...' : 'Log SSD Lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDIT LEAD MODAL */}
        {showEditModal && editingRecord && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 550, padding: 28, background: '#0a1628', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>✏️ Edit SSD Lead</h3>
                <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>

              <form onSubmit={handleSaveLead}>
                {(isSuper || isAdmin) && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Intake Representative</label>
                    <select
                      className="input-field"
                      style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                      value={formRepName}
                      onChange={(e) => setFormRepName(e.target.value)}
                    >
                      {repsList.map((r) => (
                        <option key={r.rep_username} value={r.rep_name} style={{ background: '#0a1628' }}>{r.rep_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Lead / Client Name *</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '100%', margin: 0 }}
                      value={formClientName}
                      onChange={(e) => setFormClientName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Lead ID</label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '100%', margin: 0 }}
                      value={formLeadId}
                      onChange={(e) => setFormLeadId(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Date</label>
                    <input
                      type="date"
                      className="input-field"
                      style={{ width: '100%', margin: 0 }}
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Type of Claim</label>
                    <select
                      className="input-field"
                      style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                      value={formClaimType}
                      onChange={(e) => setFormClaimType(e.target.value)}
                    >
                      {SSD_CLAIM_TYPES.map((c) => (
                        <option key={c} value={c} style={{ background: '#0a1628' }}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Status</label>
                  <select
                    className="input-field"
                    style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                  >
                    {SSD_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s} style={{ background: '#0a1628' }}>{s}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="is_converted_chk"
                    checked={formIsConverted}
                    onChange={(e) => setFormIsConverted(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <label htmlFor="is_converted_chk" style={{ fontSize: 13, fontWeight: 700, color: '#34d399', cursor: 'pointer' }}>
                    🎉 Mark as Officially Converted to Case
                  </label>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Reasoning</label>
                  <select
                    className="input-field"
                    style={{ width: '100%', margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    value={formOutcomeReason}
                    onChange={(e) => setFormOutcomeReason(e.target.value)}
                  >
                    <option value="" style={{ background: '#0a1628' }}>Select Outcome Reason...</option>
                    {SSD_OUTCOME_REASONS.map((r) => (
                      <option key={r} value={r} style={{ background: '#0a1628' }}>{r}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Other Notes</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    style={{ width: '100%', margin: 0 }}
                    value={formOtherNotes}
                    onChange={(e) => setFormOtherNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowEditModal(false)}
                    style={{ padding: '8px 16px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ padding: '8px 20px', fontWeight: 700 }}
                  >
                    {submitting ? 'Saving...' : 'Update Lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* IMPORT SPREADSHEET MODAL */}
        {showImportModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 520, padding: 28, background: '#0a1628', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📥 Import SSD Leads Spreadsheet</h3>
                <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Upload your SSD Online Spreadsheet (.xlsx / .xls). Expected columns:
                <br />
                <code style={{ fontSize: 11, color: 'var(--accent-primary)', display: 'block', marginTop: 6 }}>
                  Rep Name · Client Name · Lead ID · Date · Status · Claim Type · Reasoning · Other Notes
                </code>
              </p>

              <form onSubmit={handleImportSubmit}>
                <div style={{ marginBottom: 20, border: '2px dashed rgba(255,255,255,0.15)', padding: 24, borderRadius: 10, textAlign: 'center' }}>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    required
                    style={{ color: '#fff', fontSize: 13 }}
                  />
                  {importFile && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#34d399' }}>
                      Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={importing || !importFile} style={{ fontWeight: 700 }}>
                    {importing ? 'Processing & Sanitizing...' : 'Upload & Import'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* IMPORT CRM CONVERTED CASES MODAL */}
        {showConvertedModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 540, padding: 28, background: '#0a1628', border: '1px solid rgba(16,185,129,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#34d399' }}>🎉 Sync CRM Converted Cases</h3>
                <button onClick={() => setShowConvertedModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Upload the CRM export <code>Converted-Status_Report-*.xlsx</code>.
                <br />
                The system will automatically match <strong>Lead IDs</strong> in your SSD Tracker, promote matching retainers to <strong>Signed E-Sign</strong>, set them as <strong>Converted</strong>, and update Dashboard conversion counts in real time.
              </p>

              <form onSubmit={handleConvertedSubmit}>
                <div style={{ marginBottom: 20, border: '2px dashed rgba(16,185,129,0.3)', padding: 24, borderRadius: 10, textAlign: 'center', background: 'rgba(16,185,129,0.03)' }}>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => setConvertedFile(e.target.files?.[0] || null)}
                    required
                    style={{ color: '#fff', fontSize: 13 }}
                  />
                  {convertedFile && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#34d399' }}>
                      Selected: <strong>{convertedFile.name}</strong> ({(convertedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowConvertedModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={importing || !convertedFile} style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: 700 }}>
                    {importing ? 'Synchronizing CRM Cases...' : 'Synchronize Converted Cases'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
