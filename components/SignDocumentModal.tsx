'use client'

import { useState } from 'react'
import { safeFetchJson } from '@/lib/apiClient'
import { downloadSignedDocumentPdf, DocumentData, AcknowledgementData } from '@/lib/pdfGenerator'
import FormattedMarkdown from './FormattedMarkdown'

interface Props {
  isOpen: boolean
  onClose: () => void
  document: (DocumentData & { ack_id?: number; ack_status?: string; signature_text?: string; signed_at?: string; ip_address?: string; doc_status?: string }) | null
  onSignedSuccess?: () => void
  readOnly?: boolean
}

export default function SignDocumentModal({
  isOpen,
  onClose,
  document: doc,
  onSignedSuccess,
  readOnly = false,
}: Props) {
  const [signatureText, setSignatureText] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [signedRecord, setSignedRecord] = useState<{ signature_text: string; signed_at: string } | null>(null)

  if (!isOpen || !doc) return null

  const isAlreadySigned = doc.ack_status === 'SIGNED' || !!signedRecord
  const isVoided = doc.status === 'VOIDED' || doc.doc_status === 'VOIDED'
  const effectiveSigner = signedRecord?.signature_text || doc.signature_text || ''
  const effectiveSignedAt = signedRecord?.signed_at || doc.signed_at || ''

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isVoided) {
      setError('This document was officially voided by management and can no longer be signed.')
      return
    }
    if (!confirmed) {
      setError('Please check the confirmation box agreeing to the contractor acknowledgment statement.')
      return
    }
    if (!signatureText.trim()) {
      setError('Please type your full legal name to sign.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await safeFetchJson('/api/documents/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          signature_text: signatureText.trim(),
          confirmed: true,
        }),
      })

      setSignedRecord({
        signature_text: res.signature_text,
        signed_at: res.signed_at,
      })

      if (onSignedSuccess) {
        onSignedSuccess()
      }
      window.dispatchEvent(new CustomEvent('documents-updated'))
    } catch (err: any) {
      setError(err.message || 'Failed to submit electronic signature')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadPdf = () => {
    const docData: DocumentData = {
      ...doc,
      status: doc.status || doc.doc_status,
      void_reason: doc.void_reason,
      voided_at: doc.voided_at,
      voided_by_name: doc.voided_by_name,
    }
    const ack: AcknowledgementData = {
      username: 'Specialist',
      user_display_name: effectiveSigner || 'Contractor',
      status: isAlreadySigned ? 'SIGNED' : 'PENDING',
      signature_text: effectiveSigner || undefined,
      signed_at: effectiveSignedAt || undefined,
      ip_address: doc.ip_address || undefined,
    }
    downloadSignedDocumentPdf(docData, ack)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="fade-in"
        style={{
          maxWidth: 820,
          width: '100%',
          maxHeight: '90vh',
          background: '#0a1628',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div
          style={{
            padding: '16px 24px',
            background: 'linear-gradient(90deg, #091a32 0%, #0d2342 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Andes Logo */}
              <img
                src="/logos/logo-andes.webp"
                alt="Andes Workforce"
                style={{ height: 26, objectFit: 'contain' }}
              />
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16 }}>|</span>
              {/* Tabak Logo */}
              <img
                src="/logos/logo-tabak.png"
                alt="Tabak Law, LLC"
                style={{ height: 26, objectFit: 'contain' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isAlreadySigned ? (
              <span
                style={{
                  background: 'rgba(16,185,129,0.18)',
                  color: '#34d399',
                  border: '1px solid rgba(16,185,129,0.4)',
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                ✓ Signed & Verified
              </span>
            ) : (
              <span
                style={{
                  background: 'rgba(245,158,11,0.18)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245,158,11,0.4)',
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                ⏳ Signature Required
              </span>
            )}
            <button
              onClick={onClose}
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

        {/* Scrollable Document Content Paper */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 36px',
            background: '#040d1a',
          }}
        >
          {/* Paper Container */}
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 8,
              padding: '36px 40px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              lineHeight: 1.6,
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
            {isVoided && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #ef4444', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🚫</span> OFFICIALLY VOIDED & REVOKED BY MANAGEMENT
                </div>
                <div style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>
                  Revoked on {doc.voided_at ? new Date(doc.voided_at).toLocaleDateString() : 'Recorded'} by {doc.voided_by_name || 'Management'}.
                  <br />
                  <strong>Void Reason:</strong> "{doc.void_reason || 'Withdrawn by management'}"
                </div>
              </div>
            )}

            {/* Document Meta Strip */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 18px', marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#b82105', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                {doc.category || 'Official Operational Directive'}
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
                {doc.title}
              </h1>
              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <span><strong>Issued by:</strong> {doc.created_by_name} ({doc.created_by_role === 'master' ? 'Director' : 'Team Leader'})</span>
                <span><strong>Date:</strong> {doc.created_at?.slice(0, 10)}</span>
                {doc.deadline_date && <span><strong>Signature Due:</strong> {doc.deadline_date}</span>}
              </div>
            </div>

            {/* Formatted Markdown Body */}
            <FormattedMarkdown content={doc.content} style={{ marginBottom: 32 }} />

            {/* Digital Signature Certificate Block */}
            <div
              style={{
                background: isAlreadySigned ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
                border: isAlreadySigned ? '1px solid #10b981' : '1px solid #f59e0b',
                borderRadius: 8,
                padding: '20px 24px',
                marginTop: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: isAlreadySigned ? '#047857' : '#b45309', letterSpacing: '0.04em' }}>
                    {isAlreadySigned ? '✓ CERTIFICATE OF ELECTRONIC SIGNATURE & LEGAL ACKNOWLEDGMENT' : '⚠️ CONTRACTOR LEGAL ACKNOWLEDGMENT & SIGNATURE REQUIREMENT'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Recorded by Andes Workforce, LLC for Tabak Law, LLC Operations
                  </div>
                </div>
                {isAlreadySigned && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>
                    VERIFIED
                  </span>
                )}
              </div>

              {/* Independent Contractor Legal Clause */}
              <div style={{ fontSize: 11.5, color: '#334155', fontStyle: 'italic', background: 'rgba(0,0,0,0.03)', padding: '12px 16px', borderRadius: 6, marginBottom: 16, borderLeft: '3px solid #0f294a' }}>
                "I, <strong>{effectiveSigner || '[Independent Contractor Full Name]'}</strong>, an independent contractor of <strong>Andes Workforce, LLC</strong> assigned to provide intake and operational support for the <strong>Tabak Law, LLC</strong> account, hereby acknowledge that I have received, read, and understand this communication. I agree to comply with the operational guidelines, quality standards, and policies set forth herein. I understand that entering my full legal name below constitutes my legally binding electronic signature."
              </div>

              {isAlreadySigned ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: 11.5, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>INDEPENDENT CONTRACTOR</span>
                    <strong style={{ color: '#0f172a' }}>{effectiveSigner}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>SIGNATURE STATUS</span>
                    <strong style={{ color: '#047857' }}>[DIGITALLY SIGNED /s/ {effectiveSigner}]</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>TIMESTAMP</span>
                    <strong style={{ color: '#0f172a' }}>{effectiveSignedAt?.replace('T', ' ').slice(0, 19)} UTC</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: 10, fontWeight: 700 }}>SECURITY AUDIT</span>
                    <strong style={{ color: '#047857' }}>Verified via Portal Session</strong>
                  </div>
                </div>
              ) : isVoided ? (
                <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 8, padding: '16px 20px', textAlign: 'center', color: '#991b1b', marginTop: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span>🚫</span> OFFICIAL COMMUNICATION VOIDED
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 4 }}>
                    This document has been officially revoked and nullified by management. No electronic signature or contractor acknowledgment is required.
                  </div>
                </div>
              ) : !readOnly ? (
                <form onSubmit={handleSign} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '8px 14px', borderRadius: 6, fontSize: 12 }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12, color: '#0f172a' }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      style={{ marginTop: 2, accentColor: '#0f294a', width: 16, height: 16 }}
                    />
                    <span>
                      I confirm that I have thoroughly read, understand, and agree to comply with this communication as an independent contractor of <strong>Andes Workforce, LLC</strong> providing services to <strong>Tabak Law, LLC</strong>.
                    </span>
                  </label>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      TYPE YOUR FULL LEGAL NAME TO EXECUTE SIGNATURE *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Jane Doe"
                      value={signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 6,
                        border: '2px solid #cbd5e1',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#0f172a',
                        background: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        background: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Close & Review Later
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        padding: '9px 22px',
                        borderRadius: 6,
                        background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 12px rgba(4,120,87,0.3)',
                      }}
                    >
                      {submitting ? 'Submitting Signature...' : '✍️ Confirm & Submit Electronic Signature'}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </div>

        {/* Bottom Modal Actions Bar */}
        <div
          style={{
            padding: '14px 24px',
            background: '#0a1628',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Andes Workforce, LLC in coordination with Tabak Law, LLC · Portal Document System
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              style={{
                padding: '7px 16px',
                borderRadius: 6,
                background: 'rgba(59,130,246,0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.35)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📥</span> Download PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 16px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.06)',
                color: '#cbd5e1',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
