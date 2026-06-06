'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

interface Evaluation {
  id: number
  agent_name: string
  eval_date: string
  overall_score: number
  tier: string
  feedback: string | null
}

interface Props {
  agentName: string
}

function tierColor(tier: string) {
  if (tier === 'Top Performer') return '#10b981'
  if (tier === 'Strong Performer') return '#6366f1'
  if (tier === 'Developing Performer') return '#f59e0b'
  if (tier === 'Performance Risk') return '#ef4444'
  return '#dc2626'
}

export default function PersonalQA({ agentName }: Props) {
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!agentName) return
    fetch(`/api/qa?agent=${encodeURIComponent(agentName)}`)
      .then((r) => r.json())
      .then((data) => {
        setEvals(Array.isArray(data) ? data : [])
      })
      .catch(() => setEvals([]))
      .finally(() => setLoading(false))
  }, [agentName])

  if (loading) return null

  if (evals.length === 0) {
    return (
      <div className="glass-card fade-in" style={{ padding: '20px 24px', marginBottom: 16, textAlign: 'center' }}>
        <span style={{ fontSize: 28 }}>📋</span>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0 0' }}>
          No QA evaluations yet.
        </p>
      </div>
    )
  }

  const avgScore = Math.round(evals.reduce((s, e) => s + e.overall_score, 0) / evals.length * 10) / 10
  const latestTier = evals[0]?.tier || ''
  const latestFeedback = evals[0]?.feedback || ''

  // Chart data — last 10 evals in chronological order
  const chartData = [...evals]
    .slice(0, 10)
    .reverse()
    .map((e) => ({ date: e.eval_date.slice(5), score: e.overall_score }))

  return (
    <div className="glass-card fade-in" style={{ padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>📋</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          QA Score
        </h3>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {/* Left: Score + Tier */}
        <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 120 }}>
          <div style={{ fontSize: 38, fontWeight: 800, color: tierColor(latestTier) }}>
            {avgScore}%
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: tierColor(latestTier),
            background: `${tierColor(latestTier)}20`, padding: '3px 10px',
            borderRadius: 6, display: 'inline-block', marginTop: 4,
          }}>
            {latestTier}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {evals.length} evaluation{evals.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Right: Mini Trend Chart */}
        <div style={{ flex: 1, height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="qaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tierColor(latestTier)} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={tierColor(latestTier)} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{ background: 'rgba(10,22,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: any) => [`${v}%`, 'Score']}
              />
              <Area type="monotone" dataKey="score" stroke={tierColor(latestTier)} fill="url(#qaGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latest Feedback */}
      {latestFeedback && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${tierColor(latestTier)}` }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Latest Feedback</div>
          <div style={{
            fontSize: 12, color: '#cbd5e1', lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
          }}>
            {latestFeedback}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'right', marginTop: 10 }}>
        <Link href="/qa" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
          View all QA scores →
        </Link>
      </div>
    </div>
  )
}
