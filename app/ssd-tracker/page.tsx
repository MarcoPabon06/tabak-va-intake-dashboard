'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import ImportHistoryModal from '@/components/ImportHistoryModal'
import { format, subDays, startOfMonth, endOfMonth, differenceInDays } from 'date-fns'
import * as XLSX from 'xlsx'
import { SSD_STATUS_OPTIONS, SSD_CLAIM_TYPES, SSD_OUTCOME_REASONS } from '@/lib/ssdTrackerConstants'
import { safeFetchJson } from '@/lib/apiClient'

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
  import_batch_id?: string
  created_at?: string
  updated_at?: string
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
  signed_success_rate: number
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
  const [activePreset, setActivePreset] = useState('This month')
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

  const [trackerMode, setTrackerMode] = useState<'leads' | 'converted'>('leads')

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'signed' | 'rfc' | 'rescheduled' | 'refused'>('all')

  const [entries, setEntries] = useState<SSDLeadRecord[]>([])
  const [summary, setSummary] = useState<SsdSummary | null>(null)
  const [repsList, setRepsList] = useState<{ rep_name: string; rep_username: string }[]>([])
  const [historicalReps, setHistoricalReps] = useState<{ rep_name: string; rep_username: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Pagination State (Leads)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number | 'all'>(50)

  // Multi-Select State (Leads)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Converted Registry State
  const [convertedEntries, setConvertedEntries] = useState<any[]>([])
  const [convertedSummary, setConvertedSummary] = useState<{
    total_converted: number
    active_reps_count: number
    top_rep: string
    rep_breakdown: Record<string, number>
  } | null>(null)
  const [convertedRepsList, setConvertedRepsList] = useState<{ rep_name: string; rep_username: string }[]>([])
  const [convertedLoading, setConvertedLoading] = useState(false)
  const [convertedPage, setConvertedPage] = useState(1)
  const [convertedTotalPages, setConvertedTotalPages] = useState(1)
  const [convertedTotalCount, setConvertedTotalCount] = useState(0)
  const [convertedPageSize, setConvertedPageSize] = useState<number | 'all'>(50)
  const [convertedSearch, setConvertedSearch] = useState('')
  const [debouncedConvertedSearch, setDebouncedConvertedSearch] = useState('')
  const [convertedRepFilter, setConvertedRepFilter] = useState('All')
  const [selectedConvertedIds, setSelectedConvertedIds] = useState<number[]>([])
  const [showConvertedDeleteModal, setShowConvertedDeleteModal] = useState(false)
  const [showConvertedSyncModal, setShowConvertedSyncModal] = useState(false)
  const [convertedSyncFile, setConvertedSyncFile] = useState<File | null>(null)
  const [convertedSyncing, setConvertedSyncing] = useState(false)

  // Debounce search for Converted Cases
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedConvertedSearch(convertedSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [convertedSearch])

  // Modals
  const [showLogModal, setShowLogModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
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
  const [formSignedDate, setFormSignedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [submitting, setSubmitting] = useState(false)

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

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
        params.set('status', 'Signed')
      } else if (activeTab === 'rfc') {
        params.set('status', 'Sent RFC')
      } else if (activeTab === 'rescheduled') {
        params.set('status', 'Rescheduled')
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

  // Fetch Converted Cases Registry
  const fetchConvertedData = useCallback(async () => {
    setConvertedLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (convertedRepFilter !== 'All') params.set('rep', convertedRepFilter)
      if (debouncedConvertedSearch.trim()) params.set('search', debouncedConvertedSearch.trim())
      params.set('page', String(convertedPage))
      params.set('limit', String(convertedPageSize))

      const json = await safeFetchJson(`/api/ssd-tracker/converted-cases?${params.toString()}`)
      setConvertedEntries(json.records || [])
      setConvertedSummary(json.summary || null)
      setConvertedTotalCount(json.total_count || 0)
      setConvertedTotalPages(json.total_pages || 1)
      if (json.reps_list) setConvertedRepsList(json.reps_list)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConvertedLoading(false)
    }
  }, [from, to, convertedRepFilter, debouncedConvertedSearch, convertedPage, convertedPageSize])

  useEffect(() => {
    if (trackerMode === 'converted') {
      fetchConvertedData()
    }
  }, [trackerMode, fetchConvertedData])

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
    setFormSignedDate(format(new Date(), 'yyyy-MM-dd'))
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
    setFormSignedDate(record.signed_at ? record.signed_at.slice(0, 10) : record.date)
    setFormClaimType(record.claim_type || 'SSDI+SSI')
    setFormOutcomeReason(record.outcome_reason || '')
    setFormOtherNotes(record.other_reason_notes || '')
    setFormRepName(record.rep_name)
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
            signed_at: formStatus === 'Signed E-Sign' ? (formSignedDate ? `${formSignedDate} 12:00:00` : undefined) : null,
            claim_type: formClaimType || null,
            outcome_reason: formOutcomeReason || null,
            other_reason_notes: formOtherNotes || null,
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
            signed_at: formStatus === 'Signed E-Sign' ? (formSignedDate ? `${formSignedDate} 12:00:00` : undefined) : null,
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

  // Multi-Select Helpers
  const toggleSelectRow = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    const visibleIds = paginatedEntries.map(e => e.id)
    const allSelected = visibleIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)))
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const selectAllFiltered = () => {
    const allFilteredIds = entries.map(e => e.id)
    setSelectedIds(allFilteredIds)
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  // Bulk Delete
  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    setBulkDeleting(true)
    setError('')
    try {
      const res = await safeFetchJson('/api/ssd-tracker', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      setSuccess(res.message || `Successfully deleted ${selectedIds.length} lead records.`)
      setSelectedIds([])
      setShowBulkDeleteModal(false)
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBulkDeleting(false)
    }
  }

  // Delete Single Lead
  async function handleDelete(record: SSDLeadRecord) {
    if (!window.confirm(`Are you sure you want to delete lead record for "${record.client_name}"?`)) return
    try {
      await safeFetchJson(`/api/ssd-tracker?id=${record.id}`, { method: 'DELETE' })
      setSuccess(`Lead "${record.client_name}" deleted.`)
      setSelectedIds(prev => prev.filter(id => id !== record.id))
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
      'Signed At': e.signed_at || '',
      'Last Edited By': e.last_edited_by || '',
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'SSD Tracker')
    XLSX.writeFile(wb, `SSD_Intake_Tracker_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  // Export Converted Cases to Excel
  async function handleExportConvertedExcel() {
    if (convertedEntries.length === 0) {
      alert('No converted cases to export.')
      return
    }
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (convertedRepFilter !== 'All') params.set('rep', convertedRepFilter)
      if (debouncedConvertedSearch.trim()) params.set('search', debouncedConvertedSearch.trim())
      params.set('limit', 'all')

      const json = await safeFetchJson(`/api/ssd-tracker/converted-cases?${params.toString()}`)
      const rows = (json.records || convertedEntries).map((c: any) => ({
        'Date Converted': c.date_converted,
        'Intake Specialist': c.rep_name,
        "Lead's Name": c.client_name,
        'Lead ID': c.lead_id || '',
        'Tags / Reason': c.raw_tags || '',
        'Import Batch': c.import_batch_id || '',
        'Imported By': c.imported_by || '',
        'Imported At': c.created_at || '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Converted Cases')
      XLSX.writeFile(wb, `SSD_Converted_Cases_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    }
  }

  // Sync Converted Cases (Idle Time report)
  async function handleSyncConvertedSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!convertedSyncFile) return
    setConvertedSyncing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', convertedSyncFile)
      const res = await safeFetchJson('/api/ssd-tracker/import-converted', {
        method: 'POST',
        body: formData,
      })
      setSuccess(res.message || 'Converted Cases synced successfully!')
      setShowConvertedSyncModal(false)
      setConvertedSyncFile(null)
      fetchConvertedData()
      fetchData()
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConvertedSyncing(false)
    }
  }

  // Delete Single Converted Case
  async function handleDeleteConverted(record: any) {
    if (!window.confirm(`Are you sure you want to delete converted record for "${record.client_name}" (Lead ID: ${record.lead_id})?`)) return
    try {
      await safeFetchJson(`/api/ssd-tracker/converted-cases?id=${record.id}`, { method: 'DELETE' })
      setSuccess(`Converted case for "${record.client_name}" deleted.`)
      setSelectedConvertedIds(prev => prev.filter(id => id !== record.id))
      fetchConvertedData()
      fetchData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Bulk Delete Converted Cases
  async function handleBulkDeleteConverted() {
    if (selectedConvertedIds.length === 0) return
    setBulkDeleting(true)
    setError('')
    try {
      const res = await safeFetchJson('/api/ssd-tracker/converted-cases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedConvertedIds }),
      })
      setSuccess(res.message || `Deleted ${selectedConvertedIds.length} converted records.`)
      setSelectedConvertedIds([])
      setShowConvertedDeleteModal(false)
      fetchConvertedData()
      fetchData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBulkDeleting(false)
    }
  }

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
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
              Live SSD Intake workflow tracker replicating the master spreadsheet.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {canManageTeam && (
              <>
                <button
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: 13, background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.35)', color: '#34d399', fontWeight: 600 }}
                  onClick={() => setShowConvertedSyncModal(true)}
                  title="Upload Converted Status / Idle Time report"
                >
                  🔄 Sync Converted Cases
                </button>
                {trackerMode === 'leads' ? (
                  <>
                    <button
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: 13 }}
                      onClick={() => setShowImportModal(true)}
                    >
                      📥 Import Spreadsheet
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: 13, background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}
                      onClick={() => setShowHistoryModal(true)}
                      title="View past spreadsheet imports and undo/revert if needed"
                    >
                      ⏪ History & Rollback
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: 13 }}
                      onClick={handleExportExcel}
                    >
                      📤 Export XLSX
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: 13, background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}
                      onClick={() => setShowHistoryModal(true)}
                      title="View past converted imports and undo/revert if needed"
                    >
                      ⏪ History & Rollback
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: 13 }}
                      onClick={handleExportConvertedExcel}
                    >
                      📤 Export Converted XLSX
                    </button>
                  </>
                )}
              </>
            )}
            {trackerMode === 'leads' && (
              <button
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700 }}
                onClick={handleOpenLog}
              >
                ➕ Log New SSD Lead
              </button>
            )}
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

        {/* Main View Switcher: Leads Log vs Converted Cases Registry */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          <button
            onClick={() => setTrackerMode('leads')}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: trackerMode === 'leads' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
              color: trackerMode === 'leads' ? '#fff' : 'var(--text-secondary)',
              border: trackerMode === 'leads' ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: trackerMode === 'leads' ? '0 0 15px rgba(59,130,246,0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            📋 SSD Leads Log
          </button>
          <button
            onClick={() => setTrackerMode('converted')}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: trackerMode === 'converted' ? '#10b981' : 'rgba(255,255,255,0.05)',
              color: trackerMode === 'converted' ? '#fff' : 'var(--text-secondary)',
              border: trackerMode === 'converted' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: trackerMode === 'converted' ? '0 0 15px rgba(16,185,129,0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            🎉 Converted Cases Registry {convertedTotalCount > 0 && `(${convertedTotalCount.toLocaleString()})`}
          </button>
        </div>

        {trackerMode === 'leads' && (
          <div>
            {/* KPI Summary Cards */}
            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
                <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-primary)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Leads</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{summary.total_leads}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Total logged volume</div>
                </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Sent Retainers</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fbbf24' }}>{summary.pending_signatures}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{summary.sent_esigns} E-Sign · {summary.paper_sent} Paper</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Signed Retainers</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399' }}>{summary.signed_esigns}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Signed Rate: <strong>{summary.signed_success_rate}%</strong></div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Sent RFC</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#c084fc' }}>{summary.sent_rfc}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Residual Functional Capacity</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #06b6d4' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Rescheduled</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#22d3ee' }}>{summary.rescheduled}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Appt. Rescheduled</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Refused / Rejected</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f87171' }}>{summary.crh_count + summary.rejected_count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{summary.crh_count} CRH · {summary.rejected_count} Rejected</div>
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
              ✅ Signed Retainers ({summary?.signed_esigns || 0})
            </button>
            <button
              className={`btn-secondary ${activeTab === 'rfc' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'rfc' ? '#8b5cf6' : 'transparent', border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 600, color: activeTab === 'rfc' ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setActiveTab('rfc')}
            >
              📑 Sent RFC ({summary?.sent_rfc || 0})
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

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                    background: activePreset === p.label ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                    color: activePreset === p.label ? '#fff' : '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.08)',
                    transition: 'all 0.2s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="input-field"
                style={{ width: 135, fontSize: 12, margin: 0, padding: '4px 8px' }}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setActivePreset('Custom')
                }}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>to</span>
              <input
                type="date"
                className="input-field"
                style={{ width: 135, fontSize: 12, margin: 0, padding: '4px 8px' }}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setActivePreset('Custom')
                }}
              />
            </div>
          </div>
        </div>

        {/* Floating / Sticky Bulk Actions Toolbar */}
        {selectedIds.length > 0 && (
          <div
            className="glass-card"
            style={{
              padding: '12px 20px',
              marginBottom: 16,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              animation: 'fadeIn 0.2s ease-in-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
                ☑️ {selectedIds.length} lead record{selectedIds.length === 1 ? '' : 's'} selected
              </span>
              {entries.length > selectedIds.length && (
                <button
                  onClick={selectAllFiltered}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#60a5fa',
                    fontSize: 12,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Select all {entries.length} matching leads
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn-secondary"
                onClick={clearSelection}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                ✕ Deselect All
              </button>
              {canManageTeam && (
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  style={{
                    background: '#ef4444',
                    border: '1px solid #dc2626',
                    color: '#fff',
                    padding: '6px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  🗑️ Delete Selected ({selectedIds.length})
                </button>
              )}
            </div>
          </div>
        )}

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
                  {canManageTeam && (
                    <th style={{ width: 36, padding: '10px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={paginatedEntries.length > 0 && paginatedEntries.every(e => selectedIds.includes(e.id))}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                        title="Select/Deselect All on this page"
                      />
                    </th>
                  )}
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
                  const isSelected = selectedIds.includes(record.id)

                  return (
                    <tr
                      key={record.id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {canManageTeam && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(record.id)}
                            style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                          />
                        </td>
                      )}
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
                        {getStatusBadge(record.status)}
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
                        ) : record.status === 'Signed E-Sign' ? (
                          <span style={{ color: '#34d399', fontSize: 11, fontWeight: 600 }}>
                            Signed {record.signed_at ? `(${record.signed_at.slice(0, 10)})` : ''}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Completed</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleQuickStatus(record, 'Signed E-Sign')}
                              title="Mark agreement as Signed"
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
      </div>
    )}

    {/* CONVERTED CASES REGISTRY VIEW */}
    {trackerMode === 'converted' && (
      <div>
        {/* KPI Summary Cards */}
        {convertedSummary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Converted Cases</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399' }}>{convertedSummary.total_converted.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Cases converted in selected period</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-primary)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Active Intake Reps</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#60a5fa' }}>{convertedSummary.active_reps_count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Specialists with conversions</div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Top Specialist</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convertedSummary.top_rep}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Highest volume converter</div>
            </div>
          </div>
        )}

        {/* Rep Breakdown Pills */}
        {convertedSummary && convertedSummary.rep_breakdown && Object.keys(convertedSummary.rep_breakdown).length > 0 && (
          <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Converted by Specialist:</span>
            {Object.entries(convertedSummary.rep_breakdown).map(([rep, count]) => (
              <span
                key={rep}
                onClick={() => {
                  setConvertedRepFilter(convertedRepFilter === rep ? 'All' : rep)
                  setConvertedPage(1)
                }}
                style={{
                  background: convertedRepFilter === rep ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.05)',
                  border: convertedRepFilter === rep ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.1)',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  color: convertedRepFilter === rep ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {rep}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Converted Filter & Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input-field"
              placeholder="🔍 Search Lead ID, Client Name, Specialist..."
              style={{ width: 300, fontSize: 13, margin: 0 }}
              value={convertedSearch}
              onChange={(e) => {
                setConvertedSearch(e.target.value)
                setConvertedPage(1)
              }}
            />

            {(isSuper || isAdmin) && (
              <select
                className="input-field"
                style={{ width: 200, fontSize: 13, margin: 0, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                value={convertedRepFilter}
                onChange={(e) => {
                  setConvertedRepFilter(e.target.value)
                  setConvertedPage(1)
                }}
              >
                <option value="All" style={{ background: '#0a1628' }}>All Specialists</option>
                {convertedRepsList.map((r) => (
                  <option key={r.rep_name} value={r.rep_name} style={{ background: '#0a1628' }}>
                    {r.rep_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setActivePreset(p.label)
                    const range = p.getValue()
                    setFrom(range.from)
                    setTo(range.to)
                    setConvertedPage(1)
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: activePreset === p.label ? '#10b981' : 'rgba(255,255,255,0.05)',
                    color: activePreset === p.label ? '#fff' : '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.08)',
                    transition: 'all 0.2s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="input-field"
                style={{ width: 135, fontSize: 12, margin: 0, padding: '4px 8px' }}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setActivePreset('Custom')
                  setConvertedPage(1)
                }}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>to</span>
              <input
                type="date"
                className="input-field"
                style={{ width: 135, fontSize: 12, margin: 0, padding: '4px 8px' }}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setActivePreset('Custom')
                  setConvertedPage(1)
                }}
              />
            </div>
          </div>
        </div>

        {/* Bulk Selection Bar */}
        {selectedConvertedIds.length > 0 && (
          <div
            className="glass-card"
            style={{
              padding: '12px 20px',
              marginBottom: 16,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>🗑️</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>
                {selectedConvertedIds.length} converted record{selectedConvertedIds.length === 1 ? '' : 's'} selected
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                style={{ padding: '6px 14px', fontSize: 12 }}
                onClick={() => setSelectedConvertedIds([])}
              >
                Deselect All
              </button>
              <button
                style={{
                  background: '#ef4444',
                  border: '1px solid #dc2626',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                onClick={() => setShowConvertedDeleteModal(true)}
              >
                Delete Selected ({selectedConvertedIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Converted Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {convertedLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p>Searching and loading converted cases registry...</p>
            </div>
          ) : convertedEntries.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🎉</span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                No converted cases found
              </p>
              <p style={{ fontSize: 13 }}>
                Try broadening your date filter or search query, or click <strong>"🔄 Sync Converted Cases"</strong> to import a report.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {canManageTeam && (
                    <th style={{ padding: '12px 14px', width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={convertedEntries.length > 0 && selectedConvertedIds.length === convertedEntries.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedConvertedIds(convertedEntries.map((c) => c.id))
                          } else {
                            setSelectedConvertedIds([])
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                  )}
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', width: 120 }}>Date Converted</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', width: 180 }}>Intake Specialist</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Lead / Client Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', width: 120 }}>Lead ID</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', width: 160 }}>Tags / Notes</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', width: 180 }}>Imported By / Date</th>
                  {canManageTeam && (
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)', width: 80 }}>Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {convertedEntries.map((item: any, idx: number) => {
                  const isSelected = selectedConvertedIds.includes(item.id)
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: isSelected ? 'rgba(239, 68, 68, 0.08)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'),
                        transition: 'background 0.15s',
                      }}
                    >
                      {canManageTeam && (
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedConvertedIds((prev) => [...prev, item.id])
                              } else {
                                setSelectedConvertedIds((prev) => prev.filter((id) => id !== item.id))
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                      )}
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#34d399' }}>
                        {item.date_converted}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#fff' }}>
                        {item.rep_name}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>
                        {item.client_name}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {item.lead_id && item.lead_id !== '—' ? (
                          <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
                            #{item.lead_id}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {item.raw_tags || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 11 }}>
                        <div>{item.imported_by || 'Admin'}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>{item.created_at?.slice(0, 16)}</div>
                      </td>
                      {canManageTeam && (
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteConverted(item)}
                            title="Delete this converted record"
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, opacity: 0.7 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Converted Pagination Footer */}
          {convertedTotalCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Showing <strong>{convertedPageSize === 'all' ? 1 : Math.min((convertedPage - 1) * (convertedPageSize as number) + 1, convertedTotalCount)}</strong> to{' '}
                <strong>{convertedPageSize === 'all' ? convertedTotalCount : Math.min(convertedPage * (convertedPageSize as number), convertedTotalCount)}</strong> of{' '}
                <strong>{convertedTotalCount.toLocaleString()}</strong> converted cases
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rows:</span>
                  <select
                    className="input-field"
                    style={{ padding: '4px 8px', fontSize: 12, margin: 0, width: 75, background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    value={convertedPageSize}
                    onChange={(e) => {
                      const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value)
                      setConvertedPageSize(val)
                      setConvertedPage(1)
                    }}
                  >
                    <option value={25} style={{ background: '#0a1628' }}>25</option>
                    <option value={50} style={{ background: '#0a1628' }}>50</option>
                    <option value={100} style={{ background: '#0a1628' }}>100</option>
                    <option value={250} style={{ background: '#0a1628' }}>250</option>
                    <option value="all" style={{ background: '#0a1628' }}>All</option>
                  </select>
                </div>

                {convertedPageSize !== 'all' && convertedTotalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, opacity: convertedPage === 1 ? 0.4 : 1, cursor: convertedPage === 1 ? 'not-allowed' : 'pointer' }}
                      disabled={convertedPage === 1}
                      onClick={() => setConvertedPage((p) => Math.max(p - 1, 1))}
                    >
                      ◀ Prev
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 4px' }}>
                      Page <strong>{convertedPage}</strong> of <strong>{convertedTotalPages}</strong>
                    </span>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, opacity: convertedPage === convertedTotalPages ? 0.4 : 1, cursor: convertedPage === convertedTotalPages ? 'not-allowed' : 'pointer' }}
                      disabled={convertedPage === convertedTotalPages}
                      onClick={() => setConvertedPage((p) => Math.min(p + 1, convertedTotalPages))}
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

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

                {formStatus === 'Signed E-Sign' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#34d399' }}>
                      ✍️ Signed Date * (Date Retainer was Signed)
                    </label>
                    <input
                      type="date"
                      required
                      className="input-field"
                      style={{ width: '100%', margin: 0, borderColor: 'rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.05)' }}
                      value={formSignedDate}
                      onChange={(e) => setFormSignedDate(e.target.value)}
                    />
                  </div>
                )}

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

                {formStatus === 'Signed E-Sign' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#34d399' }}>
                      ✍️ Signed Date * (Date Retainer was Signed)
                    </label>
                    <input
                      type="date"
                      required
                      className="input-field"
                      style={{ width: '100%', margin: 0, borderColor: 'rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.05)' }}
                      value={formSignedDate}
                      onChange={(e) => setFormSignedDate(e.target.value)}
                    />
                  </div>
                )}

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

        {/* BULK DELETE CONFIRMATION MODAL */}
        {showBulkDeleteModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 480, padding: 28, background: '#0a1628', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>⚠️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f87171' }}>Confirm Bulk Deletion</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Permanent action</div>
                </div>
              </div>

              <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 20 }}>
                Are you sure you want to permanently delete <strong>{selectedIds.length}</strong> selected SSD lead record{selectedIds.length === 1 ? '' : 's'}?
                <br />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginTop: 8 }}>
                  This will remove them from all SSD tracker logs and recalculate conversion metrics immediately.
                </span>
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  style={{
                    background: '#ef4444',
                    border: '1px solid #dc2626',
                    color: '#fff',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {bulkDeleting ? 'Deleting...' : `Yes, Delete ${selectedIds.length} Records`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SYNC CONVERTED CASES MODAL */}
        {showConvertedSyncModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 520, padding: 28, background: '#0a1628', border: '1px solid rgba(16,185,129,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🔄</span>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#34d399' }}>Sync Converted Cases</h3>
                </div>
                <button onClick={() => setShowConvertedSyncModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Upload your <strong>Status Report (Converted Cases / Idle Time)</strong> spreadsheet (.xlsx / .xls).
                <br />
                <span style={{ color: 'var(--text-primary)', display: 'block', marginTop: 6, fontSize: 12 }}>
                  ✨ Automatically registers all individual converted leads into the <strong>Converted Cases Registry</strong> and synchronizes converted counts on the <strong>SSD Dashboard</strong> and <strong>EOD Report</strong>.
                </span>
              </p>

              <form onSubmit={handleSyncConvertedSubmit}>
                <div style={{ marginBottom: 20, border: '2px dashed rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.03)', padding: 24, borderRadius: 10, textAlign: 'center' }}>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => setConvertedSyncFile(e.target.files?.[0] || null)}
                    required
                    style={{ color: '#fff', fontSize: 13 }}
                  />
                  {convertedSyncFile && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#34d399' }}>
                      Selected: <strong>{convertedSyncFile.name}</strong> ({(convertedSyncFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowConvertedSyncModal(false)}>Cancel</button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={convertedSyncing || !convertedSyncFile}
                    style={{ fontWeight: 700, background: '#10b981', borderColor: '#059669' }}
                  >
                    {convertedSyncing ? 'Syncing & Updating...' : 'Sync Converted Cases'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CONVERTED CASES BULK DELETE MODAL */}
        {showConvertedDeleteModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: 480, padding: 28, background: '#0a1628', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>⚠️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f87171' }}>Delete Converted Records</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Permanent action</div>
                </div>
              </div>

              <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 20 }}>
                Are you sure you want to permanently delete <strong>{selectedConvertedIds.length}</strong> selected converted case record{selectedConvertedIds.length === 1 ? '' : 's'}?
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowConvertedDeleteModal(false)}
                  disabled={bulkDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteConverted}
                  disabled={bulkDeleting}
                  style={{
                    background: '#ef4444',
                    border: '1px solid #dc2626',
                    color: '#fff',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {bulkDeleting ? 'Deleting...' : `Yes, Delete ${selectedConvertedIds.length} Records`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IMPORT HISTORY & ROLLBACK MODAL */}
        <ImportHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          lob="SSD"
          onRollbackSuccess={() => {
            fetchData()
            fetchConvertedData()
          }}
        />

      </main>
    </div>
  )
}
