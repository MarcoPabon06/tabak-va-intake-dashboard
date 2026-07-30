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

const VA_GOAL_FIELDS: GoalConfig[] = [
  {
    key: 'goal_signed_retainers_va',
    label: 'Monthly Signed Retainers (VA)',
    icon: '✅',
    unit: 'retainers',
    description: 'Target signed retainers per VA agent per month',
    min: 1,
    max: 200,
  },
  {
    key: 'goal_conversion_rate_va',
    label: 'Conversion Rate (VA)',
    icon: '📈',
    unit: '%',
    description: 'Target conversion rate for VA team (Signed ÷ Total Cases)',
    min: 1,
    max: 100,
  },
  {
    key: 'goal_avg_capd_va',
    label: 'Average CAPD (VA)',
    icon: '📞',
    unit: 'calls/day',
    description: 'Target average Calls Attempted Per Day for VA team',
    min: 1,
    max: 200,
  },
]

const SSD_GOAL_FIELDS: GoalConfig[] = [
  {
    key: 'goal_converted_cases_ssd',
    label: 'Monthly Converted Cases (SSD)',
    icon: '💼',
    unit: 'cases',
    description: 'Target converted cases per SSD agent per month',
    min: 1,
    max: 200,
  },
  {
    key: 'goal_conversion_rate_ssd',
    label: 'Conversion Rate (SSD)',
    icon: '📈',
    unit: '%',
    description: 'Target conversion rate for SSD team (Converted ÷ Signed)',
    min: 1,
    max: 100,
  },
  {
    key: 'goal_avg_capd_ssd',
    label: 'Average CAPD (SSD)',
    icon: '📞',
    unit: 'calls/day',
    description: 'Target average Calls Attempted Per Day for SSD team',
    min: 1,
    max: 200,
  },
]

const APPS_GOAL_FIELDS: GoalConfig[] = [
  {
    key: 'goal_apps_filed_apps',
    label: 'Monthly Applications Filed (Apps)',
    icon: '📝',
    unit: 'apps',
    description: 'Target completed SSA applications per Apps agent per month',
    min: 1,
    max: 200,
  },
  {
    key: 'goal_conversion_rate_apps',
    label: 'Conversion Rate (Apps)',
    icon: '📈',
    unit: '%',
    description: 'Target conversion rate for Apps team (Converted ÷ Total Apps)',
    min: 1,
    max: 100,
  },
  {
    key: 'goal_converted_cases_apps',
    label: 'Monthly Converted Cases (Apps)',
    icon: '✅',
    unit: 'cases',
    description: 'Target converted cases per Apps agent per month',
    min: 1,
    max: 200,
  },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [testWebhookResult, setTestWebhookResult] = useState<{ success?: boolean; message?: string } | null>(null)
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

  async function handleTestWebhook() {
    setTestingWebhook(true)
    setTestWebhookResult(null)
    try {
      // First save current settings
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const res = await fetch('/api/test-webhook', { method: 'POST' })
      const json = await res.json()
      if (!json.success) {
        setTestWebhookResult({ success: false, message: json.error || 'Failed to trigger test webhook' })
      } else {
        setTestWebhookResult({ success: true, message: 'Power Automate Webhook executed successfully! Check your M365 Outlook inbox.' })
      }
    } catch (err: any) {
      setTestWebhookResult({ success: false, message: err.message })
    } finally {
      setTestingWebhook(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 950 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Configure separate monthly targets for your VA and SSD intake teams. These goals determine the progress bars and streaks displayed on each specialist's personal dashboard.
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
              <span style={{ width: 20, height: 20, border: '2px solid rgba(184, 33, 5, 0.3)', borderTopColor: '#b82105', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              Loading settings…
            </div>
          ) : (
            <>
              {/* Dual LOB settings grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 20 }}>
                
                {/* VA Team Goals Card */}
                <div className="glass-card" style={{ padding: '24px 28px', borderColor: 'rgba(184, 33, 5, 0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 20 }}>🇺🇸</span>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 700 }}>VA Intake Goals</h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target settings for the Veterans Benefits LOB</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {VA_GOAL_FIELDS.map((field) => {
                      const defVal = field.key === 'goal_signed_retainers_va' ? '35' : field.key === 'goal_conversion_rate_va' ? '65' : '40'
                      const val = settings[field.key] ?? defVal
                      const numVal = parseInt(val) || 0
                      return (
                        <div key={field.key}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 16 }}>{field.icon}</span>
                            <label className="field-label" style={{ marginBottom: 0 }}>{field.label}</label>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 24 }}>{field.description}</p>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 24 }}>
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
                                background: `linear-gradient(to right, #b82105 0%, #b82105 ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) 100%)`,
                                borderRadius: 4,
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            />
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

                {/* SSD Team Goals Card */}
                <div className="glass-card" style={{ padding: '24px 28px', borderColor: 'rgba(236,72,153,0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 20 }}>💼</span>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 700 }}>SSD Intake Goals</h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target settings for the Disability LOB</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {SSD_GOAL_FIELDS.map((field) => {
                      const defVal = field.key === 'goal_converted_cases_ssd' ? '35' : field.key === 'goal_conversion_rate_ssd' ? '65' : '40'
                      const val = settings[field.key] ?? defVal
                      const numVal = parseInt(val) || 0
                      return (
                        <div key={field.key}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 16 }}>{field.icon}</span>
                            <label className="field-label" style={{ marginBottom: 0 }}>{field.label}</label>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 24 }}>{field.description}</p>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 24 }}>
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
                                background: `linear-gradient(to right, #ec4899 0%, #ec4899 ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) 100%)`,
                                borderRadius: 4,
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            />
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

                {/* Apps Team Goals Card */}
                <div className="glass-card" style={{ padding: '24px 28px', borderColor: 'rgba(16,185,129,0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 20 }}>📲</span>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 700 }}>Apps Team Goals</h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target settings for the SSA Applications Filing LOB</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {APPS_GOAL_FIELDS.map((field) => {
                      const defVal = field.key === 'goal_apps_filed_apps' ? '30' : field.key === 'goal_conversion_rate_apps' ? '75' : '20'
                      const val = settings[field.key] ?? defVal
                      const numVal = parseInt(val) || 0
                      return (
                        <div key={field.key}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 16 }}>{field.icon}</span>
                            <label className="field-label" style={{ marginBottom: 0 }}>{field.label}</label>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 24 }}>{field.description}</p>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 24 }}>
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
                                background: `linear-gradient(to right, #10b981 0%, #10b981 ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) ${((numVal - field.min) / (field.max - field.min)) * 100}%, rgba(255,255,255,0.08) 100%)`,
                                borderRadius: 4,
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            />
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

              </div>

              {/* Preview Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 20 }}>
                
                {/* VA Preview */}
                <div className="glass-card" style={{ padding: '18px 24px' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
                    Preview — VA Agent dashboard view
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {VA_GOAL_FIELDS.map((field) => {
                      const def = field.key === 'goal_signed_retainers_va' ? 35 : field.key === 'goal_conversion_rate_va' ? 65 : 40
                      const goal = parseInt(settings[field.key] || String(def))
                      const previewValue = Math.round(goal * 0.6)
                      return (
                        <div key={field.key} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{field.label.split(' ')[0]}</span>
                            <span style={{ fontSize: 10, color: '#b82105', fontWeight: 700 }}>60%</span>
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#b82105', marginBottom: 2 }}>
                            {previewValue}{field.unit === '%' ? '%' : ''}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>Goal: {goal}</div>
                          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '60%', background: '#b82105' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* SSD Preview */}
                <div className="glass-card" style={{ padding: '18px 24px' }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
                    Preview — SSD Agent dashboard view
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {SSD_GOAL_FIELDS.map((field) => {
                      const def = field.key === 'goal_converted_cases_ssd' ? 35 : field.key === 'goal_conversion_rate_ssd' ? 65 : 40
                      const goal = parseInt(settings[field.key] || String(def))
                      const previewValue = Math.round(goal * 0.6)
                      return (
                        <div key={field.key} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{field.label.split(' ')[0]}</span>
                            <span style={{ fontSize: 10, color: '#ec4899', fontWeight: 700 }}>60%</span>
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#ec4899', marginBottom: 2 }}>
                            {previewValue}{field.unit === '%' ? '%' : ''}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>Goal: {goal}</div>
                          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '60%', background: '#ec4899' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>

              {/* Section 4: Microsoft 365 Power Automate Webhook (Option 2) */}
              <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 24, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 24 }}>⚡</span>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#3b82f6' }}>Microsoft 365 Power Automate Webhook (Internal M365 Email)</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Sends instant notifications directly through your Microsoft 365 work account via Power Automate. 100% internal M365 email delivery with 0% spam filtering!
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="field-label">Power Automate HTTP POST Webhook URL</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. https://prod-123.westus.logic.azure.com:443/workflows/..."
                      value={settings.power_automate_webhook_url || ''}
                      onChange={(e) => updateSetting('power_automate_webhook_url', e.target.value)}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Copy your HTTP POST URL from your Power Automate flow at <a href="https://make.powerautomate.com" target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>make.powerautomate.com</a>.
                    </div>
                  </div>

                  {testWebhookResult && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        background: testWebhookResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        border: testWebhookResult.success ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
                        color: testWebhookResult.success ? '#10b981' : '#ef4444',
                      }}
                    >
                      {testWebhookResult.success ? '✅ ' : '❌ '} {testWebhookResult.message}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '10px 20px', fontSize: 14, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                  onClick={handleTestWebhook}
                  disabled={testingWebhook || saving}
                >
                  {testingWebhook ? 'Testing Webhook…' : '🧪 Send Test Webhook'}
                </button>
                <button
                  id="btn-save-settings"
                  className="btn-primary"
                  style={{ padding: '10px 24px', fontSize: 14 }}
                  onClick={handleSave}
                  disabled={saving || testingWebhook}
                >
                  {saving ? 'Saving…' : 'Save Target Settings & Webhook Config'}
                </button>
              </div>
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
          background: #b82105;
          cursor: pointer;
          border: 2px solid #f8fafc;
          box-shadow: 0 2px 6px rgba(184, 33, 5, 0.4);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #b82105;
          cursor: pointer;
          border: 2px solid #f8fafc;
          box-shadow: 0 2px 6px rgba(184, 33, 5, 0.4);
        }
      `}</style>
    </div>
  )
}
