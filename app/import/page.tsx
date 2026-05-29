'use client'

import { useState } from 'react'
import Navigation from '@/components/Navigation'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported?: number; skipped?: number; error?: string } | null>(null)
  const [dragging, setDragging] = useState(false)

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const json = await res.json()
      setResult(json)
    } catch {
      setResult({ error: 'Upload failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.xlsx')) setFile(f)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Import Excel</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Upload your EOD Report.xlsx to import historical data from the <strong>Acumulado</strong> sheet.
              Existing records will be updated (safe to re-import).
            </p>
          </div>

          {/* Instructions card */}
          <div className="glass-card" style={{ padding: '18px 22px', marginBottom: 20, borderColor: 'rgba(99,102,241,0.3)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              What gets imported
            </h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                '✅ All records from the Acumulado sheet',
                '✅ Agent names, dates, CAPD, CRH, Case Rejected',
                '✅ Signed & Unsigned Retainers + Conversion Rate',
                '✅ Attendance (Presente) and Week labels',
                '⚠️ Duplicate entries (same date + agent) will be updated',
              ].map((item) => (
                <li key={item} style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                  <span style={{ minWidth: 20 }}>{item.charAt(0)}</span>
                  <span>{item.slice(2)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Drop zone */}
          <div
            id="drop-zone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('file-input')?.click()}
            className="glass-card"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              borderColor: dragging ? '#6366f1' : file ? 'rgba(16,185,129,0.5)' : 'var(--border)',
              background: dragging ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
              transition: 'all 0.2s',
              marginBottom: 20,
            }}
          >
            <input
              id="file-input"
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div style={{ fontSize: 36, marginBottom: 12 }}>{file ? '📊' : '📁'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981', marginBottom: 4 }}>{file.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Drop your Excel file here</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or click to browse · .xlsx files only</div>
              </>
            )}
          </div>

          {/* Result */}
          {result && (
            <div style={{
              background: result.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
              border: `1px solid ${result.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
              borderRadius: 12, padding: '18px 22px', marginBottom: 20,
            }}>
              {result.error ? (
                <div style={{ color: '#ef4444', fontWeight: 600 }}>❌ {result.error}</div>
              ) : (
                <>
                  <div style={{ color: '#10b981', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>✅ Import complete!</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: '#10b981' }}>{result.imported?.toLocaleString()}</span> records imported
                    {result.skipped ? <> · <span style={{ color: '#f59e0b', fontWeight: 600 }}>{result.skipped}</span> skipped (no agent name)</> : ''}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Upload button */}
          <button
            id="btn-upload"
            className="btn-primary"
            onClick={handleUpload}
            disabled={!file || loading}
            style={{ padding: '13px 28px', fontSize: 15, width: '100%' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                Importing data…
              </span>
            ) : (
              '📥 Import Data'
            )}
          </button>
        </div>
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
