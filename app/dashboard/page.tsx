'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import PersonalDashboard, { GoalSettings } from '@/components/PersonalDashboard'
import SummaryCards from '@/components/SummaryCards'
import Leaderboard from '@/components/Leaderboard'
import PerformanceLineChart from '@/components/charts/PerformanceLineChart'
import CAPDBarChart from '@/components/charts/CAPDBarChart'
import WeekdayHeatmap from '@/components/charts/WeekdayHeatmap'
import ConversionChart from '@/components/charts/ConversionChart'
import { generateEODReportHtml } from '@/lib/eodReport'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

const PRESETS = [
  { label: 'Last 7 days', getValue: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'All time', getValue: () => ({ from: '2025-01-01', to: '2099-12-31' }) },
]

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const [data, setData] = useState<any[]>([])
  const [appsData, setAppsData] = useState<any[]>([])
  const [goals, setGoals] = useState<GoalSettings | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This month')
  const [selectedLob, setSelectedLob] = useState<string>('')
  const [copyToast, setCopyToast] = useState(false)

  const role = (session?.user as any)?.role || 'regular'
  const isSuper = role === 'master' || role === 'superadmin'
  const isAdmin = role === 'admin'
  const isRegular = role === 'regular'
  const perms = (session?.user as any)?.permissions
  const userName = session?.user?.name || ''

  const allowedLobs: string[] = isSuper
    ? ['VA', 'SSD', 'APPS', 'All']
    : (perms?.allowedLobs ? [...perms.allowedLobs, ...(perms.allowedLobs.length > 1 ? ['All'] : [])] : ['VA'])

  const canCopyEOD = isSuper || (isAdmin && (perms?.canCopyEOD ?? true))

  async function handleCopyEODReport() {
    let mtdPerfData = data
    try {
      if (selectedLob !== 'APPS') {
        const toDateObj = new Date(to + 'T00:00:00')
        const mtdFrom = format(startOfMonth(toDateObj), 'yyyy-MM-dd')
        if (mtdFrom !== from || mtdFrom !== to) {
          const lobParam = selectedLob && selectedLob !== 'All' ? `&lob=${selectedLob}` : ''
          const res = await fetch(`/api/performance?from=${mtdFrom}&to=${to}${lobParam}`)
          if (res.ok) {
            const json = await res.json()
            if (Array.isArray(json)) mtdPerfData = json
          }
        }
      }
    } catch {
      // fallback to data
    }

    const { html, text } = generateEODReportHtml({
      lob: selectedLob,
      from,
      to,
      perfData: data,
      appsData: appsData,
      mtdPerfData,
      teamLeader: userName || 'Marco Pabon',
      teamManager: 'Ryan Gwinn',
      schedule: '8AM - 5PM',
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

    setCopyToast(true)
    setTimeout(() => setCopyToast(false), 4000)
  }

  useEffect(() => {
    if (session?.user) {
      const u = session.user as any
      if (allowedLobs.length > 0 && !allowedLobs.includes(selectedLob)) {
        setSelectedLob(allowedLobs[0])
      } else if (!selectedLob) {
        setSelectedLob(u.lob || 'VA')
      }
    }
  }, [session, allowedLobs])

  const fetchData = useCallback(async () => {
    if (status === 'loading' || !selectedLob) return
    setLoading(true)
    try {
      if (selectedLob === 'APPS') {
        const res = await fetch(`/api/apps-team?from=${from}&to=${to}`)
        const json = await res.json()
        setAppsData(json.entries || [])
        setData([])
      } else {
        const lobParam = selectedLob && selectedLob !== 'All' ? `&lob=${selectedLob}` : ''
        const res = await fetch(`/api/performance?from=${from}&to=${to}${lobParam}`)
        const json = await res.json()
        setData(Array.isArray(json) ? json : [])
        setAppsData([])
      }
    } catch {
      setData([])
      setAppsData([])
    } finally {
      setLoading(false)
    }
  }, [from, to, selectedLob, status])

  useEffect(() => {
    if (status !== 'loading') {
      fetchData()
    }
  }, [fetchData, status])

  // Fetch goal settings once
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setGoals({
        // VA
        goal_signed_retainers_va: parseInt(s.goal_signed_retainers_va) || 35,
        goal_conversion_rate_va: parseInt(s.goal_conversion_rate_va) || 65,
        goal_avg_capd_va: parseInt(s.goal_avg_capd_va) || 40,
        // SSD
        goal_converted_cases_ssd: parseInt(s.goal_converted_cases_ssd) || 35,
        goal_conversion_rate_ssd: parseInt(s.goal_conversion_rate_ssd) || 65,
        goal_avg_capd_ssd: parseInt(s.goal_avg_capd_ssd) || 40,
        // Legacy fallback
        goal_signed_retainers: parseInt(s.goal_signed_retainers) || 35,
        goal_conversion_rate: parseInt(s.goal_conversion_rate) || 65,
        goal_avg_capd: parseInt(s.goal_avg_capd) || 40,
      }))
      .catch(() => {})
  }, [])

  function applyPreset(preset: typeof PRESETS[0]) {
    const vals = preset.getValue()
    setFrom(vals.from)
    setTo(vals.to)
    setActivePreset(preset.label)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />

      <main style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        padding: '32px 28px',
        background: 'radial-gradient(ellipse at 70% 0%, rgba(99,102,241,0.06) 0%, transparent 50%), var(--bg-primary)',
        minHeight: '100vh',
      }}>
        {/* Header & LOB selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
              {isRegular ? 'My Dashboard' : 'Team Performance'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {selectedLob === 'SSD' ? 'Social Security Disability Division' : selectedLob === 'VA' ? 'Veterans Benefits Division' : 'Unified Division'} · Tabak LLC
            </p>
          </div>

          {!isRegular && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="field-label" style={{ marginBottom: 0, whiteSpace: 'nowrap', fontWeight: 600 }}>Filter LOB:</label>
              <select
                id="dashboard-lob-select"
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
                {allowedLobs.includes('VA') && <option value="VA" style={{ background: '#1e1b4b', color: '#fff' }}>VA Intake Specialists</option>}
                {allowedLobs.includes('SSD') && <option value="SSD" style={{ background: '#1e1b4b', color: '#fff' }}>SSD Intake Specialists</option>}
                {allowedLobs.includes('APPS') && <option value="APPS" style={{ background: '#1e1b4b', color: '#fff' }}>Apps Team (SSA Filings)</option>}
                {allowedLobs.includes('All') && <option value="All" style={{ background: '#1e1b4b', color: '#fff' }}>All LOBs</option>}
              </select>
            </div>
          )}
        </div>

        {/* Date filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              id={`preset-${preset.label.replace(/\s+/g, '-').toLowerCase()}`}
              className={activePreset === preset.label ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '7px 14px', fontSize: 13 }}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <input
              id="date-from"
              type="date"
              className="input-field"
              style={{ width: 150 }}
              value={from}
              onChange={(e) => { setFrom(e.target.value); setActivePreset('Custom') }}
            />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input
              id="date-to"
              type="date"
              className="input-field"
              style={{ width: 150 }}
              value={to}
              onChange={(e) => { setTo(e.target.value); setActivePreset('Custom') }}
            />
            <button id="btn-refresh" className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={fetchData}>
              Refresh
            </button>
            {canCopyEOD && (
              <button
                id="btn-copy-eod"
                className="btn-secondary"
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  background: 'rgba(59,130,246,0.15)',
                  borderColor: 'rgba(59,130,246,0.35)',
                  color: '#60a5fa',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onClick={handleCopyEODReport}
              >
                <span>📋</span> Copy EOD Report for Outlook
              </button>
            )}
          </div>
        </div>

        {copyToast && (
          <div className="fade-in" style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 10,
            padding: '12px 18px',
            marginBottom: 20,
            color: '#10b981',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <span>EOD Report copied to clipboard! Open Outlook and press <strong>Ctrl+V</strong> to paste the formatted HTML table.</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-secondary)' }}>
            <span style={{ width: 24, height: 24, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            Loading performance data…
          </div>
        ) : data.length === 0 && appsData.length === 0 ? (
          <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No data for this period</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Try selecting a wider date range, or import your Excel file to load historical data.
            </p>
          </div>
        ) : (
          <>
            {/* ── Personal Dashboard (Regular users) ── */}
            {isRegular && userName && (
              <PersonalDashboard allData={data} agentName={userName} goals={goals} lob={selectedLob} />
            )}

            {/* ── Section divider for regular users ── */}
            {isRegular && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Team Overview
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}

            {/* ── Team Dashboard ── */}
            {selectedLob !== 'APPS' && (
              <>
                <SummaryCards data={data} lob={selectedLob} />

                {/* Charts Row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
                  <PerformanceLineChart
                    data={data}
                    metric={selectedLob === 'SSD' ? 'converted_cases' : 'signed_retainers'}
                    title={selectedLob === 'SSD' ? 'Converted Cases Over Time' : 'Signed Retainers Over Time'}
                  />
                  <ConversionChart data={data} lob={selectedLob} />
                </div>

                {/* Charts Row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  <CAPDBarChart data={data} />
                  <WeekdayHeatmap data={data} />
                </div>
              </>
            )}

            {/* Leaderboard */}
            <div style={{ marginTop: selectedLob === 'APPS' ? 0 : 16 }}>
              <Leaderboard data={data} lob={selectedLob} appsData={appsData} />
            </div>
          </>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
