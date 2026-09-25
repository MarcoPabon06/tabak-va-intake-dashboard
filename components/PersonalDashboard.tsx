'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { computeBadges } from '@/lib/badges'
import BadgeShelf from '@/components/BadgeShelf'
import PersonalQA from '@/components/PersonalQA'

import { useState, useEffect } from 'react'
import { safeFetchJson } from '@/lib/apiClient'
import SignDocumentModal from '@/components/SignDocumentModal'
import { downloadSignedDocumentPdf } from '@/lib/pdfGenerator'

export interface GoalSettings {
  goal_signed_retainers?: number
  goal_conversion_rate?: number
  goal_avg_capd?: number
  // VA
  goal_signed_retainers_va?: number
  goal_conversion_rate_va?: number
  goal_avg_capd_va?: number
  // SSD
  goal_converted_cases_ssd?: number
  goal_conversion_rate_ssd?: number
  goal_avg_capd_ssd?: number
  // APPS
  goal_apps_filed_apps?: number
  goal_conversion_rate_apps?: number
  goal_converted_cases_apps?: number
}

interface AppEntry {
  id: number
  lead_id: string
  client_name: string
  date_completed: string
  converted: 'YES' | 'NO'
  reason_not_converted?: string
  other_reason?: string
  rep_name: string
}

interface Row {
  date: string
  agent_name: string
  capd: number
  inbound_calls: number
  case_rejected: number
  crh: number
  signed_retainers: number
  unsigned_retainers: number
  converted_cases?: number
  rfc_sent?: number
  total_case_wanted: number
  signed_success_rate: number
  present: string
}

interface Props {
  allData: Row[]
  agentName: string
  goals?: GoalSettings
  lob?: string
}

function progressColor(pct: number) {
  if (pct >= 100) return '#10b981'
  if (pct >= 70) return '#b82105'
  if (pct >= 40) return '#f59e0b'
  return '#ef4444'
}

function formatHms(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return '00:00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function PersonalDashboard({ allData, agentName, goals, lob = 'VA' }: Props) {
  const isSSD = lob === 'SSD'
  const isAPPS = lob === 'APPS'

  // VA Dialer Efficiency Adherence State (VA Intake only)
  const [efficiencyRecord, setEfficiencyRecord] = useState<any | null>(null)
  const [efficiencyLoading, setEfficiencyLoading] = useState(false)

  const fetchEfficiencyData = async () => {
    if (lob !== 'VA' || !agentName) return
    setEfficiencyLoading(true)
    try {
      const res = await safeFetchJson(`/api/va-tracker/efficiency?rep=${encodeURIComponent(agentName)}`)
      if (res?.records && res.records.length > 0) {
        setEfficiencyRecord(res.records[0])
      } else {
        setEfficiencyRecord(null)
      }
    } catch (err) {
      console.error('Failed to load dialer efficiency:', err)
    } finally {
      setEfficiencyLoading(false)
    }
  }

  useEffect(() => {
    fetchEfficiencyData()
    const handleEfficiencyUpdate = () => fetchEfficiencyData()
    window.addEventListener('efficiency-updated', handleEfficiencyUpdate)
    return () => window.removeEventListener('efficiency-updated', handleEfficiencyUpdate)
  }, [lob, agentName])

  // Apps Team State
  const [appsData, setAppsData] = useState<AppEntry[]>([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [appsMsg, setAppsMsg] = useState('')

  // Specialist Documents & Signed Policies State
  const [pendingDocs, setPendingDocs] = useState<any[]>([])
  const [signedDocs, setSignedDocs] = useState<any[]>([])
  const [docsSubTab, setDocsSubTab] = useState<'pending' | 'signed'>('pending')
  const [selectedDocToSign, setSelectedDocToSign] = useState<any | null>(null)

  const fetchSpecialistDocuments = async () => {
    try {
      const res = await safeFetchJson('/api/documents')
      if (res?.pending) setPendingDocs(res.pending)
      if (res?.signed) setSignedDocs(res.signed)
    } catch (err) {
      console.error('Failed to fetch specialist documents:', err)
    }
  }

  useEffect(() => {
    fetchSpecialistDocuments()
    const handleUpdate = () => fetchSpecialistDocuments()
    window.addEventListener('documents-updated', handleUpdate)
    return () => window.removeEventListener('documents-updated', handleUpdate)
  }, [])

  useEffect(() => {
    if (isAPPS) {
      setAppsLoading(true)
      fetch(`/api/apps-team?rep=${encodeURIComponent(agentName)}`)
        .then(res => res.json())
        .then(data => {
          setAppsData(data.entries || [])
          setAppsLoading(false)
        })
        .catch(() => setAppsLoading(false))
    }
  }, [isAPPS, agentName])

  // Quick Convert Handler for Apps Reps
  async function handleQuickConvert(id: number, leadId: string) {
    try {
      const res = await fetch('/api/apps-team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, converted: 'YES' }),
      })
      if (res.ok) {
        setAppsMsg(`Lead ID "${leadId}" converted successfully! 🎉`)
        setAppsData(prev => prev.map(e => e.id === id ? { ...e, converted: 'YES' } : e))
        setTimeout(() => setAppsMsg(''), 4000)
      }
    } catch {}
  }
  const g = {
    goal_signed_retainers: isSSD
      ? (goals?.goal_converted_cases_ssd ?? goals?.goal_signed_retainers ?? 35)
      : (goals?.goal_signed_retainers_va ?? goals?.goal_signed_retainers ?? 35),
    goal_conversion_rate: isSSD
      ? (goals?.goal_conversion_rate_ssd ?? goals?.goal_conversion_rate ?? 65)
      : (goals?.goal_conversion_rate_va ?? goals?.goal_conversion_rate ?? 65),
    goal_avg_capd: isSSD
      ? (goals?.goal_avg_capd_ssd ?? goals?.goal_avg_capd ?? 40)
      : (goals?.goal_avg_capd_va ?? goals?.goal_avg_capd ?? 40),
  }
  const myData = allData.filter((r) => r.agent_name === agentName)

  // ── Totals ──
  const totalSigned = myData.reduce((s, r) => s + (r.signed_retainers || 0), 0)
  const totalUnsigned = myData.reduce((s, r) => s + (r.unsigned_retainers || 0), 0)
  const totalConverted = myData.reduce((s, r) => s + (r.converted_cases || 0), 0)
  const totalRfc = myData.reduce((s, r) => s + (r.rfc_sent || 0), 0)
  const totalCases = totalSigned + totalUnsigned
  const signedRate = totalCases > 0 ? (totalSigned / totalCases) * 100 : 0
  
  const convRate = lob === 'SSD'
    ? (totalSigned > 0 ? (totalConverted / totalSigned) * 100 : 0)
    : (totalCases > 0 ? (totalSigned / totalCases) * 100 : 0)

  const totalCrh = myData.reduce((s, r) => s + (r.crh || 0), 0)
  const totalRejected = myData.reduce((s, r) => s + (r.case_rejected || 0), 0)
  const presentRows = myData.filter((r) => {
    if (!r.present) return true
    const p = r.present.toString().trim().toUpperCase().replace(/[Í]/g, 'I')
    return p === 'SI' || p === 'TARDY' || p === 'PRESENTE' || p === 'PRESENT' || p === '1' || p === 'YES' || p === 'TRUE'
  })
  const avgCapd = presentRows.length > 0
    ? Math.round(presentRows.reduce((s, r) => s + (r.capd || 0), 0) / presentRows.length)
    : 0

  const daysWorked = new Set(myData.map((r) => r.date)).size

  // ── Goals ──
  const primaryVolume = lob === 'SSD' ? totalConverted : totalSigned
  const signedPct = Math.min(Math.round((primaryVolume / (g.goal_signed_retainers || 35)) * 100), 150)
  const convPct = Math.min(Math.round((convRate / (g.goal_conversion_rate || 65)) * 100), 150)
  const capdPct = Math.min(Math.round((avgCapd / (g.goal_avg_capd || 40)) * 100), 150)

  // ── Ranking ──
  const rankingMetric = lob === 'SSD' ? 'converted_cases' : 'signed_retainers'
  const agentTotals: Record<string, number> = {}
  for (const r of allData) {
    agentTotals[r.agent_name] = (agentTotals[r.agent_name] || 0) + (r[rankingMetric] || 0)
  }
  const sorted = Object.entries(agentTotals).sort((a, b) => b[1] - a[1])
  const myRank = sorted.findIndex(([n]) => n === agentName) + 1
  const totalAgents = sorted.length

  // ── Daily trend (for mini chart) ──
  const byDate: Record<string, { signed: number; capd: number; converted: number }> = {}
  for (const r of myData) {
    if (!byDate[r.date]) byDate[r.date] = { signed: 0, capd: 0, converted: 0 }
    byDate[r.date].signed += r.signed_retainers || 0
    byDate[r.date].capd += r.capd || 0
    byDate[r.date].converted += r.converted_cases || 0
  }
  const trendData = Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({
      date: date.slice(5), // MM-DD
      signed: vals.signed,
      capd: vals.capd,
      converted: vals.converted,
    }))

  // ── Weekly comparison ──
  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1) // Monday
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  const thisWeekStr = thisWeekStart.toISOString().slice(0, 10)
  const lastWeekStr = lastWeekStart.toISOString().slice(0, 10)

  const thisWeekVal = myData
    .filter((r) => r.date >= thisWeekStr)
    .reduce((s, r) => s + (r[rankingMetric] || 0), 0)
  const lastWeekVal = myData
    .filter((r) => r.date >= lastWeekStr && r.date < thisWeekStr)
    .reduce((s, r) => s + (r[rankingMetric] || 0), 0)
  const weekDiff = thisWeekVal - lastWeekVal

  // ── Streak ──
  const uniqueDates = [...new Set(myData.filter((r) => (r[rankingMetric] || 0) > 0).map((r) => r.date))].sort().reverse()
  let streak = 0
  const today = new Date()
  const checkDate = new Date(today)
  for (let i = 0; i < 60; i++) {
    const ds = checkDate.toISOString().slice(0, 10)
    const dow = checkDate.getDay()
    if (dow === 0 || dow === 6) { checkDate.setDate(checkDate.getDate() - 1); continue }
    if (uniqueDates.includes(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1) }
    else break
  }

  // ── APPS Team Dedicated View ──
  if (isAPPS) {
    const totalApps = appsData.length
    const convertedApps = appsData.filter(e => e.converted === 'YES').length
    const pendingApps = appsData.filter(e => e.converted === 'NO')
    const pendingCount = pendingApps.length
    const appsConvRate = totalApps > 0 ? (convertedApps / totalApps) * 100 : 0

    const targetAppsFiled = goals?.goal_apps_filed_apps ?? 30
    const targetAppsRate = goals?.goal_conversion_rate_apps ?? 75
    const targetAppsConverted = goals?.goal_converted_cases_apps ?? 20

    const filedPct = Math.min(Math.round((totalApps / targetAppsFiled) * 100), 150)
    const ratePct = Math.min(Math.round((appsConvRate / targetAppsRate) * 100), 150)
    const convertedPct = Math.min(Math.round((convertedApps / targetAppsConverted) * 100), 150)

    const reasonsBreakdown: Record<string, number> = {}
    pendingApps.forEach(e => {
      const r = e.reason_not_converted || 'Other'
      reasonsBreakdown[r] = (reasonsBreakdown[r] || 0) + 1
    })

    return (
      <div style={{ marginBottom: 28 }}>
        {/* Welcome banner */}
        <div className="glass-card fade-in" style={{
          padding: '24px 28px',
          marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.08) 100%)',
          borderColor: 'rgba(16,185,129,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
                Welcome back, {agentName.split(' ')[0]}! 📲
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Apps Team Specialist &nbsp;|&nbsp; {totalApps} SSA applications logged
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ textAlign: 'center', padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Conversion Rate</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{appsConvRate.toFixed(1)}%</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pending Reminders</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{pendingCount}</div>
              </div>
            </div>
          </div>
        </div>

        {appsMsg && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#10b981', fontSize: 14, fontWeight: 600 }}>
            ✅ {appsMsg}
          </div>
        )}

        {/* Goal Progress Bars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>📝 Apps Filed</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: progressColor(filedPct) }}>{totalApps} / {targetAppsFiled}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(filedPct, 100)}%`, height: '100%', background: progressColor(filedPct), borderRadius: 3 }} />
            </div>
          </div>

          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>📈 Conversion Rate</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: progressColor(ratePct) }}>{appsConvRate.toFixed(1)}% / {targetAppsRate}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(ratePct, 100)}%`, height: '100%', background: progressColor(ratePct), borderRadius: 3 }} />
            </div>
          </div>

          <div className="glass-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>✅ Converted Cases</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: progressColor(convertedPct) }}>{convertedApps} / {targetAppsConverted}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(convertedPct, 100)}%`, height: '100%', background: progressColor(convertedPct), borderRadius: 3 }} />
            </div>
          </div>
        </div>

        {/* Embedded Pending Reminder Queue */}
        <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>⏳ Your Pending Conversion Reminder Queue</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>Clear pending cases as soon as wet signatures, 827 forms, or scheduled yellow screens are resolved.</p>
            </div>
            <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12 }}>
              {pendingCount} Pending Action
            </span>
          </div>

          {appsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading pending queue...</p>
          ) : pendingApps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
              <p style={{ fontSize: 13 }}>No pending applications! All your filings are converted.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {pendingApps.map(entry => (
                <div key={entry.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.25)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{entry.client_name}</span>
                      <span className="badge" style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)' }}>Lead ID: {entry.lead_id}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Filed: {entry.date_completed}</div>
                    <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>Reason: </span>
                      <span>{entry.reason_not_converted}</span>
                      {entry.other_reason && <span style={{ color: 'var(--text-muted)' }}> (&quot;{entry.other_reason}&quot;)</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 11, background: '#10b981' }} onClick={() => handleQuickConvert(entry.id, entry.lead_id)}>
                      ✅ Mark Converted (YES)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Non-Conversion Reason Breakdown Cards */}
        {Object.keys(reasonsBreakdown).length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>📊 Your Pending Cases by Reason</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {Object.entries(reasonsBreakdown).map(([r, count]) => (
                <div key={r} style={{ padding: 14, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>{r}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{count} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>cases</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── No data ──
  if (myData.length === 0) {
    return (
      <div className="glass-card" style={{ padding: 40, textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Welcome, {agentName.split(' ')[0]}!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          No performance data found for this period yet. Your stats will appear here once your admin enters your daily numbers.
        </p>
      </div>
    )
  }

  const streakLabel = lob === 'SSD' ? 'conversion streak' : 'signing streak'

  const goalCards = lob === 'SSD' ? [
    { label: 'Converted Cases', value: primaryVolume, goal: g.goal_signed_retainers, pct: signedPct, icon: '💼', unit: '' },
    { label: 'Case Conv. Rate', value: convRate.toFixed(1), goal: g.goal_conversion_rate, pct: convPct, icon: '📈', unit: '%' },
    { label: 'Signed Rate', value: signedRate.toFixed(1), goal: 65, pct: Math.min(Math.round((signedRate / 65) * 100), 150), icon: '📝', unit: '%' },
    { label: 'Avg CAPD', value: avgCapd, goal: g.goal_avg_capd, pct: capdPct, icon: '📞', unit: '' },
  ] : [
    { label: 'Signed Retainers', value: primaryVolume, goal: g.goal_signed_retainers, pct: signedPct, icon: '✅', unit: '' },
    { label: 'Signing Rate', value: convRate.toFixed(1), goal: g.goal_conversion_rate, pct: convPct, icon: '📈', unit: '%' },
    { label: 'Avg CAPD', value: avgCapd, goal: g.goal_avg_capd, pct: capdPct, icon: '📞', unit: '' },
  ]

  const kpiCards = lob === 'SSD' ? [
    { label: 'Total Converted', value: totalConverted, color: '#10b981', icon: '💼' },
    { label: 'Total Signed', value: totalSigned, color: '#3b82f6', icon: '✅' },
    { label: 'Total Unsigned', value: totalUnsigned, color: '#f59e0b', icon: '⏳' },
    { label: 'Signed Rate', value: `${signedRate.toFixed(1)}%`, color: '#6366f1', icon: '📝' },
    { label: 'Case Conv. Rate', value: `${convRate.toFixed(1)}%`, color: '#b82105', icon: '📈' },
    { label: 'Avg CAPD', value: avgCapd, color: avgCapd >= (g.goal_avg_capd || 40) ? '#10b981' : '#f59e0b', icon: '📞' },
    { label: 'RFC Sent', value: totalRfc, color: '#ec4899', icon: '📄' },
    { label: 'CRH', value: totalCrh, color: '#ef4444', icon: '🚫' },
    { label: 'Rejected', value: totalRejected, color: '#94a3b8', icon: '❌' },
  ] : [
    { label: 'Total Signed', value: totalSigned, color: '#10b981', icon: '✅' },
    { label: 'Total Unsigned', value: totalUnsigned, color: '#f59e0b', icon: '⏳' },
    { label: 'Conversion Rate', value: `${convRate.toFixed(1)}%`, color: '#b82105', icon: '📈' },
    { label: 'Avg CAPD', value: avgCapd, color: avgCapd >= (g.goal_avg_capd || 40) ? '#10b981' : '#f59e0b', icon: '📞' },
    { label: 'CRH', value: totalCrh, color: '#ef4444', icon: '🚫' },
    { label: 'Rejected', value: totalRejected, color: '#94a3b8', icon: '❌' },
  ]

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Urgent Pending Signatures Banner */}
      {pendingDocs.length > 0 && (
        <div
          className="fade-in"
          style={{
            background: 'linear-gradient(90deg, rgba(239,68,68,0.2) 0%, rgba(185,28,28,0.1) 100%)',
            border: '1px solid rgba(239,68,68,0.45)',
            borderRadius: 10,
            padding: '14px 20px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🚨</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fca5a5' }}>
                Action Required: You have {pendingDocs.length} official firm communication{pendingDocs.length > 1 ? 's' : ''} awaiting your electronic signature!
              </div>
              <div style={{ fontSize: 11.5, color: '#f87171' }}>
                Latest: "{pendingDocs[0]?.title}" issued by {pendingDocs[0]?.created_by_name}.
              </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedDocToSign(pendingDocs[0])}
            className="btn-primary"
            style={{
              background: '#ef4444',
              fontSize: 12,
              fontWeight: 800,
              padding: '8px 18px',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 12px rgba(239,68,68,0.4)',
            }}
          >
            ✍️ Review & Sign ({pendingDocs.length})
          </button>
        </div>
      )}

      {/* Welcome banner */}
      <div className="glass-card fade-in" style={{
        padding: '24px 28px',
        marginBottom: 16,
        background: 'linear-gradient(135deg, rgba(184, 33, 5, 0.12) 0%, rgba(16,185,129,0.08) 100%)',
        borderColor: 'rgba(184, 33, 5, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
              Welcome back, {agentName.split(' ')[0]}! 👋
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {daysWorked} day{daysWorked !== 1 ? 's' : ''} tracked this period
              {streak > 0 && (
                <span style={{ marginLeft: 12, color: '#f59e0b', fontWeight: 600 }}>
                  🔥 {streak}-day {streakLabel}
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {/* Ranking badge */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '10px 16px', borderRadius: 12,
              background: myRank === 1 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${myRank === 1 ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: myRank === 1 ? '#f59e0b' : myRank <= 3 ? '#b82105' : 'var(--text-primary)' }}>
                #{myRank}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>of {totalAgents}</span>
            </div>
            {/* Week comparison */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>This week</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{thisWeekVal}</div>
              <div style={{ fontSize: 11, color: weekDiff >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {weekDiff >= 0 ? '▲' : '▼'} {Math.abs(weekDiff)} vs last week
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievement Badges (VA Intake only) */}
      {!isSSD && <BadgeShelf badges={computeBadges(allData, agentName)} />}

      {/* QA Score Summary */}
      <PersonalQA agentName={agentName} />

      {/* Law Ruler Dialer Status Adherence Card (VA Intake only) */}
      {!isSSD && !isAPPS && (
        <div
          className="glass-card fade-in"
          style={{
            padding: '22px 24px',
            marginBottom: 16,
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7) 0%, rgba(30, 41, 59, 0.4) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20 }}>⏱️</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#fff' }}>
                  Law Ruler Dialer Status Adherence
                </h3>
                {efficiencyRecord?.is_narrative_rep === 1 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(59,130,246,0.2)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.3)',
                    }}
                  >
                    📝 VA Narrative Project (2.5h Busy Allowed)
                  </span>
                )}
                {efficiencyRecord?.is_onboarding_rep === 1 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(168,85,247,0.2)',
                      color: '#c084fc',
                      border: '1px solid rgba(168,85,247,0.3)',
                    }}
                  >
                    🌱 Onboarding Trainee
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                Operational standards adherence for {efficiencyRecord ? `shift date ${efficiencyRecord.date}` : 'your latest shift'} &bull; Tabak & Andes Policy (Sept 21, 2026)
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a
                href="https://forms.cloud.microsoft/r/KmyM1LBSzh"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 14px',
                  borderRadius: 8,
                  background: 'rgba(59,130,246,0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.3)',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>📋 Submit Exception Form</span>
                <span>↗</span>
              </a>
            </div>
          </div>

          {efficiencyLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading your dialer metrics...
            </div>
          ) : !efficiencyRecord ? (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(255,255,255,0.12)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <strong>No Law Ruler dialer shift uploaded for your account yet.</strong>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Daily dialer logs are imported each morning by Team Leads. Once imported, your wrap-up pacing and busy time adherence will reflect here automatically.
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Standards: ≤90s avg wrap-up/call (≤120s for onboarding) &bull; 30m busy allowance (2.5h for narratives)
              </div>
            </div>
          ) : (
            <div>
              {/* If an exception was approved */}
              {efficiencyRecord.exception_status === 'APPROVED_EXCEPTION' && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(168,85,247,0.12)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    color: '#e9d5ff',
                    fontSize: 12,
                    marginBottom: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>🟣</span>
                  <div>
                    <strong>Shift Exception Approved:</strong> {efficiencyRecord.exception_reason || 'Documented & approved by Team Lead'}
                    {efficiencyRecord.exception_reviewed_by && ` (Reviewed by ${efficiencyRecord.exception_reviewed_by})`}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {/* Wrap-Up Velocity Card */}
                {(() => {
                  const targetSec = efficiencyRecord.is_onboarding_rep === 1 ? 120 : 90
                  const warningMaxSec = efficiencyRecord.is_onboarding_rep === 1 ? 150 : 120
                  const avgSec = Math.round(efficiencyRecord.avg_wrap_up_per_call_sec || 0)
                  const wrapPct = Math.min(Math.round((avgSec / targetSec) * 100), 100)

                  return (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${
                          efficiencyRecord.wrap_up_status === 'VIOLATION'
                            ? 'rgba(239,68,68,0.4)'
                            : efficiencyRecord.wrap_up_status === 'WARNING'
                            ? 'rgba(245,158,11,0.4)'
                            : efficiencyRecord.wrap_up_status === 'EXCUSED'
                            ? 'rgba(168,85,247,0.4)'
                            : 'rgba(16,185,129,0.3)'
                        }`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          Wrap-Up Pacing ({targetSec}s Target)
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background:
                              efficiencyRecord.wrap_up_status === 'VIOLATION'
                                ? 'rgba(239,68,68,0.2)'
                                : efficiencyRecord.wrap_up_status === 'WARNING'
                                ? 'rgba(245,158,11,0.2)'
                                : efficiencyRecord.wrap_up_status === 'EXCUSED'
                                ? 'rgba(168,85,247,0.2)'
                                : 'rgba(16,185,129,0.2)',
                            color:
                              efficiencyRecord.wrap_up_status === 'VIOLATION'
                                ? '#ef4444'
                                : efficiencyRecord.wrap_up_status === 'WARNING'
                                ? '#f59e0b'
                                : efficiencyRecord.wrap_up_status === 'EXCUSED'
                                ? '#c084fc'
                                : '#10b981',
                          }}
                        >
                          {efficiencyRecord.wrap_up_status === 'VIOLATION'
                            ? `🔴 Outlier (>${warningMaxSec}s)`
                            : efficiencyRecord.wrap_up_status === 'WARNING'
                            ? '🟡 Near Limit'
                            : efficiencyRecord.wrap_up_status === 'EXCUSED'
                            ? '🟣 Excused'
                            : '🟢 On Target'}
                        </span>
                      </div>

                      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                        {avgSec}s
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                          / call (Target: ≤{targetSec}s)
                        </span>
                      </div>

                      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', margin: '8px 0' }}>
                        <div
                          style={{
                            width: `${wrapPct}%`,
                            height: '100%',
                            background:
                              efficiencyRecord.wrap_up_status === 'VIOLATION'
                                ? '#ef4444'
                                : efficiencyRecord.wrap_up_status === 'WARNING'
                                ? '#f59e0b'
                                : '#10b981',
                            borderRadius: 3,
                          }}
                        />
                      </div>

                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Wrap-Up:</span>
                        <strong style={{ color: '#fff' }}>
                          {formatHms(efficiencyRecord.wrap_up_time_sec)}
                        </strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {efficiencyRecord.total_calls_handled} total calls handled
                        {efficiencyRecord.is_onboarding_rep === 1 && (
                          <span style={{ color: '#c084fc', marginLeft: 6 }}>&bull; 🌱 Trainee Grace (+30s)</span>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Busy Time Card */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${
                      efficiencyRecord.busy_status === 'VIOLATION'
                        ? 'rgba(239,68,68,0.4)'
                        : efficiencyRecord.busy_status === 'WARNING'
                        ? 'rgba(245,158,11,0.4)'
                        : efficiencyRecord.busy_status === 'EXCUSED'
                        ? 'rgba(168,85,247,0.4)'
                        : 'rgba(16,185,129,0.3)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Busy Time ({efficiencyRecord.is_narrative_rep ? '2.5h' : '30m'} Budget)
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background:
                          efficiencyRecord.busy_status === 'VIOLATION'
                            ? 'rgba(239,68,68,0.2)'
                            : efficiencyRecord.busy_status === 'WARNING'
                            ? 'rgba(245,158,11,0.2)'
                            : efficiencyRecord.busy_status === 'EXCUSED'
                            ? 'rgba(168,85,247,0.2)'
                            : 'rgba(16,185,129,0.2)',
                        color:
                          efficiencyRecord.busy_status === 'VIOLATION'
                            ? '#ef4444'
                            : efficiencyRecord.busy_status === 'WARNING'
                            ? '#f59e0b'
                            : efficiencyRecord.busy_status === 'EXCUSED'
                            ? '#c084fc'
                            : '#10b981',
                      }}
                    >
                      {efficiencyRecord.busy_status === 'VIOLATION'
                        ? '🔴 Over Limit'
                        : efficiencyRecord.busy_status === 'WARNING'
                        ? '🟡 Warning'
                        : efficiencyRecord.busy_status === 'EXCUSED'
                        ? '🟣 Excused'
                        : '🟢 Compliant'}
                    </span>
                  </div>

                  {(() => {
                    const baseSec = efficiencyRecord.is_narrative_rep ? 9000 : 1800
                    const totalAllowedSec = baseSec + (efficiencyRecord.meeting_credit_sec || 0)
                    const busyPct = Math.min(Math.round((efficiencyRecord.busy_time_sec / totalAllowedSec) * 100), 100)
                    return (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                          {formatHms(efficiencyRecord.busy_time_sec)}
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                            / {formatHms(totalAllowedSec)} allowed
                          </span>
                        </div>

                        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', margin: '8px 0' }}>
                          <div
                            style={{
                              width: `${busyPct}%`,
                              height: '100%',
                              background:
                                efficiencyRecord.busy_status === 'VIOLATION'
                                  ? '#ef4444'
                                  : efficiencyRecord.busy_status === 'WARNING'
                                  ? '#f59e0b'
                                  : '#10b981',
                              borderRadius: 3,
                            }}
                          />
                        </div>

                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Meeting Credits:</span>
                          <strong style={{ color: efficiencyRecord.meeting_credit_sec > 0 ? '#60a5fa' : 'var(--text-muted)' }}>
                            {efficiencyRecord.meeting_credit_sec > 0
                              ? `+${Math.round(efficiencyRecord.meeting_credit_sec / 60)}m (${efficiencyRecord.meeting_notes || 'Credited'})`
                              : 'None'}
                          </strong>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          Active pauses / breaks limit
                        </div>
                      </>
                    )
                  })()}
                </div>

                {/* Dialer Presence Breakdown */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      Total Presence Breakdown
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📞 Talk Time</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>
                          {formatHms(efficiencyRecord.total_talk_time_sec)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>🟢 Available Time</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>
                          {formatHms(efficiencyRecord.time_available_sec)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📲 Inbound Talk</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#a855f7' }}>
                          {formatHms(efficiencyRecord.inbound_talk_time_sec)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📤 Outbound Talk</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>
                          {formatHms(efficiencyRecord.outbound_talk_time_sec)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'var(--text-muted)' }}>
                    Calls made: {efficiencyRecord.calls_made} &bull; Received: {efficiencyRecord.calls_received} &bull; Missed: {efficiencyRecord.calls_missed}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Goal Progress Bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        {goalCards.map((g) => (
          <div key={g.label} className="glass-card fade-in" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{g.icon} {g.label}</span>
              <span style={{ fontSize: 12, color: progressColor(g.pct), fontWeight: 700 }}>
                {g.pct >= 100 ? '✓ Goal met!' : `${g.pct}%`}
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: progressColor(g.pct), marginBottom: 6 }}>
              {g.value}{g.unit}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Goal: {g.goal}{g.unit}
            </div>
            {/* Progress bar */}
            <div style={{
              height: 8, borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(g.pct, 100)}%`,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${progressColor(g.pct)}cc, ${progressColor(g.pct)})`,
                transition: 'width 0.8s cubic-bezier(0.25,0.46,0.45,0.94)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Personal KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${kpiCards.length}, 1fr)`,
        gap: 14,
        marginBottom: 16,
        overflowX: 'auto',
      }}>
        {kpiCards.map((c) => (
          <div key={c.label} className="glass-card fade-in" style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 120 }}>
            <div style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: '50%', background: `radial-gradient(circle, ${c.color}15 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <span style={{ fontSize: 18, display: 'block', marginBottom: 8 }}>{c.icon}</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color, lineHeight: 1, marginBottom: 4 }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Personal Signed Trend + CAPD chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="glass-card" style={{ padding: '20px 16px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            My {lob === 'SSD' ? 'Converted Cases' : 'Signed Retainers'} Trend
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lob === 'SSD' ? '#10b981' : '#3b82f6'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lob === 'SSD' ? '#10b981' : '#3b82f6'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,22,40,0.97)', border: '1px solid rgba(184, 33, 5, 0.3)', borderRadius: 10, fontSize: 13 }}
                labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
              />
              <Area type="monotone" dataKey={lob === 'SSD' ? 'converted' : 'signed'} stroke={lob === 'SSD' ? '#10b981' : '#3b82f6'} fill="url(#trendGrad)" strokeWidth={2} name={lob === 'SSD' ? 'Converted' : 'Signed'} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card" style={{ padding: '20px 16px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            My Daily CAPD
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,22,40,0.97)', border: '1px solid rgba(184, 33, 5, 0.3)', borderRadius: 10, fontSize: 13 }}
                labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
              />
              <Bar dataKey="capd" radius={[4, 4, 0, 0]} name="CAPD">
                {trendData.map((entry, i) => (
                  <Cell key={i} fill={entry.capd >= (g.goal_avg_capd || 40) ? '#10b981' : '#f59e0b'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Required Communications & Signed Policies Section */}
      <div className="glass-card" style={{ padding: '20px 24px', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📜</span>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#fff' }}>
                Required Communications & Signed Policies
              </h3>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Andes Workforce, LLC in coordination with Tabak Law, LLC
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setDocsSubTab('pending')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: docsSubTab === 'pending' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                color: docsSubTab === 'pending' ? '#f87171' : '#94a3b8',
                border: docsSubTab === 'pending' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              ⏳ Awaiting Signature ({pendingDocs.length})
            </button>
            <button
              type="button"
              onClick={() => setDocsSubTab('signed')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: docsSubTab === 'signed' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                color: docsSubTab === 'signed' ? '#34d399' : '#94a3b8',
                border: docsSubTab === 'signed' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              ✓ Signed History ({signedDocs.length})
            </button>
          </div>
        </div>

        {/* List of documents */}
        {docsSubTab === 'pending' ? (
          pendingDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
              🎉 All communications and operational policies are up to date!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingDocs.map((doc) => (
                <div
                  key={doc.ack_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>
                      {doc.category}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '2px 0' }}>
                      {doc.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Issued by {doc.created_by_name} · {doc.created_at?.slice(0, 10)}
                      {doc.deadline_date && <span style={{ color: '#f87171', marginLeft: 8 }}>Due: {doc.deadline_date}</span>}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedDocToSign(doc)}
                    className="btn-primary"
                    style={{
                      padding: '7px 16px',
                      fontSize: 12,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      border: 'none',
                    }}
                  >
                    ✍️ Review & Sign
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          signedDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
              No signed documents yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signedDocs.map((doc) => {
                const isVoided = doc.doc_status === 'VOIDED'
                return (
                  <div
                    key={doc.ack_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderRadius: 8,
                      background: isVoided ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                      border: isVoided ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.06)',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isVoided ? '#f87171' : '#34d399', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{isVoided ? '🚫 VOIDED (NULL & VOID)' : '✓ Signed & Verified'}</span>
                        <span style={{ color: '#64748b' }}>·</span>
                        <span style={{ color: '#94a3b8' }}>{doc.category}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '2px 0' }}>
                        {doc.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        Signed on {doc.signed_at?.replace('T', ' ').slice(0, 19)} UTC
                      </div>
                      {isVoided && (
                        <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4, fontStyle: 'italic' }}>
                          Revoked by {doc.voided_by_name || 'Management'} on {doc.voided_at?.slice(0, 10)}: "{doc.void_reason || 'Withdrawn'}"
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setSelectedDocToSign(doc)}
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '5px 12px' }}
                      >
                        👁️ View Document
                      </button>
                      <button
                        onClick={() => {
                          downloadSignedDocumentPdf(
                            {
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
                              status: doc.doc_status,
                              void_reason: doc.void_reason,
                              voided_at: doc.voided_at,
                              voided_by_name: doc.voided_by_name,
                            },
                            {
                              id: doc.ack_id,
                              username: agentName,
                              user_display_name: doc.signature_text || agentName,
                              user_lob: lob,
                              status: 'SIGNED',
                              signature_text: doc.signature_text,
                              signed_at: doc.signed_at,
                              ip_address: doc.ip_address,
                            }
                          )
                        }}
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '5px 12px', color: isVoided ? '#f87171' : '#60a5fa', borderColor: isVoided ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.3)' }}
                      >
                        📥 Download PDF
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Sign Document Modal */}
      {selectedDocToSign && (
        <SignDocumentModal
          isOpen={!!selectedDocToSign}
          document={selectedDocToSign}
          onClose={() => setSelectedDocToSign(null)}
          onSignedSuccess={() => {
            fetchSpecialistDocuments()
          }}
        />
      )}
    </div>
  )
}
