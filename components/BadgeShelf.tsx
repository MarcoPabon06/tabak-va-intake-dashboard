'use client'

import { useState } from 'react'
import { Badge } from '@/lib/badges'

interface Props {
  badges: Badge[]
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  milestone:  { label: 'Signing Milestones', color: '#f59e0b' },
  streak:     { label: 'Streak & Consistency', color: '#ef4444' },
  conversion: { label: 'Conversion Rate', color: '#6366f1' },
  mvp:        { label: 'Monthly MVP', color: '#10b981' },
}

export default function BadgeShelf({ badges }: Props) {
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null)

  const earnedCount = badges.filter((b) => b.earned).length
  const totalCount = badges.length

  // Group by category
  const categories = ['milestone', 'streak', 'conversion', 'mvp'] as const
  const grouped = categories.map((cat) => ({
    ...CATEGORY_LABELS[cat],
    key: cat,
    badges: badges.filter((b) => b.category === cat),
  }))

  return (
    <div className="glass-card fade-in" style={{ padding: '20px 24px', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Achievements
          </h3>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: earnedCount === totalCount ? '#10b981' : '#6366f1',
          background: earnedCount === totalCount ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
          padding: '3px 10px', borderRadius: 8,
        }}>
          {earnedCount}/{totalCount} unlocked
        </span>
      </div>

      {/* Badge rows by category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map((group) => (
          <div key={group.key}>
            <div style={{ fontSize: 11, fontWeight: 600, color: group.color, marginBottom: 8, letterSpacing: '0.03em' }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.badges.map((badge) => {
                const isHovered = hoveredBadge === badge.id
                return (
                  <div
                    key={badge.id}
                    onMouseEnter={() => setHoveredBadge(badge.id)}
                    onMouseLeave={() => setHoveredBadge(null)}
                    style={{
                      position: 'relative',
                      width: 56, height: 56,
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: badge.earned
                        ? isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'
                        : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${badge.earned ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                      filter: badge.earned ? 'none' : 'grayscale(1) opacity(0.35)',
                      transform: isHovered ? 'translateY(-3px) scale(1.08)' : 'none',
                      boxShadow: badge.earned && isHovered
                        ? '0 8px 20px rgba(99,102,241,0.25)'
                        : 'none',
                    }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1 }}>{badge.icon}</span>

                    {/* Tooltip */}
                    {isHovered && (
                      <div style={{
                        position: 'absolute',
                        bottom: '110%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(10,22,40,0.97)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        whiteSpace: 'nowrap',
                        zIndex: 100,
                        pointerEvents: 'none',
                        minWidth: 180,
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc', marginBottom: 4 }}>
                          {badge.icon} {badge.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                          {badge.description}
                        </div>
                        {badge.earned ? (
                          <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                            ✓ Earned {badge.earnedDate ? new Date(badge.earnedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11 }}>
                            {badge.progressLabel && (
                              <div style={{ color: '#f59e0b', fontWeight: 600, marginBottom: 3 }}>
                                {badge.progressLabel}
                              </div>
                            )}
                            {badge.progress !== undefined && (
                              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 4 }}>
                                <div style={{
                                  height: '100%',
                                  width: `${badge.progress}%`,
                                  borderRadius: 2,
                                  background: '#f59e0b',
                                }} />
                              </div>
                            )}
                          </div>
                        )}
                        {/* Arrow */}
                        <div style={{
                          position: 'absolute',
                          bottom: -6,
                          left: '50%',
                          transform: 'translateX(-50%) rotate(45deg)',
                          width: 10, height: 10,
                          background: 'rgba(10,22,40,0.97)',
                          borderRight: '1px solid rgba(99,102,241,0.3)',
                          borderBottom: '1px solid rgba(99,102,241,0.3)',
                        }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
