'use client'

import React, { useState, useEffect, useCallback } from 'react'

interface ImportBatch {
  id: number
  batch_id: string
  lob: string
  upload_type: string
  filename: string
  user_id: number | null
  username: string
  user_name: string | null
  records_created: number
  records_updated: number
  status: 'ACTIVE' | 'ROLLED_BACK'
  created_at: string
  rolled_back_at: string | null
  rolled_back_by: string | null
}

interface ImportHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  lob: 'VA' | 'SSD' | 'ALL'
  onRollbackSuccess?: () => void
}

export default function ImportHistoryModal({ isOpen, onClose, lob, onRollbackSuccess }: ImportHistoryModalProps) {
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(false)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/import/history?lob=${lob}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load import history')
      setBatches(data.batches || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [lob])

  useEffect(() => {
    if (isOpen) {
      fetchHistory()
      setSuccess('')
      setError('')
    }
  }, [isOpen, fetchHistory])

  async function handleRollback(batch: ImportBatch) {
    const confirmMsg = `Are you sure you want to revert and undo the import for "${batch.filename}"?\n\nThis will remove the ${batch.records_created} created records and restore ${batch.records_updated} updated records to their prior state.`
    if (!window.confirm(confirmMsg)) return

    setRollingBackId(batch.batch_id)
    setError('')
    try {
      const res = await fetch('/api/import/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.batch_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rollback import')

      setSuccess(data.message || `Import "${batch.filename}" was successfully rolled back.`)
      fetchHistory()
      if (onRollbackSuccess) onRollbackSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRollingBackId(null)
    }
  }

  if (!isOpen) return null

  const formatUploadType = (type: string) => {
    switch (type) {
      case 'ssd_leads_import':
      case 'ssd_leads':
        return <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>📄 SSD Leads Sheet</span>
      case 'ssd_converted_sync':
      case 'ssd_converted':
        return <span style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🎉 SSD Converted Sync</span>
      case 'va_leads_import':
      case 'va_leads':
        return <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>📄 VA Leads Sheet</span>
      default:
        return <span style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>{type}</span>
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>⏪</span> Import History & Rollback Engine ({lob})
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              View past spreadsheets and reports imported for this team. Click "Undo / Rollback" to safely revert mistaken imports.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#fff',
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              ✅ {success}
            </div>
          )}

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              ⏳ Loading import history...
            </div>
          ) : batches.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              📄 No import history recorded yet. Future spreadsheet uploads and CRM syncs will appear here.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>File & Type</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Imported By</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Date & Time</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Impact</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => {
                    const isRollingBack = rollingBackId === b.batch_id
                    const isRolledBack = b.status === 'ROLLED_BACK'

                    return (
                      <tr
                        key={b.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          opacity: isRolledBack ? 0.6 : 1,
                          backgroundColor: isRolledBack ? 'rgba(0,0,0,0.15)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>{b.filename}</div>
                          <div>{formatUploadType(b.upload_type)}</div>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                          <div style={{ fontWeight: 600 }}>{b.user_name || b.username}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>@{b.username}</div>
                        </td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                          {b.created_at}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#34d399', fontWeight: 700 }}>+{b.records_created}</span> created
                          {b.records_updated > 0 && (
                            <span style={{ color: '#60a5fa', marginLeft: 6, fontSize: 12 }}>
                              · {b.records_updated} updated
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isRolledBack ? (
                            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              ↩️ Rolled Back
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {isRolledBack ? (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Reverted {b.rolled_back_at?.slice(0, 10)}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRollback(b)}
                              disabled={isRollingBack}
                              style={{
                                background: 'rgba(239,68,68,0.15)',
                                border: '1px solid rgba(239,68,68,0.35)',
                                color: '#f87171',
                                padding: '5px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isRollingBack ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                              }}
                            >
                              {isRollingBack ? '⏳ Reverting...' : '⏪ Revert Import'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px', fontSize: 13 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
