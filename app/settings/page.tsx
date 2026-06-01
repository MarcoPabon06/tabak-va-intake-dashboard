'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'

interface GoalConfig {
  key: string
  label: string
  icon: string
  unit: string
  description: string
  min: number
  max: number
}

const GOAL_FIELDS: GoalConfig[] = [
  {
    key: 'goal_signed_retainers',
    label: 'Monthly Signed Retainers',
    icon: '✅',
    unit: 'retainers',
    description: 'Target number of signed retainers per agent per month',
    min: 1,
    max: 200,
  },
  {
    key: 'goal_conversion_rate',
    label: 'Conversion Rate',
    icon: '📈',
    unit: '%',
    description: 'Target conversion rate (Signed ÷ Total Cases)',
    min: 1,
    max: 100,
  },
  {
    key: 'goal_avg_capd',
    label: 'Average CAPD',
    icon: '📞',
    unit: 'calls/day',
    description: 'Target average Calls Attempted Per Day',
    min: 1,
    max: 200,
  },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        setSettings(json)
      } catch {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function updateSetting(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 700 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Configure monthly goals and targets for your team. These targets power the goal progress bars on each agent's personal dashboard.
            </p>
          </div>

          {/* Feedback */}
          {success && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#10b981', fontSize: 14, fontWeight: 600 }}>
              ✅ Settings saved successfully! Changes are live immediately.
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 14 }}>
              ❌ {error}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: 'var(--text-secondary)' }}>
              <span style={{ width: 20, height: 20, border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              Loading settings…
            </div>
          ) : (
            <>
              {/* Goal settings */}
              <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 20, borderColor: 'rgba(99,102,241,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: 20 }}>🎯</span>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700 }}>Monthly Goal Targets</h2>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>These appear as progress bars on each agent's personal dashboard</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {GOAL_FIELDS.map((field) => {
                    const val = settings[field.key] || '0'
                    const numVal = parseInt(val) || 0
                    return (
                      <div key={field.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>{field.icon}</span>
                          <label className="field-label" style={{ marginBottom: 0 }}>{field.label}</label>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 24 }}>{field.description}</p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 24 }}>
                          {/* Slider */}
                          <input
                            id={`setting-${field.key}`}
                            type="range"
                            min={field.min}
                            max={field.max}
                            value={numVal}
                            onChange={(e) => updateSetting(field.key, e.target.value)}
                            style={{
                              flex: 1,
                              height: 6,
                              appearance: 'none',
                              background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) 100%)`,
                              borderRadius: 4,
                              outline: 'none',
                              cursor: 'pointer',
                            }}
                          />
                          {/* Number input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              className="input-field"
                              min={field.min}
                              max={field.max}
                              value={val}
                              onChange={(e) => updateSetting(field.key, e.target.value)}
                              style={{ width: 80, textAlign: 'center', fontWeight: 700, fontSize: 16 }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 60 }}>{field.unit}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Preview */}
              <div className="glass-card" style={{ padding: '18px 24px', marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
                  Preview — How agents will see their goals
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {GOAL_FIELDS.map((field) => {
                    const goal = parseInt(settings[field.key] || '0')
                    // Simulate 60% progress for preview
                    const previewValue = Math.round(goal * 0.6)
                    const pct = 60
                    return (
                      <div key={field.key} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{field.icon} {field.label}</span>
                          <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>
                          {previewValue}{field.unit === '%' ? '%' : ''}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Goal: {goal}{field.unit === '%' ? '%' : ''}</div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: '60%', borderRadius: 3, background: 'linear-gradient(90deg, #f59e0bcc, #f59e0b)', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Save */}
              <button
                id="btn-save-settings"
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '13px 28px', fontSize: 15, width: '100%' }}
              >
                {saving ? 'Saving…' : '💾 Save Settings'}
              </button>
            </>
          )}
        </div>
      </main>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
          border: 2px solid #f8fafc;
          box-shadow: 0 2px 6px rgba(99,102,241,0.4);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
          border: 2px solid #f8fafc;
          box-shadow: 0 2px 6px rgba(99,102,241,0.4);
        }
      `}</style>
    </div>
  )
}
