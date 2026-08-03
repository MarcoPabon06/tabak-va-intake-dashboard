'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'

interface Evaluation {
  id: number
  agent_name: string
  evaluator_name: string | null
  call_id: string | null
  eval_date: string
  overall_score: number
  score_introduction: number
  score_pk_policies: number
  score_eligibility: number
  score_deadline: number
  score_documentation: number
  score_objection: number
  zt_attorney_escalation: number
  zt_legal_misrepresentation: number
  zt_undocumented: number
  feedback: string | null
  tier: string
  status: string
  acknowledged_at: string | null
  dispute_reason: string | null
  disputed_at: string | null
  resolution_notes: string | null
  resolved_at: string | null
}

function tierColor(tier: string) {
  if (tier === 'Top Performer') return '#10b981'
  if (tier === 'Strong Performer') return '#b82105'
  if (tier === 'Developing Performer') return '#f59e0b'
  if (tier === 'Performance Risk') return '#ef4444'
  return '#dc2626'
}

function getTier(score: number): string {
  if (score >= 90) return 'Top Performer'
  if (score >= 81) return 'Strong Performer'
  if (score >= 70) return 'Developing Performer'
  if (score >= 60) return 'Performance Risk'
  return 'Immediate Coaching Required'
}

const CATEGORIES = [
  { key: 'score_introduction', label: 'Professional Introduction', max: 20, color: '#b82105' },
  { key: 'score_pk_policies', label: 'PK & Application Policies', max: 25, color: '#5f758e' },
  { key: 'score_eligibility', label: 'Eligibility Assessment', max: 20, color: '#a78bfa' },
  { key: 'score_deadline', label: 'Process & Deadline', max: 10, color: '#10b981' },
  { key: 'score_documentation', label: 'Documentation in CRM', max: 15, color: '#f59e0b' },
  { key: 'score_objection', label: 'Objection Handling', max: 10, color: '#ef4444' },
]

function statusColor(status: string) {
  if (status === 'Acknowledged') return '#10b981'
  if (status === 'Disputed') return '#ef4444'
  if (status?.startsWith('Resolved')) return '#3b82f6'
  return '#f59e0b'
}

function ResolutionForm({ evaluation, onResolved }: { evaluation: Evaluation; onResolved: () => void }) {
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [isRevising, setIsRevising] = useState(false)
  const [revisedScores, setRevisedScores] = useState({
    score_introduction: evaluation.score_introduction,
    score_pk_policies: evaluation.score_pk_policies,
    score_eligibility: evaluation.score_eligibility,
    score_deadline: evaluation.score_deadline,
    score_documentation: evaluation.score_documentation,
    score_objection: evaluation.score_objection,
  })

  const handleResolve = async (status: 'Resolved - Revised' | 'Resolved - No Change') => {
    try {
      const payload: any = {
        action: 'resolve',
        id: evaluation.id,
        resolutionStatus: status,
        resolutionNotes,
      }
      if (status === 'Resolved - Revised') {
        Object.assign(payload, revisedScores)
      }

      const res = await fetch('/api/qa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        onResolved()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const currentSum = Object.values(revisedScores).reduce((s, v) => s + v, 0)
  const isZt = evaluation.zt_attorney_escalation === 1 ||
               evaluation.zt_legal_misrepresentation === 1 ||
               evaluation.zt_undocumented === 1
  const revisedOverall = isZt ? 0 : currentSum

  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Resolution Comments</label>
      <textarea
        value={resolutionNotes}
        onChange={(e) => setResolutionNotes(e.target.value)}
        placeholder="Enter comments about this dispute resolution..."
        style={{
          width: '100%',
          minHeight: 60,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 6,
          padding: 8,
          fontSize: 12,
          color: '#fff',
          outline: 'none',
          resize: 'vertical',
          marginBottom: 10,
        }}
      />

      {isRevising ? (
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 12 }}>
          <h5 style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', marginBottom: 10 }}>Adjust Category Scores</h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CATEGORIES.map((c) => (
              <div key={c.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.color }}>{(revisedScores as any)[c.key]} / {c.max}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={c.max}
                  value={(revisedScores as any)[c.key]}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setRevisedScores((prev) => ({ ...prev, [c.key]: val }))
                  }}
                  style={{ width: '100%', accentColor: c.color }}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Revised Overall Score:</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: tierColor(getTier(revisedOverall)) }}>
              {revisedOverall}% ({getTier(revisedOverall)})
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={() => setIsRevising(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Cancel Revision
            </button>
            <button
              onClick={() => handleResolve('Resolved - Revised')}
              disabled={!resolutionNotes.trim()}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: resolutionNotes.trim() ? 1 : 0.5,
              }}
            >
              Submit Revised Scores
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setIsRevising(true)}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #b82105, #4f46e5)',
              color: '#fff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Revise Scores
          </button>
          <button
            onClick={() => handleResolve('Resolved - No Change')}
            disabled={!resolutionNotes.trim()}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: resolutionNotes.trim() ? 1 : 0.5,
            }}
          >
            Maintain Scores
          </button>
        </div>
      )}
    </div>
  )
}

function EvaluationDetails({
  ev,
  isMaster,
  disputingEvalId,
  setDisputingEvalId,
  disputeReasonText,
  setDisputeReasonText,
  handleAcknowledge,
  handleDispute,
  requests,
  onRequestFeedback,
}: {
  ev: Evaluation
  isMaster: boolean
  disputingEvalId: number | null
  setDisputingEvalId: (id: number | null) => void
  disputeReasonText: string
  setDisputeReasonText: (text: string) => void
  handleAcknowledge: (id: number) => Promise<void>
  handleDispute: (id: number) => Promise<void>
  requests: any[]
  onRequestFeedback: (evalId: number) => void
}) {
  const requestForEval = requests.find((r) => r.linked_evaluation_id === ev.id)

  return (
    <div style={{ marginTop: 12 }}>
      {/* Category scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
        {CATEGORIES.map((c) => (
          <div key={c.key} style={{ fontSize: 11 }}>
            <span style={{ color: '#64748b' }}>{c.label}: </span>
            <span style={{ fontWeight: 700, color: c.color }}>{(ev as any)[c.key]}/{c.max}</span>
          </div>
        ))}
      </div>
      {/* Zero Tolerance */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        {[
          { label: 'Attorney Escalation', flag: ev.zt_attorney_escalation },
          { label: 'Legal Misrepresentation', flag: ev.zt_legal_misrepresentation },
          { label: 'Undocumented', flag: ev.zt_undocumented },
        ].map((zt) => (
          <span key={zt.label} style={{ fontSize: 11, color: zt.flag ? '#ef4444' : '#10b981' }}>
            {zt.flag ? '🚫' : '✅'} {zt.label}
          </span>
        ))}
      </div>
      {/* Feedback */}
      {ev.feedback && (
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
          {ev.feedback}
        </div>
      )}

      {/* Status & Actions Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Acknowledgement Status:</span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: statusColor(ev.status),
            background: `${statusColor(ev.status)}20`,
            padding: '2px 8px',
            borderRadius: 4,
          }}>
            {ev.status || 'Pending Acknowledgement'}
          </span>
        </div>

        {requestForEval && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Feedback Request:</span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: requestForEval.status === 'Completed' ? '#10b981' : requestForEval.status === 'Scheduled' ? '#b82105' : requestForEval.status === 'Declined' ? '#ef4444' : '#f59e0b',
              background: `${requestForEval.status === 'Completed' ? '#10b981' : requestForEval.status === 'Scheduled' ? '#b82105' : requestForEval.status === 'Declined' ? '#ef4444' : '#f59e0b'}20`,
              padding: '2px 8px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {requestForEval.status === 'Pending' ? '⏳ Pending Review' : requestForEval.status === 'Scheduled' ? '📅 Session Scheduled' : requestForEval.status === 'Declined' ? '❌ Request Declined' : '✅ Session Completed'}
            </span>
          </div>
        )}
      </div>

      {requestForEval && requestForEval.coach_notes && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          background: requestForEval.status === 'Declined' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(184, 33, 5, 0.05)',
          border: '1px solid ' + (requestForEval.status === 'Declined' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(184, 33, 5, 0.15)'),
          borderRadius: 8,
          fontSize: 11,
          color: requestForEval.status === 'Declined' ? '#fca5a5' : '#a5b4fc',
        }}>
          <strong>Coach Response:</strong> "{requestForEval.coach_notes}"
        </div>
      )}

      {/* Action Buttons (Available to Agents, Team Leads, Admins, and Super Admins) */}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {(!ev.status || ev.status === 'Pending Acknowledgement') && (
          <>
            <button
              onClick={async (e) => {
                e.stopPropagation()
                await handleAcknowledge(ev.id)
              }}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✓ Acknowledge Feedback
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDisputingEvalId(disputingEvalId === ev.id ? null : ev.id)
                setDisputeReasonText('')
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '5px 13px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Dispute Score
            </button>
          </>
        )}

        {!requestForEval && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRequestFeedback(ev.id)
            }}
            style={{
              background: 'linear-gradient(135deg, #b82105, #4f46e5)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🙋‍♂️ Request Feedback Session
          </button>
        )}
      </div>

      {/* Dispute text area */}
      {disputingEvalId === ev.id && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, padding: 12, background: 'rgba(0,0,0,0.15)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Dispute Reason</label>
          <textarea
            value={disputeReasonText}
            onChange={(e) => setDisputeReasonText(e.target.value)}
            placeholder="Please explain in detail why you disagree with this evaluation..."
            style={{
              width: '100%',
              minHeight: 80,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 6,
              padding: 8,
              fontSize: 12,
              color: '#fff',
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setDisputingEvalId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleDispute(ev.id)}
              disabled={!disputeReasonText.trim()}
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#fff',
                border: 'none',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: disputeReasonText.trim() ? 1 : 0.5,
              }}
            >
              Submit Dispute
            </button>
          </div>
        </div>
      )}

      {/* Disputed Status Banner */}
      {ev.status === 'Disputed' && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 8,
          fontSize: 12,
          color: '#fca5a5',
        }}>
          <strong>Under Review:</strong> {isMaster ? 'Agent' : 'You'} disputed this evaluation on {ev.disputed_at ? new Date(ev.disputed_at).toLocaleDateString() : ''}.
          <div style={{ marginTop: 4, fontStyle: 'italic', color: '#cbd5e1' }}>
            Reason: "{ev.dispute_reason}"
          </div>
        </div>
      )}

      {/* Resolved Status Banner */}
      {ev.status && ev.status.startsWith('Resolved') && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 8,
          fontSize: 12,
          color: '#93c5fd',
        }}>
          <strong>Resolution Status:</strong> {ev.status} {ev.resolved_at ? `on ${new Date(ev.resolved_at).toLocaleDateString()}` : ''}
          {ev.resolution_notes && (
            <div style={{ marginTop: 4, color: '#cbd5e1' }}>
              <strong>Manager Comments:</strong> "{ev.resolution_notes}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface RequestFeedbackModalProps {
  evalId: number
  onClose: () => void
  submitting: boolean
  error: string
  onSubmit: (notes: string, date: string) => Promise<void>
}

function RequestFeedbackModal({
  evalId,
  onClose,
  submitting,
  error,
  onSubmit,
}: RequestFeedbackModalProps) {
  const [notes, setNotes] = useState('')
  const [preferredDate, setPreferredDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(notes, preferredDate)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 11, 24, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card"
        style={{
          padding: '24px 28px',
          maxWidth: 480,
          width: '90%',
          borderColor: 'rgba(184, 33, 5, 0.25)',
          background: 'rgba(10, 22, 40, 0.95)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>🙋‍♂️ Request Feedback Session</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            color: '#ef4444',
            fontSize: 12,
            fontWeight: 600
          }}>
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Preferred Date (Optional)
            </label>
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Notes & Specific Questions *
            </label>
            <textarea
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tell the coach what questions you have or which part of the call you would like to review..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !notes.trim()}
              style={{
                background: 'linear-gradient(135deg, #b82105, #4f46e5)',
                color: '#fff',
                border: 'none',
                padding: '8px 20px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: submitting || !notes.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function QAPage() {
  const { data: session, status } = useSession()
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [expandedEval, setExpandedEval] = useState<number | null>(null)

  const [activeTab, setActiveTab] = useState<'breakdown' | 'disputes'>('breakdown')
  const [disputingEvalId, setDisputingEvalId] = useState<number | null>(null)
  const [disputeReasonText, setDisputeReasonText] = useState('')

  const [requests, setRequests] = useState<any[]>([])
  const [requestModalEvalId, setRequestModalEvalId] = useState<number | null>(null)
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [selectedLob, setSelectedLob] = useState<string>('')

  const userRole = (session?.user as any)?.role || 'regular'
  const userPerms = (session?.user as any)?.permissions
  const userName = session?.user?.name || ''
  const isMaster = userRole === 'master' || userRole === 'superadmin' || (userRole === 'admin' && Boolean(userPerms?.canViewQA || userPerms?.canPerformQA))

  useEffect(() => {
    if (session?.user) {
      const u = session.user as any
      setSelectedLob(u.lob || 'VA')
    }
  }, [session])

  const fetchRequests = () => {
    fetch('/api/coaching/requests')
      .then((r) => r.json())
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
  }

  const fetchEvals = () => {
    if (status === 'loading' || (isMaster && !selectedLob)) return
    const lobParam = isMaster ? `?lob=${selectedLob}` : `?agent=${encodeURIComponent(userName)}`
    fetch(`/api/qa${lobParam}`)
      .then((r) => r.json())
      .then((data) => setEvals(Array.isArray(data) ? data : []))
      .catch(() => setEvals([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'loading') {
      fetchEvals()
      fetchRequests()
    }
  }, [isMaster, userName, selectedLob, status])

  const handleAcknowledge = async (id: number) => {
    try {
      const res = await fetch('/api/qa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', id }),
      })
      if (res.ok) {
        fetchEvals()
        fetchRequests()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDispute = async (id: number) => {
    if (!disputeReasonText.trim()) return
    try {
      const res = await fetch('/api/qa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dispute', id, dispute_reason: disputeReasonText.trim() }),
      })
      if (res.ok) {
        setDisputingEvalId(null)
        setDisputeReasonText('')
        fetchEvals()
        fetchRequests()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // ── Admin aggregations ──
  const agentMap: Record<string, Evaluation[]> = {}
  for (const e of evals) {
    if (!agentMap[e.agent_name]) agentMap[e.agent_name] = []
    agentMap[e.agent_name].push(e)
  }

  const agentSummaries = Object.entries(agentMap).map(([name, evs]) => {
    const avg = Math.round(evs.reduce((s, e) => s + e.overall_score, 0) / evs.length * 10) / 10
    const latest = evs[0]
    return { name, avg, tier: getTier(avg), count: evs.length, latestDate: latest.eval_date, evals: evs }
  }).sort((a, b) => b.avg - a.avg)

  const teamAvg = evals.length > 0
    ? Math.round(evals.reduce((s, e) => s + e.overall_score, 0) / evals.length * 10) / 10
    : 0

  const bestPerformer = agentSummaries[0]
  const needsCoaching = agentSummaries.filter((a) => a.avg < 70)

  // ── Regular user data ──
  const myEvals = evals.filter((e) => e.agent_name === userName)
  const myAvg = myEvals.length > 0
    ? Math.round(myEvals.reduce((s, e) => s + e.overall_score, 0) / myEvals.length * 10) / 10
    : 0
  const myTier = getTier(myAvg)

  // Category averages for regular user
  const catAvgs = CATEGORIES.map((c) => {
    const avg = myEvals.length > 0
      ? Math.round(myEvals.reduce((s, e) => s + ((e as any)[c.key] || 0), 0) / myEvals.length * 10) / 10
      : 0
    return { ...c, avg, pct: Math.round((avg / c.max) * 100) }
  })

  // Trend data for regular user
  const trendData = [...myEvals].reverse().map((e) => ({
    date: e.eval_date.slice(5),
    score: e.overall_score,
  }))

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ flex: 1, marginLeft: 'var(--sidebar-width)', padding: '32px 36px', maxWidth: 1200 }}>
        {/* Header & LOB selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <h1 className="fade-in" style={{
            fontSize: 22, fontWeight: 800, margin: 0,
            background: 'linear-gradient(135deg, #b82105, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            📋 QA Scores
          </h1>

          {isMaster && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="field-label" style={{ marginBottom: 0, whiteSpace: 'nowrap', fontWeight: 600 }}>Team:</label>
              <select
                id="qa-lob-select"
                value={selectedLob}
                onChange={(e) => setSelectedLob(e.target.value)}
                className="input-field"
                style={{
                  width: 200,
                  marginBottom: 0,
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-primary)',
                  fontWeight: 600
                }}
              >
                <option value="VA" style={{ background: '#1e1b4b', color: '#fff' }}>VA Team</option>
                <option value="SSD" style={{ background: '#1e1b4b', color: '#fff' }}>SSD Team</option>
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading evaluations...</div>
        ) : evals.length === 0 ? (
          <div className="glass-card fade-in" style={{ textAlign: 'center', padding: 60 }}>
            <span style={{ fontSize: 48 }}>📋</span>
            <p style={{ color: '#94a3b8', marginTop: 16 }}>No QA evaluations found yet.</p>
          </div>
        ) : isMaster ? (
          /* ═══════ ADMIN VIEW ═══════ */
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Total Evaluations', value: evals.length, icon: '📝', color: '#b82105' },
                { label: 'Team Avg Score', value: `${teamAvg}%`, icon: '📊', color: tierColor(getTier(teamAvg)) },
                { label: 'Best Performer', value: bestPerformer?.name || '-', icon: '🏆', color: '#10b981', sub: bestPerformer ? `${bestPerformer.avg}%` : '' },
                { label: 'Needs Coaching', value: needsCoaching.length, icon: '⚠️', color: needsCoaching.length > 0 ? '#ef4444' : '#10b981' },
              ].map((c) => (
                <div key={c.label} className="glass-card fade-in" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                      {c.sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.sub}</div>}
                    </div>
                    <span style={{ fontSize: 28 }}>{c.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tab Selector */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
              <button
                onClick={() => setActiveTab('breakdown')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: activeTab === 'breakdown' ? '#b82105' : '#64748b',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'breakdown' ? '2px solid #b82105' : 'none',
                  transition: 'color 0.2s',
                }}
              >
                📊 Team Overview
              </button>
              <button
                onClick={() => setActiveTab('disputes')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: activeTab === 'disputes' ? '#ef4444' : '#64748b',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'disputes' ? '2px solid #ef4444' : 'none',
                  transition: 'color 0.2s',
                }}
              >
                ⚠️ Active Disputes ({evals.filter((e) => e.status === 'Disputed').length})
              </button>
            </div>

            {activeTab === 'disputes' ? (
              <div className="glass-card fade-in" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Active Disputes Under Review
                </h3>
                {evals.filter((e) => e.status === 'Disputed').length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    ✅ No active disputes under review.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {evals.filter((e) => e.status === 'Disputed').map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.02)',
                          padding: '16px 20px',
                        }}
                      >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 10, marginBottom: 12 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, marginRight: 10 }}>{ev.agent_name}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{ev.eval_date}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Original Score:</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: tierColor(ev.tier) }}>{ev.overall_score}%</span>
                          </div>
                        </div>

                        {/* Dispute Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          {/* Left: Original Scores and Feedback */}
                          <div>
                            <h4 style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Original Evaluation</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
                              {CATEGORIES.map((c) => (
                                <div key={c.key} style={{ fontSize: 11 }}>
                                  <span style={{ color: '#64748b' }}>{c.label}: </span>
                                  <span style={{ fontWeight: 700, color: c.color }}>{(ev as any)[c.key]}/{c.max}</span>
                                </div>
                              ))}
                            </div>
                            {ev.feedback && (
                              <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 11, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                                {ev.feedback}
                              </div>
                            )}
                          </div>

                          {/* Right: Dispute reason & Resolution Panel */}
                          <div>
                            <h4 style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>Agent Dispute Reason</h4>
                            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: 6, fontSize: 11, color: '#fca5a5', minHeight: 60, fontStyle: 'italic', marginBottom: 12 }}>
                              "{ev.dispute_reason}"
                            </div>

                            {/* Resolution Form */}
                            <ResolutionForm evaluation={ev} onResolved={fetchEvals} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Agent Table */
              <div className="glass-card fade-in" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Agent QA Breakdown
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        {['Agent', 'Avg Score', 'Tier', 'Evaluations', 'Latest Date'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentSummaries.map((a) => (
                        <>
                          <tr
                            key={a.name}
                            onClick={() => setExpandedAgent(expandedAgent === a.name ? null : a.name)}
                            style={{
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              transition: 'background 0.15s',
                              background: expandedAgent === a.name ? 'rgba(184, 33, 5, 0.08)' : 'transparent',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                            onMouseOut={(e) => (e.currentTarget.style.background = expandedAgent === a.name ? 'rgba(184, 33, 5, 0.08)' : 'transparent')}
                          >
                            <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13 }}>{a.name}</td>
                            <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: 14, color: tierColor(a.tier) }}>{a.avg}%</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: tierColor(a.tier),
                                background: `${tierColor(a.tier)}20`, padding: '3px 10px', borderRadius: 6,
                              }}>
                                {a.tier}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>{a.count}</td>
                            <td style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8' }}>{a.latestDate}</td>
                          </tr>
                          {expandedAgent === a.name && (
                            <tr key={`${a.name}-detail`}>
                              <td colSpan={5} style={{ padding: '8px 14px 16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {a.evals.map((ev) => (
                                    <div
                                      key={ev.id}
                                      onClick={(e) => { e.stopPropagation(); setExpandedEval(expandedEval === ev.id ? null : ev.id) }}
                                      style={{
                                        padding: '12px 16px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: tierColor(ev.tier) }}>{ev.overall_score}%</span>
                                          <span style={{ fontSize: 12, color: '#64748b' }}>{ev.eval_date}</span>
                                          {ev.call_id && <span style={{ fontSize: 11, color: '#94a3b8' }}>Call: {ev.call_id}</span>}
                                          <span style={{
                                            fontSize: 9,
                                            fontWeight: 700,
                                            color: statusColor(ev.status),
                                            background: `${statusColor(ev.status)}20`,
                                            padding: '1px 6px',
                                            borderRadius: 4,
                                          }}>
                                            {ev.status || 'Pending Acknowledgement'}
                                          </span>
                                        </div>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>{expandedEval === ev.id ? '▲' : '▼'}</span>
                                      </div>
                                      {expandedEval === ev.id && (
                                        <EvaluationDetails
                                          ev={ev}
                                          isMaster={isMaster}
                                          disputingEvalId={disputingEvalId}
                                          setDisputingEvalId={setDisputingEvalId}
                                          disputeReasonText={disputeReasonText}
                                          setDisputeReasonText={setDisputeReasonText}
                                          handleAcknowledge={handleAcknowledge}
                                          handleDispute={handleDispute}
                                          requests={requests}
                                          onRequestFeedback={setRequestModalEvalId}
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ═══════ REGULAR USER VIEW ═══════ */
          <>
            {/* Score Card */}
            <div className="glass-card fade-in" style={{ padding: '28px 32px', marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 52, fontWeight: 800, color: tierColor(myTier) }}>{myAvg}%</div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: tierColor(myTier),
                background: `${tierColor(myTier)}20`, padding: '4px 16px',
                borderRadius: 8, display: 'inline-block', marginTop: 8,
              }}>
                {myTier}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                Based on {myEvals.length} evaluation{myEvals.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Category Breakdown */}
              <div className="glass-card fade-in" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16 }}>Category Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {catAvgs.map((c) => (
                    <div key={c.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{c.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.avg}/{c.max}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${c.pct}%`, borderRadius: 3,
                          background: `linear-gradient(90deg, ${c.color}, ${c.color}cc)`,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trend Chart */}
              <div className="glass-card fade-in" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16 }}>Score Trend</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="qaScoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#b82105" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#b82105" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(10,22,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${v}%`, 'Score']}
                    />
                    <Area type="monotone" dataKey="score" stroke="#b82105" fill="url(#qaScoreGrad)" strokeWidth={2} dot={{ r: 3, fill: '#b82105' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Evaluations */}
            <div className="glass-card fade-in" style={{ padding: '20px 24px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16 }}>Recent Evaluations</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myEvals.slice(0, 10).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => setExpandedEval(expandedEval === ev.id ? null : ev.id)}
                    style={{
                      padding: '14px 18px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'background 0.15s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: tierColor(ev.tier) }}>{ev.overall_score}%</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: tierColor(ev.tier),
                          background: `${tierColor(ev.tier)}20`, padding: '2px 8px', borderRadius: 4,
                        }}>
                          {ev.tier}
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{ev.eval_date}</span>
                        {ev.call_id && <span style={{ fontSize: 11, color: '#94a3b8' }}>Call: {ev.call_id}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{expandedEval === ev.id ? '▲' : '▼'}</span>
                    </div>
                    {expandedEval === ev.id && (
                      <EvaluationDetails
                        ev={ev}
                        isMaster={isMaster}
                        disputingEvalId={disputingEvalId}
                        setDisputingEvalId={setDisputingEvalId}
                        disputeReasonText={disputeReasonText}
                        setDisputeReasonText={setDisputeReasonText}
                        handleAcknowledge={handleAcknowledge}
                        handleDispute={handleDispute}
                        requests={requests}
                        onRequestFeedback={setRequestModalEvalId}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      {requestModalEvalId !== null && (
        <RequestFeedbackModal
          evalId={requestModalEvalId}
          onClose={() => {
            setRequestModalEvalId(null)
            setRequestError('')
          }}
          submitting={submittingRequest}
          error={requestError}
          onSubmit={async (notes, date) => {
            setSubmittingRequest(true)
            setRequestError('')
            try {
              const res = await fetch('/api/coaching/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  linked_evaluation_id: requestModalEvalId,
                  preferred_date: date,
                  agent_notes: notes,
                }),
              })
              const json = await res.json()
              if (!res.ok) throw new Error(json.error || 'Failed to submit request')
              setRequestModalEvalId(null)
              fetchRequests()
            } catch (err: any) {
              setRequestError(err.message)
            } finally {
              setSubmittingRequest(false)
            }
          }}
        />
      )}
    </div>
  )
}
