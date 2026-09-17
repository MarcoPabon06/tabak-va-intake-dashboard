'use client'

import { useState, useEffect, useCallback } from 'react'
import { safeFetchJson } from '@/lib/apiClient'
import { downloadSignedDocumentPdf, DocumentData, AcknowledgementData } from '@/lib/pdfGenerator'

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

  // Roster & documents state
  const [documents, setDocuments] = useState<any[]>([])
  const [activeSpecialists, setActiveSpecialists] = useState<ActiveSpecialist[]>([])
  const [selectedDocForRoster, setSelectedDocForRoster] = useState<any | null>(null)
  const [rosterList, setRosterList] = useState<any[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [loadingRoster, setLoadingRoster] = useState(false)

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
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
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
      fetchDocumentsData()
      setActiveTab('roster')
      setTimeout(() => setPublishSuccessMsg(''), 5000)
    } catch (err: any) {
      setFormError(err.message || 'Failed to publish communication')
    } finally {
      setPublishing(false)
    }
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

              {/* Row 4: Document Content Markdown Editor */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                    DOCUMENT BODY CONTENT (MARKDOWN) *
                  </label>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Supports headers (###), bold, lists (- ), and paragraphs.
                  </span>
                </div>
                <textarea
                  required
                  rows={14}
                  placeholder="Enter the full text of the policy or directive here..."
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
                  }}
                />
              </div>

              {/* Submit Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  style={{ fontSize: 13 }}
                >
                  Cancel
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
                        onClick={() => handleDownloadDocPdf(selectedDocForRoster)}
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.3)' }}
                      >
                        📥 Download Base PDF
                      </button>
                    </div>
                  </div>

                  <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b82105', textTransform: 'uppercase' }}>
                      {selectedDocForRoster.category}
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: '4px 0', color: '#fff' }}>
                      {selectedDocForRoster.title}
                    </h3>
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
                      ) : documents.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                            No documents issued yet. Click "Draft & Issue Communication" to create your first policy!
                          </td>
                        </tr>
                      ) : (
                        documents.map((d) => {
                          const total = d.total_assigned || 0
                          const signed = d.total_signed || 0
                          const pct = total > 0 ? Math.round((signed / total) * 100) : 100
                          return (
                            <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: 800, color: '#fff', fontSize: 13.5 }}>{d.title}</div>
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
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                  <button
                                    onClick={() => handleOpenRoster(d)}
                                    className="btn-primary"
                                    style={{ fontSize: 11, padding: '4px 10px' }}
                                  >
                                    👁️ View Roster
                                  </button>
                                  <button
                                    onClick={() => handleDownloadDocPdf(d)}
                                    className="btn-secondary"
                                    style={{ fontSize: 11, padding: '4px 8px' }}
                                    title="Download Document PDF"
                                  >
                                    📥 PDF
                                  </button>
                                  <button
                                    onClick={() => handleArchive(d.id, d.title)}
                                    className="btn-secondary"
                                    style={{ fontSize: 11, padding: '4px 8px', color: '#ef4444' }}
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
    </div>
  )
}
