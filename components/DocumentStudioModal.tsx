'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { safeFetchJson } from '@/lib/apiClient'
import { downloadSignedDocumentPdf, DocumentData, AcknowledgementData } from '@/lib/pdfGenerator'
import FormattedMarkdown from './FormattedMarkdown'

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface ActiveSpecialist {
  id: number
  username: string
  display_name: string
  lob: string
}

const TEMPLATES: Record<string, { title: string; category: string; content: string }> = {
  attendance: {
    title: 'Operational Policy: Schedule Adherence & Punctuality Standards',
    category: 'Operational Policy',
    content: `### 1. Purpose & Operational Scope
This operational directive establishes mandatory schedule adherence, punctuality, and availability standards for all independent contractors providing intake support to **Tabak Law, LLC** through **Andes Workforce, LLC**.

### 2. Schedule Adherence Directives
- **Queue Readiness:** Contractors must be logged in, available in the phone queue, and operational at the exact scheduled shift start time.
- **Pacing & Availability:** Consistent availability in "Ready" status is mandatory to maintain intake pacing and veteran response times.
- **Unplanned Absence Reporting:** In the event of an unavoidable absence or technical emergency, contractors must notify their assigned Team Leader at least 30 minutes prior to shift start.

### 3. Compliance & Contractual Expectations
Adherence to scheduled hours is an essential benchmark of professional service delivery. Repeated unauthorized tardiness or unexcused queue departures will be reviewed and may result in formal contractual reassignment.`,
  },
  callbacks: {
    title: 'Standard Operating Procedure: Law Ruler Scheduled Callbacks Protocol',
    category: 'Standard Operating Procedure (SOP)',
    content: `### 1. Purpose
To ensure no veteran or Social Security claimant follow-up is missed, this Standard Operating Procedure (SOP) governs the handling, tracking, and resolution of **Scheduled Callbacks** within Law Ruler and the Tabak Operations Dashboard.

### 2. Mandatory Callback Workflow
- **Prompt Execution:** Contractors must initiate contact with the lead within 10 minutes of the agreed callback time.
- **Contemporaneous Outcome Updating:** It is strictly mandatory to update the callback status immediately upon call completion. Permissible outcomes are:
  - *Sent E-Sign:* Retainer sent for signature.
  - *Signed E-Sign:* Converted successfully.
  - *Contacting:* Lead not reached (promptly reschedule).
  - *Client Refused Help (CRH):* Mandatory reason recording required.
  - *Case Rejected:* Qualification rejection noted.
- **Overdue Callback Resolution:** All overdue callbacks must be prioritized and cleared before accepting new non-urgent queue transfers.

### 3. Audit & Adherence
Team Leadership monitors the Scheduled Callbacks Queue continuously. Unaddressed callbacks will be audited during 1-on-1 QA reviews.`,
  },
  rfc: {
    title: 'SSD Intake Directive: 24-Hour RFC Submission & Medical Follow-up',
    category: 'Process Directive',
    content: `### 1. Scope & Objective
This directive governs the timely transmission and processing of **Residual Functional Capacity (RFC)** forms and medical evidence for Social Security Disability (SSD) claims handled on behalf of **Tabak Law, LLC**.

### 2. Mandatory Timelines
- **24-Hour Turnaround:** All RFC requests consented to by the claimant must be dispatched within 24 hours of client interview completion.
- **Dashboard Tracking:** All sent RFC records must be contemporaneously logged in the SSD Tracker to enable accurate conversion rate analytics.
- **Follow-up Protocol:** For outstanding medical evidence, contractors must establish a 7-day reminder cadence until records are returned or escalated to the attorney team.

### 3. Compliance Standards
Timely RFC submissions directly impact hearing dates and claim allowance rates. Adherence to these deadlines is mandatory for all SSD intake specialists.`,
  },
  pip: {
    title: 'Performance & Quality Expectation Agreement',
    category: 'Performance Improvement Notice (PIP)',
    content: `### 1. Background & Context
This formal performance agreement outlines key benchmarks and quality milestones required to meet contractual service expectations for **Tabak Law, LLC** operations through **Andes Workforce, LLC**.

### 2. Performance Milestones & Focus Areas
- **Quality Assurance (QA) Standards:** Achieve and maintain an overall evaluation score of at least 85% across all core categories (Introduction, Qualification Assessment, Objection Handling, and Documentation).
- **Outreach Activity (CAPD):** Maintain daily outreach attempt pacing aligned with departmental goals.
- **Zero-Tolerance Compliance:** Strictly adhere to authorized legal disclaimers and avoid unauthorized legal misrepresentations.

### 3. Review Period & Next Steps
Performance will be audited weekly by Team Leadership over a 30-day monitoring period. Successful completion requires meeting all outlined benchmarks.`,
  },
}

export default function DocumentStudioModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'create' | 'roster' | 'settings'>('create')

  // Document creation form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Operational Policy')
  const [targetType, setTargetType] = useState<'ALL' | 'LOB' | 'INDIVIDUAL'>('ALL')
  const [targetLob, setTargetLob] = useState<'VA' | 'SSD' | 'APPS'>('VA')
  const [targetUsers, setTargetUsers] = useState<string[]>([])
  const [deadlineDate, setDeadlineDate] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [content, setContent] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishSuccessMsg, setPublishSuccessMsg] = useState('')
  const [formError, setFormError] = useState('')

  // Editor mode & preview states
  const [editorMode, setEditorMode] = useState<'write' | 'preview'>('write')
  const [showPreIssuancePreview, setShowPreIssuancePreview] = useState(false)
  const [viewingDoc, setViewingDoc] = useState<any | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const insertFormatting = (prefix: string, suffix: string = '', defaultPlaceholder: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) {
      setContent((prev) => prev + prefix + defaultPlaceholder + suffix)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentVal = content
    const selectedText = currentVal.substring(start, end)
    const textToInsert = selectedText || defaultPlaceholder
    const newText = currentVal.substring(0, start) + prefix + textToInsert + suffix + currentVal.substring(end)
    setContent(newText)

    setTimeout(() => {
      textarea.focus()
      const selectStart = start + prefix.length
      const selectEnd = selectStart + textToInsert.length
      textarea.setSelectionRange(selectStart, selectEnd)
    }, 10)
  }

  // Roster & documents state
  const [documents, setDocuments] = useState<any[]>([])
  const [activeSpecialists, setActiveSpecialists] = useState<ActiveSpecialist[]>([])
  const [selectedDocForRoster, setSelectedDocForRoster] = useState<any | null>(null)
  const [rosterList, setRosterList] = useState<any[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [loadingRoster, setLoadingRoster] = useState(false)

  // Voiding state
  const [docToVoid, setDocToVoid] = useState<any | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'VOIDED'>('ALL')

  // API Key config state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySavedMsg, setApiKeySavedMsg] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [keyPreview, setKeyPreview] = useState('')
  const [keySource, setKeySource] = useState('')

  const checkApiKeyStatus = useCallback(async () => {
    try {
      const res = await safeFetchJson('/api/settings')
      const hasKey = res.has_gemini_key === 'true' || res.has_env_gemini_key === 'true'
      setHasApiKey(hasKey)
      setKeyPreview(res.gemini_key_preview || (res.has_env_gemini_key ? 'Set in Environment' : ''))
      setKeySource(res.gemini_key_source || (res.has_gemini_key === 'true' ? 'Database' : 'Environment'))
    } catch {
      setHasApiKey(false)
    }
  }, [])

  // Fetch documents and specialists
  const fetchDocumentsData = useCallback(async () => {
    setLoadingDocs(true)
    try {
      const res = await safeFetchJson('/api/documents')
      if (res.documents) setDocuments(res.documents)
      if (res.activeSpecialists) setActiveSpecialists(res.activeSpecialists)
    } catch (err: any) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchDocumentsData()
      checkApiKeyStatus()
    }
  }, [isOpen, fetchDocumentsData, checkApiKeyStatus])

  // Load roster for a document
  const handleOpenRoster = async (doc: any) => {
    setSelectedDocForRoster(doc)
    setLoadingRoster(true)
    try {
      const res = await safeFetchJson(`/api/documents?id=${doc.id}`)
      if (res.roster) setRosterList(res.roster)
    } catch (err: any) {
      console.error('Failed to fetch roster:', err)
    } finally {
      setLoadingRoster(false)
    }
  }

  // AI draft generator
  const handleGenerateAi = async () => {
    if (!aiPrompt.trim()) {
      setFormError('Please enter a brief prompt or directive instructions for the AI to draft.')
      return
    }

    setAiGenerating(true)
    setFormError('')

    try {
      const res = await safeFetchJson('/api/documents/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          category,
          title: title.trim() || undefined,
          target_lob: targetType === 'LOB' ? targetLob : undefined,
        }),
      })

      if (res.content) {
        setContent(res.content)
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to generate AI draft')
    } finally {
      setAiGenerating(false)
    }
  }

  // Load Template
  const handleLoadTemplate = (key: string) => {
    const tmpl = TEMPLATES[key]
    if (tmpl) {
      setTitle(tmpl.title)
      setCategory(tmpl.category)
      setContent(tmpl.content)
    }
  }

  // Publish Document
  const handlePublish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!title.trim()) {
      setFormError('Document Title is required')
      return
    }
    if (!content.trim()) {
      setFormError('Document Content cannot be empty')
      return
    }
    if (targetType === 'INDIVIDUAL' && targetUsers.length === 0) {
      setFormError('Please select at least one specialist for individual targeting')
      return
    }

    setPublishing(true)
    setFormError('')

    try {
      const res = await safeFetchJson('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          content: content.trim(),
          target_type: targetType,
          target_lob: targetType === 'LOB' ? targetLob : null,
          target_users: targetType === 'INDIVIDUAL' ? targetUsers : null,
          deadline_date: deadlineDate || null,
          is_urgent: isUrgent,
          require_signature: true,
        }),
      })

      setPublishSuccessMsg(`🚀 Communication "${title.trim()}" published successfully! ${res.assigned_count} specialist(s) received signature requests.`)
      setTitle('')
      setContent('')
      setAiPrompt('')
      setDeadlineDate('')
      setIsUrgent(false)
      setTargetUsers([])
      setShowPreIssuancePreview(false)
      fetchDocumentsData()
      setActiveTab('roster')
      setTimeout(() => setPublishSuccessMsg(''), 5000)
    } catch (err: any) {
      setFormError(err.message || 'Failed to publish communication')
    } finally {
      setPublishing(false)
    }
  }

  // Generate & Download Pre-Issuance Test PDF
  const handleDownloadTestPdf = () => {
    const docData: DocumentData = {
      id: 0,
      title: title.trim() || 'Untitled Operational Directive',
      category: category || 'Operational Policy',
      content: content.trim() || 'No document body content provided.',
      created_by_name: 'Management (Test Preview)',
      created_by_role: 'manager',
      created_at: new Date().toISOString(),
      deadline_date: deadlineDate || null,
      target_type: targetType,
      target_lob: targetType === 'LOB' ? targetLob : null,
      status: 'PREVIEW',
    }

    const ackData: AcknowledgementData = {
      username: 'sample.specialist',
      user_display_name: '[Sample Specialist]',
      user_lob: targetType === 'LOB' ? targetLob : 'VA',
      status: 'PENDING',
    }

    downloadSignedDocumentPdf(docData, ackData)
  }

  // Archive Document
  const handleArchive = async (id: number, docTitle: string) => {
    if (!confirm(`Are you sure you want to archive "${docTitle}"?`)) return
    try {
      await safeFetchJson(`/api/documents?id=${id}`, { method: 'DELETE' })
      fetchDocumentsData()
      if (selectedDocForRoster?.id === id) {
        setSelectedDocForRoster(null)
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  const VOID_REASON_PRESETS = [
    'Document contained factual error / typo',
    'Superseded by updated policy / SOP',
    'Sent to incorrect department / LOB',
    'Issued prematurely / withdrawn by management',
  ]

  // Download PDF
  const handleDownloadDocPdf = (doc: any, ack?: any) => {
    const docData: DocumentData = {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      content: doc.content,
      created_by_name: doc.created_by_name,
      created_by_role: doc.created_by_role,
      created_at: doc.created_at,
      deadline_date: doc.deadline_date,
      target_type: doc.target_type,
      target_lob: doc.target_lob,
      status: doc.status,
      void_reason: doc.void_reason,
      voided_at: doc.voided_at,
      voided_by_name: doc.voided_by_name,
    }

    const ackData: AcknowledgementData | undefined = ack
      ? {
          id: ack.id,
          username: ack.username,
          user_display_name: ack.user_display_name,
          user_lob: ack.user_lob,
          status: ack.status,
          signature_text: ack.signature_text,
          signed_at: ack.signed_at,
          ip_address: ack.ip_address,
        }
      : undefined

    downloadSignedDocumentPdf(docData, ackData)
  }

  // Confirm Void Document
  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!docToVoid || !voidReason.trim()) return
    setVoiding(true)
    try {
      await safeFetchJson('/api/documents/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: docToVoid.id,
          void_reason: voidReason.trim(),
        }),
      })
      alert(`✅ "${docToVoid.title}" has been officially voided and removed from pending signature queues.`)
      setDocToVoid(null)
      setVoidReason('')
      fetchDocumentsData()
      if (selectedDocForRoster && selectedDocForRoster.id === docToVoid.id) {
        setSelectedDocForRoster({
          ...selectedDocForRoster,
          status: 'VOIDED',
          void_reason: voidReason.trim(),
          voided_at: new Date().toISOString(),
        })
      }
    } catch (err: any) {
      alert(`Failed to void document: ${err.message}`)
    } finally {
      setVoiding(false)
    }
  }

  // Save API Key
  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    try {
      await safeFetchJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: apiKeyInput.trim() }),
      })
      setApiKeySavedMsg('✅ Google Gemini API Key saved successfully!')
      setApiKeyInput('')
      await checkApiKeyStatus()
      setTimeout(() => setApiKeySavedMsg(''), 4000)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSavingKey(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1500,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="fade-in"
        style={{
          maxWidth: 1080,
          width: '100%',
          maxHeight: '92vh',
          background: '#0a1628',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 30px 70px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(90deg, #0d213f 0%, #0a1728 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 8 }}>
              <img src="/logos/logo-andes.webp" alt="Andes Workforce" style={{ height: 24, objectFit: 'contain' }} />
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              <img src="/logos/logo-tabak.png" alt="Tabak Law, LLC" style={{ height: 24, objectFit: 'contain' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📜</span> Communications & Signable Documents Studio
              </h2>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0 0' }}>
                Draft, issue, and audit electronic signatures on operational policies and team directives.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 22,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            padding: '0 24px',
          }}
        >
          {[
            { id: 'create', label: '✍️ Draft & Issue Communication' },
            { id: 'roster', label: `📊 Signatures & Audit Roster (${documents.length})` },
            { id: 'settings', label: '⚙️ AI Studio Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any)
                if (tab.id !== 'roster') setSelectedDocForRoster(null)
              }}
              style={{
                padding: '14px 20px',
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                background: 'transparent',
                color: activeTab === tab.id ? '#60a5fa' : '#94a3b8',
                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Toast */}
          {publishSuccessMsg && (
            <div
              className="fade-in"
              style={{
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.4)',
                color: '#34d399',
                padding: '12px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 20,
              }}
            >
              {publishSuccessMsg}
            </div>
          )}

          {formError && (
            <div
              className="fade-in"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#f87171',
                padding: '12px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 20,
              }}
            >
              ⚠️ {formError}
            </div>
          )}

          {/* TAB 1: DRAFT & ISSUE */}
          {activeTab === 'create' && (
            <form onSubmit={handlePublish} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Row 1: Title & Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                    DOCUMENT TITLE *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Schedule Adherence & Punctuality Policy Update"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, fontSize: 13, width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                    CATEGORY / DOCUMENT TYPE
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, fontSize: 13, width: '100%', background: '#0a1628', color: '#fff' }}
                  >
                    <option value="Operational Policy">Operational Policy</option>
                    <option value="Standard Operating Procedure (SOP)">Standard Operating Procedure (SOP)</option>
                    <option value="Process Directive">Process Directive</option>
                    <option value="Performance Improvement Notice (PIP)">Performance Improvement Notice (PIP)</option>
                    <option value="Quality & Compliance Standard">Quality & Compliance Standard</option>
                    <option value="General Team Announcement">General Team Announcement</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Target Audience & Priority */}
              <div className="glass-card" style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12 }}>
                  🎯 Target Audience & Signature Requirements
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                      Target Scope
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { id: 'ALL', label: '👥 Company-Wide' },
                        { id: 'LOB', label: '🏛️ By Division' },
                        { id: 'INDIVIDUAL', label: '👤 Specific Reps' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTargetType(t.id as any)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: targetType === t.id ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                            color: targetType === t.id ? '#fff' : '#94a3b8',
                            border: targetType === t.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {targetType === 'LOB' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                        Select Line of Business
                      </label>
                      <select
                        value={targetLob}
                        onChange={(e) => setTargetLob(e.target.value as any)}
                        className="input-field"
                        style={{ margin: 0, fontSize: 12, width: '100%', background: '#0a1628', color: '#fff' }}
                      >
                        <option value="VA">VA Intake Division</option>
                        <option value="SSD">SSD Intake Division</option>
                        <option value="APPS">Apps Team (SSA Filings)</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                      Signature Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      className="input-field"
                      style={{ margin: 0, fontSize: 12, width: '100%' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#fff' }}>
                      <input
                        type="checkbox"
                        checked={isUrgent}
                        onChange={(e) => setIsUrgent(e.target.checked)}
                        style={{ accentColor: '#ef4444', width: 16, height: 16 }}
                      />
                      <span style={{ color: isUrgent ? '#f87171' : '#cbd5e1', fontWeight: isUrgent ? 800 : 500 }}>
                        🚨 Mark as URGENT Priority
                      </span>
                    </label>
                  </div>
                </div>

                {/* Individual Selection Multi-Checklist */}
                {targetType === 'INDIVIDUAL' && (
                  <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                      Select Active Representatives to Receive this Communication:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, maxHeight: 160, overflowY: 'auto', paddingRight: 6 }}>
                      {activeSpecialists.map((s) => {
                        const isChecked = targetUsers.includes(s.username)
                        return (
                          <label
                            key={s.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 10px',
                              borderRadius: 6,
                              background: isChecked ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                              border: isChecked ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                              fontSize: 12,
                              cursor: 'pointer',
                              color: isChecked ? '#fff' : '#cbd5e1',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTargetUsers((prev) => [...prev, s.username])
                                } else {
                                  setTargetUsers((prev) => prev.filter((u) => u !== s.username))
                                }
                              }}
                              style={{ accentColor: '#3b82f6' }}
                            />
                            <span>{s.display_name}</span>
                            <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 'auto' }}>{s.lob}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 3: Drafting Assistant & Templates Toolbar */}
              <div className="glass-card" style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>⚡ Quick Drafting Accelerators</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('attendance')}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      📋 Punctuality Template
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('callbacks')}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      📋 Callbacks SOP
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('rfc')}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      📋 RFC Directive
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate('pip')}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      📋 Performance Plan
                    </button>
                  </div>
                </div>

                {/* AI Prompt Bar */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="✨ Ask Gemini AI to draft this policy (e.g. 'Write a clear policy reminding the VA team about callback adherence...')"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, fontSize: 12, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateAi}
                    disabled={aiGenerating}
                    className="btn-primary"
                    style={{
                      padding: '8px 18px',
                      fontSize: 12,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                      border: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {aiGenerating ? 'Generating Draft...' : '✨ AI Draft with Gemini'}
                  </button>
                </div>
              </div>

              {/* Row 4: Document Content Markdown Editor & Live Preview */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                    DOCUMENT BODY CONTENT (MARKDOWN) *
                  </label>

                  {/* Write vs Live Preview Mode Switcher */}
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => setEditorMode('write')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: editorMode === 'write' ? '#3b82f6' : 'transparent',
                        color: editorMode === 'write' ? '#fff' : '#94a3b8',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span>✏️</span> Edit Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('preview')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: editorMode === 'preview' ? '#3b82f6' : 'transparent',
                        color: editorMode === 'preview' ? '#fff' : '#94a3b8',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span>👁️</span> Live Preview
                    </button>
                  </div>
                </div>

                {editorMode === 'write' ? (
                  <div>
                    {/* Formatting Action Toolbar */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderBottom: 'none',
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => insertFormatting('**', '**', 'bold text')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 800 }}
                        title="Bold (**text**)"
                      >
                        <strong>B</strong>
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('*', '*', 'italic text')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontStyle: 'italic' }}
                        title="Italic (*text*)"
                      >
                        <em>I</em>
                      </button>

                      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

                      <button
                        type="button"
                        onClick={() => insertFormatting('# ', '', 'Major Directive Title')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
                        title="Heading 1 (# Heading)"
                      >
                        H1
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('## ', '', 'Section Title')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
                        title="Heading 2 (## Section)"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('### ', '', '1. Subsection Title')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
                        title="Heading 3 (### Subsection)"
                      >
                        H3
                      </button>

                      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

                      <button
                        type="button"
                        onClick={() => insertFormatting('- ', '', 'Bullet directive point')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        title="Bullet List (- item)"
                      >
                        • List
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('1. ', '', 'Numbered action step')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        title="Numbered List (1. step)"
                      >
                        1. List
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('> ', '', 'Important compliance note or exception')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        title="Callout Note (> Quote)"
                      >
                        ❝ Callout
                      </button>
                      <button
                        type="button"
                        onClick={() => insertFormatting('\n---\n', '', '')}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        title="Divider Line (---)"
                      >
                        — Divider
                      </button>

                      <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 'auto' }}>
                        Highlight text & click toolbar to format
                      </span>
                    </div>

                    <textarea
                      ref={textareaRef}
                      required
                      rows={14}
                      placeholder="Enter the full text of the policy or directive here (or click Quick Drafting Accelerators above)..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="input-field"
                      style={{
                        margin: 0,
                        fontSize: 13,
                        width: '100%',
                        fontFamily: 'monospace',
                        lineHeight: 1.5,
                        resize: 'vertical',
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      minHeight: 330,
                      maxHeight: 460,
                      overflowY: 'auto',
                      padding: '20px 24px',
                      background: 'rgba(15,23,42,0.85)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 8,
                    }}
                  >
                    {content.trim() ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>
                            👁️ INLINE DRAFT PREVIEW (DARK MODE)
                          </span>
                          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                            Headings, bold text, lists, and callouts rendered
                          </span>
                        </div>
                        <FormattedMarkdown content={content} isDark={true} />
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b', fontSize: 13 }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
                        No document body content entered yet.
                        <br />
                        Switch back to <strong>Edit Markdown</strong> or use an accelerator above to compose your communication.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit & Preview Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  style={{ fontSize: 13 }}
                >
                  Cancel
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!title.trim() && !content.trim()) {
                        setFormError('Please enter a document title and body content before previewing.')
                        return
                      }
                      setFormError('')
                      setShowPreIssuancePreview(true)
                    }}
                    style={{
                      background: 'rgba(59,130,246,0.15)',
                      border: '1px solid rgba(59,130,246,0.4)',
                      color: '#93c5fd',
                      padding: '10px 18px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    👁️ Preview Final Document & Test PDF
                  </button>

                  <button
                    type="submit"
                    disabled={publishing}
                    className="btn-primary"
                    style={{
                      padding: '10px 24px',
                      fontSize: 13,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
                      border: 'none',
                      boxShadow: '0 4px 14px rgba(4,120,87,0.3)',
                      cursor: publishing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {publishing ? 'Publishing...' : '🚀 Publish & Issue Communication'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: ROSTER & AUDIT */}
          {activeTab === 'roster' && (
            <div>
              {selectedDocForRoster ? (
                <div>
                  {/* Header of selected document */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <button
                      onClick={() => setSelectedDocForRoster(null)}
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      ◀ Back to All Documents
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setViewingDoc(selectedDocForRoster)}
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)' }}
                      >
                        👁️ View Document
                      </button>
                      <button
                        onClick={() => handleDownloadDocPdf(selectedDocForRoster)}
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' }}
                      >
                        📥 Download Base PDF
                      </button>
                      {selectedDocForRoster.status !== 'VOIDED' && (
                        <button
                          onClick={() => setDocToVoid(selectedDocForRoster)}
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: '6px 14px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                        >
                          🚫 Void Document
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedDocForRoster.status === 'VOIDED' && (
                    <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🚫</span> OFFICIALLY VOIDED & REVOKED BY MANAGEMENT
                      </div>
                      <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>
                        Revoked on {selectedDocForRoster.voided_at ? new Date(selectedDocForRoster.voided_at).toLocaleDateString() : 'Recorded'} by {selectedDocForRoster.voided_by_name || 'Management'}.
                        <br />
                        <strong>Void Reason:</strong> "{selectedDocForRoster.void_reason || 'Withdrawn by management'}"
                      </div>
                    </div>
                  )}

                  <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#b82105', textTransform: 'uppercase' }}>
                          {selectedDocForRoster.category}
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '4px 0', color: '#fff' }}>
                          {selectedDocForRoster.title}
                        </h3>
                      </div>
                      {selectedDocForRoster.status === 'VOIDED' && (
                        <span style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 12 }}>
                          🚫 VOIDED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 16, marginTop: 6 }}>
                      <span><strong>Issued By:</strong> {selectedDocForRoster.created_by_name}</span>
                      <span><strong>Date:</strong> {selectedDocForRoster.created_at?.slice(0, 10)}</span>
                      <span><strong>Signed:</strong> {selectedDocForRoster.total_signed || 0} of {selectedDocForRoster.total_assigned || 0}</span>
                    </div>
                  </div>

                  {/* Recipient Roster Table */}
                  <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '12px 16px' }}>Representative</th>
                          <th style={{ padding: '12px 16px' }}>Division</th>
                          <th style={{ padding: '12px 16px' }}>Status</th>
                          <th style={{ padding: '12px 16px' }}>Electronic Signature</th>
                          <th style={{ padding: '12px 16px' }}>Date & Timestamp</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingRoster ? (
                          <tr>
                            <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                              Loading signatures roster...
                            </td>
                          </tr>
                        ) : rosterList.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                              No recipients found for this document.
                            </td>
                          </tr>
                        ) : (
                          rosterList.map((ack) => {
                            const isSigned = ack.status === 'SIGNED'
                            return (
                              <tr key={ack.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>
                                  {ack.user_display_name}
                                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{ack.username}</div>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                                    {ack.user_lob || 'Intake'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  {isSigned ? (
                                    <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                                      ✓ Signed
                                    </span>
                                  ) : (
                                    <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                                      ⏳ Pending Signature
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '12px 16px', color: isSigned ? '#34d399' : '#64748b', fontWeight: isSigned ? 700 : 400 }}>
                                  {isSigned ? `[ /s/ ${ack.signature_text} ]` : '—'}
                                </td>
                                <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 11 }}>
                                  {isSigned ? ack.signed_at?.replace('T', ' ').slice(0, 19) + ' UTC' : 'Awaiting action'}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                  {isSigned ? (
                                    <button
                                      onClick={() => handleDownloadDocPdf(selectedDocForRoster, ack)}
                                      className="btn-secondary"
                                      style={{ fontSize: 11, padding: '4px 10px', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' }}
                                    >
                                      📥 Download Signed PDF
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: 11, color: '#f59e0b', fontStyle: 'italic' }}>Pending Signature</span>
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
              ) : (
                /* Documents List View */
                <div>
                  {/* Filter Pills */}
                  {(() => {
                    const activeDocs = documents.filter(d => d.status !== 'VOIDED' && (d.total_signed || 0) < (d.total_assigned || 1))
                    const completedDocs = documents.filter(d => d.status !== 'VOIDED' && (d.total_signed || 0) >= (d.total_assigned || 1))
                    const voidedDocs = documents.filter(d => d.status === 'VOIDED')

                    const filteredDocs = documents.filter(d => {
                      if (statusFilter === 'ACTIVE') return d.status !== 'VOIDED' && (d.total_signed || 0) < (d.total_assigned || 1)
                      if (statusFilter === 'COMPLETED') return d.status !== 'VOIDED' && (d.total_signed || 0) >= (d.total_assigned || 1)
                      if (statusFilter === 'VOIDED') return d.status === 'VOIDED'
                      return true
                    })

                    return (
                      <div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                          {[
                            { id: 'ALL', label: `All (${documents.length})` },
                            { id: 'ACTIVE', label: `Active (${activeDocs.length})` },
                            { id: 'COMPLETED', label: `Completed (${completedDocs.length})` },
                            { id: 'VOIDED', label: `🚫 Voided (${voidedDocs.length})` },
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setStatusFilter(tab.id as any)}
                              style={{
                                fontSize: 12,
                                padding: '5px 12px',
                                borderRadius: 20,
                                border: '1px solid',
                                borderColor: statusFilter === tab.id ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                                background: statusFilter === tab.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                                color: statusFilter === tab.id ? '#93c5fd' : '#94a3b8',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '12px 16px' }}>Document Title</th>
                                <th style={{ padding: '12px 16px' }}>Category</th>
                                <th style={{ padding: '12px 16px' }}>Date Issued</th>
                                <th style={{ padding: '12px 16px' }}>Target Scope</th>
                                <th style={{ padding: '12px 16px' }}>Signatures Progress</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loadingDocs ? (
                                <tr>
                                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    Loading communications...
                                  </td>
                                </tr>
                              ) : filteredDocs.length === 0 ? (
                                <tr>
                                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    No documents found matching this filter.
                                  </td>
                                </tr>
                              ) : (
                                filteredDocs.map((d) => {
                                  const total = d.total_assigned || 0
                                  const signed = d.total_signed || 0
                                  const pct = total > 0 ? Math.round((signed / total) * 100) : 100
                                  const isVoid = d.status === 'VOIDED'

                                  return (
                                    <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isVoid ? 'rgba(239,68,68,0.03)' : undefined }}>
                                      <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <div style={{ fontWeight: 800, color: '#fff', fontSize: 13.5 }}>{d.title}</div>
                                          {isVoid && (
                                            <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>
                                              🚫 VOIDED
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Issued by {d.created_by_name}</div>
                                      </td>
                                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                                        <span style={{ fontSize: 11, background: 'rgba(184,33,5,0.15)', color: '#fca5a5', padding: '2px 8px', borderRadius: 8 }}>
                                          {d.category}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>
                                        {d.created_at?.slice(0, 10)}
                                      </td>
                                      <td style={{ padding: '12px 16px', color: '#cbd5e1', fontSize: 12 }}>
                                        {d.target_type === 'ALL' ? '👥 All Intake' : d.target_lob ? `🏛️ ${d.target_lob}` : '👤 Specific Reps'}
                                      </td>
                                      <td style={{ padding: '12px 16px' }}>
                                        {isVoid ? (
                                          <div>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>
                                              🚫 Nullified / Revoked
                                            </span>
                                            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                                              {signed} of {total} signed prior to void
                                            </div>
                                            {d.void_reason && (
                                              <div style={{ fontSize: 10.5, color: '#fca5a5', fontStyle: 'italic', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.void_reason}>
                                                "{d.void_reason}"
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                              <div
                                                style={{
                                                  width: `${pct}%`,
                                                  height: '100%',
                                                  background: pct === 100 ? '#10b981' : '#3b82f6',
                                                }}
                                              />
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#34d399' : '#fff' }}>
                                              {signed}/{total} ({pct}%)
                                            </span>
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                          <button
                                            onClick={() => setViewingDoc(d)}
                                            className="btn-secondary"
                                            style={{ fontSize: 11, padding: '4px 8px', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)' }}
                                            title="View full letterhead document"
                                          >
                                            👁️ View
                                          </button>
                                          <button
                                            onClick={() => handleOpenRoster(d)}
                                            className="btn-primary"
                                            style={{ fontSize: 11, padding: '4px 10px' }}
                                          >
                                            👁️ Roster
                                          </button>
                                          <button
                                            onClick={() => handleDownloadDocPdf(d)}
                                            className="btn-secondary"
                                            style={{ fontSize: 11, padding: '4px 8px' }}
                                            title="Download Document PDF"
                                          >
                                            📥 PDF
                                          </button>
                                          {!isVoid && (
                                            <button
                                              onClick={() => setDocToVoid(d)}
                                              className="btn-secondary"
                                              style={{ fontSize: 11, padding: '4px 8px', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                                              title="Void this document and cancel pending signatures"
                                            >
                                              🚫 Void
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleArchive(d.id, d.title)}
                                            className="btn-secondary"
                                            style={{ fontSize: 11, padding: '4px 8px', color: '#94a3b8' }}
                                            title="Archive document"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="glass-card" style={{ padding: '24px', maxWidth: 600 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px 0', color: '#fff' }}>
                ⚙️ Google Gemini AI API Configuration
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                The Document Studio utilizes the Google Gemini API to draft operational communications, policies, and standard operating procedures. Enter your Gemini API key below to enable intelligent drafting.
              </p>

              {hasApiKey ? (
                <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🟢 <strong>API Key Active</strong> {keyPreview ? `(${keyPreview})` : ''}</span>
                  <span style={{ fontSize: 10, opacity: 0.85, textTransform: 'uppercase', background: 'rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: 4 }}>
                    Source: {keySource || 'Configured'}
                  </span>
                </div>
              ) : (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
                  ⚠️ No Gemini API key detected. Paste your Google AI Studio API key below.
                </div>
              )}

              {apiKeySavedMsg && (
                <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
                  {apiKeySavedMsg}
                </div>
              )}

              <form onSubmit={handleSaveApiKey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                    GEMINI API KEY (Google AI Pro)
                  </label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, fontSize: 13, width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    type="submit"
                    disabled={savingKey}
                    className="btn-primary"
                    style={{ fontSize: 12, fontWeight: 700 }}
                  >
                    {savingKey ? 'Saving...' : '💾 Save API Key'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* VOID DOCUMENT CONFIRMATION MODAL */}
      {docToVoid && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            e.stopPropagation()
            setDocToVoid(null)
            setVoidReason('')
          }}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: 520,
              width: '100%',
              padding: 24,
              border: '1px solid rgba(239,68,68,0.4)',
              background: '#0f172a',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                🚫
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f87171' }}>
                  Void Official Communication
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                  Revoke and nullify this document across all specialists
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{docToVoid.title}</div>
              <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 4 }}>
                Target: {docToVoid.target_type === 'ALL' ? 'All Intake Reps' : docToVoid.target_lob ? `Division ${docToVoid.target_lob}` : 'Specific Reps'} · {docToVoid.total_signed || 0} already signed / {docToVoid.total_assigned || 0} assigned
              </div>
              <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> Voiding immediately cancels pending signature requests, notifies specialists, and stamps exported PDFs with a diagonal VOID watermark.
              </div>
            </div>

            <form onSubmit={handleConfirmVoid}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                MANDATORY VOID REASON:
              </label>
              <textarea
                required
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="State the reason why this communication is being officially revoked..."
                className="input-field"
                style={{ width: '100%', fontSize: 12.5, marginBottom: 8 }}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                {VOID_REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setVoidReason(preset)}
                    style={{
                      fontSize: 10.5,
                      background: voidReason === preset ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)',
                      border: '1px solid',
                      borderColor: voidReason === preset ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
                      color: voidReason === preset ? '#fca5a5' : '#cbd5e1',
                      padding: '4px 9px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: voidReason === preset ? 700 : 500,
                    }}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => { setDocToVoid(null); setVoidReason('') }}
                  disabled={voiding}
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '7px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voiding || !voidReason.trim()}
                  style={{
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 18px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: voiding || !voidReason.trim() ? 'not-allowed' : 'pointer',
                    opacity: voiding || !voidReason.trim() ? 0.6 : 1,
                  }}
                >
                  {voiding ? 'Voiding Document...' : '🚫 Confirm & Void Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRE-ISSUANCE DRAFT PREVIEW & TEST PDF MODAL */}
      {showPreIssuancePreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={(e) => {
            e.stopPropagation()
            setShowPreIssuancePreview(false)
          }}
        >
          <div
            className="fade-in"
            style={{
              maxWidth: 920,
              width: '100%',
              maxHeight: '94vh',
              background: '#040d1a',
              borderRadius: 12,
              border: '1px solid rgba(59,130,246,0.35)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>👁️</span> Pre-Issuance Document Preview & PDF Proofing
                </h3>
                <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>
                  Verify formatting, letterhead, and contractor acknowledgment before officially issuing to specialists.
                </p>
              </div>

              <button
                onClick={() => setShowPreIssuancePreview(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Sticky Action Toolbar */}
            <div
              style={{
                padding: '12px 24px',
                background: 'rgba(15,23,42,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  Target Scope:
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)' }}>
                  {targetType === 'ALL' ? '👥 Company-Wide (All Intake)' : targetType === 'LOB' ? `🏛️ Division ${targetLob}` : `👤 ${targetUsers.length} Specific Representative(s)`}
                </span>
                {deadlineDate && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                    📅 Due: {deadlineDate}
                  </span>
                )}
                {isUrgent && (
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 12, background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}>
                    🚨 URGENT PRIORITY
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleDownloadTestPdf}
                  className="btn-secondary"
                  style={{
                    fontSize: 12,
                    padding: '6px 14px',
                    color: '#60a5fa',
                    borderColor: 'rgba(59,130,246,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Generate and download a preview PDF to inspect layout before publishing"
                >
                  📥 Download Test PDF
                </button>
                <button
                  type="button"
                  onClick={() => handlePublish()}
                  disabled={publishing}
                  className="btn-primary"
                  style={{
                    fontSize: 12,
                    padding: '7px 18px',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(4,120,87,0.3)',
                    cursor: publishing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {publishing ? 'Publishing...' : '🚀 Looks Great, Publish & Issue Now'}
                </button>
              </div>
            </div>

            {/* Scrollable Letterhead Paper Preview */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#020617' }}>
              <div
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  borderRadius: 8,
                  padding: '36px 42px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  lineHeight: 1.6,
                  maxWidth: 820,
                  margin: '0 auto',
                }}
              >
                {/* Paper Letterhead */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '2px solid #0f294a', paddingBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <img src="/logos/logo-andes.webp" alt="Andes Workforce" style={{ height: 32, objectFit: 'contain' }} />
                    <span style={{ color: '#cbd5e1', fontSize: 18 }}>|</span>
                    <img src="/logos/logo-tabak.png" alt="Tabak Law, LLC" style={{ height: 32, objectFit: 'contain' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                    <div style={{ fontWeight: 800, color: '#0f294a', fontSize: 12 }}>ANDES WORKFORCE, LLC</div>
                    <div>Legal Intake Operations on behalf of <strong>Tabak Law, LLC</strong></div>
                  </div>
                </div>

                {/* Draft Watermark Strip */}
                <div
                  style={{
                    background: 'rgba(59,130,246,0.06)',
                    border: '1px dashed #3b82f6',
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#2563eb',
                    marginBottom: 18,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>📝 DRAFT PRE-ISSUANCE PROOF — SAMPLE PREVIEW</span>
                  <span>CONFIDENTIAL & PROPRIETARY</span>
                </div>

                {/* Document Metadata Banner */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#b82105', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {category}
                  </div>
                  <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.3 }}>
                    {title.trim() || 'Untitled Operational Policy / Directive'}
                  </h1>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                    <span><strong>Issuing Entity:</strong> Andes Workforce, LLC</span>
                    <span><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</span>
                    {deadlineDate && <span><strong>Signature Due:</strong> {deadlineDate}</span>}
                    {isUrgent && <span style={{ color: '#dc2626', fontWeight: 800 }}>🚨 High Priority Response Required</span>}
                  </div>
                </div>

                {/* Rendered Document Body via FormattedMarkdown */}
                <FormattedMarkdown content={content} style={{ marginBottom: 36 }} />

                {/* Independent Contractor Legal Clause & Certificate Preview */}
                <div
                  style={{
                    background: 'rgba(245,158,11,0.05)',
                    border: '1.5px solid #f59e0b',
                    borderRadius: 8,
                    padding: '20px 24px',
                    marginTop: 24,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#b45309', letterSpacing: '0.04em' }}>
                        ⚠️ CONTRACTOR LEGAL ACKNOWLEDGMENT & SIGNATURE REQUIREMENT (SAMPLE PREVIEW)
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Recorded by Andes Workforce, LLC for Tabak Law, LLC Operations
                      </div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>
                      PREVIEW ONLY
                    </span>
                  </div>

                  <div style={{ fontSize: 11.5, color: '#334155', fontStyle: 'italic', background: 'rgba(0,0,0,0.03)', padding: '12px 16px', borderRadius: 6, marginBottom: 14, borderLeft: '3px solid #0f294a' }}>
                    "I, <strong>[Independent Contractor Full Name]</strong>, an independent contractor of <strong>Andes Workforce, LLC</strong> assigned to provide intake and operational support for the <strong>Tabak Law, LLC</strong> account, hereby acknowledge that I have received, read, and understand this communication. I agree to comply with the operational guidelines, quality standards, and policies set forth herein. I understand that entering my full legal name below constitutes my legally binding electronic signature."
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 11.5, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>INDEPENDENT CONTRACTOR</span>
                      <strong style={{ color: '#0f172a' }}>[Specialist Name Displayed Here]</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>SIGNATURE STATUS</span>
                      <strong style={{ color: '#f59e0b' }}>[Awaiting Representative E-Signature]</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>TIMESTAMP & AUDIT</span>
                      <strong style={{ color: '#0f172a' }}>[Auto-Recorded on Signature]</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW ISSUED DOCUMENT FULL LETTERHEAD MODAL */}
      {viewingDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={(e) => {
            e.stopPropagation()
            setViewingDoc(null)
          }}
        >
          <div
            className="fade-in"
            style={{
              maxWidth: 920,
              width: '100%',
              maxHeight: '94vh',
              background: '#040d1a',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📄</span> Official Communication Document
                </h3>
                <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>
                  Issued on {viewingDoc.created_at?.slice(0, 10)} by {viewingDoc.created_by_name}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleDownloadDocPdf(viewingDoc)}
                  className="btn-secondary"
                  style={{
                    fontSize: 12,
                    padding: '6px 14px',
                    color: '#60a5fa',
                    borderColor: 'rgba(59,130,246,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  📥 Download Base PDF
                </button>
                <button
                  onClick={() => setViewingDoc(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: 20,
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable Letterhead Paper */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#020617' }}>
              <div
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  borderRadius: 8,
                  padding: '36px 42px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  lineHeight: 1.6,
                  maxWidth: 820,
                  margin: '0 auto',
                }}
              >
                {/* Paper Letterhead */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '2px solid #0f294a', paddingBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <img src="/logos/logo-andes.webp" alt="Andes Workforce" style={{ height: 32, objectFit: 'contain' }} />
                    <span style={{ color: '#cbd5e1', fontSize: 18 }}>|</span>
                    <img src="/logos/logo-tabak.png" alt="Tabak Law, LLC" style={{ height: 32, objectFit: 'contain' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                    <div style={{ fontWeight: 800, color: '#0f294a', fontSize: 12 }}>ANDES WORKFORCE, LLC</div>
                    <div>Legal Intake Operations on behalf of <strong>Tabak Law, LLC</strong></div>
                  </div>
                </div>

                {/* Revocation Warning Box if Voided */}
                {viewingDoc.status === 'VOIDED' && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #ef4444', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🚫</span> OFFICIALLY VOIDED & REVOKED BY MANAGEMENT
                    </div>
                    <div style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>
                      Revoked on {viewingDoc.voided_at ? new Date(viewingDoc.voided_at).toLocaleDateString() : 'Recorded'} by {viewingDoc.voided_by_name || 'Management'}.
                      <br />
                      <strong>Void Reason:</strong> "{viewingDoc.void_reason || 'Withdrawn by management'}"
                    </div>
                  </div>
                )}

                {/* Document Metadata Banner */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#b82105', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {viewingDoc.category}
                  </div>
                  <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.3 }}>
                    {viewingDoc.title}
                  </h1>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                    <span><strong>Issued By:</strong> {viewingDoc.created_by_name}</span>
                    <span><strong>Date:</strong> {viewingDoc.created_at?.slice(0, 10)}</span>
                    {viewingDoc.deadline_date && <span><strong>Signature Due:</strong> {viewingDoc.deadline_date}</span>}
                    <span><strong>Progress:</strong> {viewingDoc.total_signed || 0} of {viewingDoc.total_assigned || 0} signed</span>
                  </div>
                </div>

                {/* Rendered Document Body via FormattedMarkdown */}
                <FormattedMarkdown content={viewingDoc.content} style={{ marginBottom: 36 }} />

                {/* Independent Contractor Legal Clause */}
                <div
                  style={{
                    background: 'rgba(15,41,74,0.03)',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '18px 22px',
                    marginTop: 24,
                  }}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0f294a', marginBottom: 6 }}>
                    CONTRACTOR LEGAL ACKNOWLEDGMENT PROVISION
                  </div>
                  <div style={{ fontSize: 11.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.55 }}>
                    "All independent contractors of <strong>Andes Workforce, LLC</strong> assigned to the <strong>Tabak Law, LLC</strong> account are required to electronically sign and acknowledge receipt and compliance with this directive upon assignment."
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
