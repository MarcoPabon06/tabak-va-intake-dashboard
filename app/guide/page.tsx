'use client'

import { useState } from 'react'
import Navigation from '@/components/Navigation'
import { useSession } from 'next-auth/react'

export default function UserGuidePage() {
  const { data: session } = useSession()
  const userLob = (session?.user as any)?.lob || 'VA'
  const userRole = (session?.user as any)?.role || 'regular'

  const [activeTab, setActiveTab] = useState<'overview' | 'dashboard' | 'qa' | 'coaching' | 'timeoff' | 'faq'>('overview')

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />

      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 1100 }}>
          
          {/* Header */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 24 }}>🎓</span>
                <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                  Intake Representative Onboarding Guide
                </h1>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Welcome to Tabak Law! Use this interactive guide to master navigating your performance, QA scorecards, coaching, and time off.
              </p>
            </div>

            <div className="badge badge-primary" style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Assigned Team:</span>
              <strong style={{ color: '#fff' }}>{userLob} Intake Division</strong>
            </div>
          </div>

          {/* Interactive Guide Tabs */}
          <div className="glass-card" style={{ padding: '8px 12px', display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { id: 'overview', label: 'Overview & Login', icon: '🚀' },
              { id: 'dashboard', label: 'Personal Dashboard', icon: '📊' },
              { id: 'qa', label: 'QA Scores & Disputes', icon: '📋' },
              { id: 'coaching', label: 'Coaching & PIP', icon: '🎯' },
              { id: 'timeoff', label: 'Time Off & Coverage', icon: '📅' },
              { id: 'faq', label: 'FAQ & Quick Tips', icon: '❓' }
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn-secondary ${activeTab === tab.id ? 'btn-primary' : ''}`}
                style={{ 
                  background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
                  border: 'none',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: activeTab === tab.id ? '0 4px 12px rgba(184, 33, 5, 0.2)' : 'none'
                }}
                onClick={() => setActiveTab(tab.id as any)}
              >
                <span style={{ marginRight: 6 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW & LOGIN */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🏛️</span> Welcome to Tabak Law Intake
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  As an Intake Representative at Tabak Law, you are the first point of contact for individuals seeking legal representation. 
                  Our operations are organized into two primary divisions:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(184, 33, 5, 0.05)', border: '1px solid rgba(184, 33, 5, 0.2)', borderRadius: 12 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#b82105', marginBottom: 6 }}>🇺🇸 VA Intake Specialists</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Assist military veterans in securing VA Disability benefits. Key success metrics include <strong>Signed Retainers</strong> and <strong>Signed Success Rate %</strong>.
                    </p>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(2, 132, 199, 0.05)', border: '1px solid rgba(2, 132, 199, 0.2)', borderRadius: 12 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>🛡️ SSD Intake Specialists</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Assist individuals applying for Social Security Disability benefits. Key success metrics include <strong>Converted Cases</strong> and <strong>Conversion Rate %</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>🔐 Log In & Password Management</h2>
                <ol style={{ paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
                  <li>Log in using your assigned Tabak Law firm email address and temporary password.</li>
                  <li>Click <strong>Settings</strong> in the left sidebar menu to update your temporary password to a secure personal password.</li>
                  <li>Verify that your displayed Line of Business (LOB) matches your assigned team (<strong>VA</strong> or <strong>SSD</strong>).</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: DASHBOARD & METRICS */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>📊 Navigating Your Personal Dashboard</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Your personal dashboard (`/dashboard`) is your command center. It tracks your stats in real-time against monthly targets.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>1. Retainers / Converted</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#b82105', margin: '4px 0' }}>28 / 35 Target</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Track total successfully onboarded clients.</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>2. Conversion Rate %</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', margin: '4px 0' }}>68% Avg</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Percentage of calls resulting in signed clients.</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>3. Calls Per Day (CAPD)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', margin: '4px 0' }}>42 Calls/Day</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Average daily call volume on present days.</div>
                  </div>
                </div>

                <div style={{ padding: 16, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>🔥 Consistency Streaks & Leaderboard</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Maintain a high CAPD and conversion rate to build active daily streaks and climb your division&apos;s leaderboard!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: QA SCORES & DISPUTES */}
          {activeTab === 'qa' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>📋 Quality Assurance (QA) & Call Scorecards</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  QA Managers regularly review recorded intake calls to ensure policy compliance and client satisfaction. Access your scorecards under **QA Scores** (`/qa`).
                </p>

                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Evaluation Categories:</h3>
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                  <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: 10, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Category</th>
                        <th style={{ padding: 10, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 10, fontSize: 13, fontWeight: 600 }}>Professional Introduction</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Warm greeting, identifying firm & setting expectations.</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 10, fontSize: 13, fontWeight: 600 }}>PK & Application Policies</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Accurately detailing disability program rules and benefits.</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 10, fontSize: 13, fontWeight: 600 }}>Eligibility Verification</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Asking qualifying health, employment, and military discharge questions.</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 10, fontSize: 13, fontWeight: 600 }}>Deadline Compliance</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Explaining filing deadlines and timely submission requirements.</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 10, fontSize: 13, fontWeight: 600 }}>Documentation Review</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Guiding client through e-signatures and medical releases.</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 10, fontSize: 13, fontWeight: 600 }}>Objection Handling</td>
                        <td style={{ padding: 10, fontSize: 13, color: 'var(--text-secondary)' }}>Addressing client hesitations with empathy and legal clarity.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>✅ Acknowledge Scorecard</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                      If you agree with the manager evaluation, click <strong>Acknowledge</strong> to log your review.
                    </p>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>⚖️ Submit a Dispute</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                      If you believe a score requires manager re-auditing, click <strong>Dispute</strong>, provide your explanation, and your manager will re-review.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COACHING & PIP */}
          {activeTab === 'coaching' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>🎯 Coaching & Performance Improvement Plans</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Tabak Law supports ongoing professional development. The **Coaching Logs** tab (`/coaching`) lets you request coaching and manage action plans.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🙋‍♂️ Requesting a 1-on-1 Coaching Session</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      Click <strong>Request Coaching</strong> if you want practice on objection handling, script adjustments, or policy guidance. Your lead will schedule a session.
                    </p>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📁 Uploading PIP Evidence Artifacts</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      If assigned a Performance Improvement Plan (PIP), upload weekly progress files or checklist evidence directly under your action item card.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TIME OFF & COVERAGE */}
          {activeTab === 'timeoff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>📅 Time Off & Coverage Planner</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Manage your leaves seamlessly while maintaining team coverage for your division under **Time Off** (`/time-off`).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📅 Coverage Calendar View</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Click the <strong>Coverage Calendar ({userLob})</strong> tab to see daily staffing safety levels:
                      <br />🟢 Safe (&ge; 80%) &nbsp;|&nbsp; 🟡 Caution (60%-79%) &nbsp;|&nbsp; 🔴 Shortage (&lt; 60%)
                    </p>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>✏️ Modify & ❌ Cancel Requests</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Use <strong>✏️ Edit Request</strong> or <strong>❌ Cancel Request</strong> on upcoming leaves. 
                      Canceled leaves update your status to `Cancelled` in your history log and restore coverage count on the calendar.
                    </p>
                  </div>
                </div>

                <div style={{ padding: 14, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 10, fontSize: 13, color: '#fbbf24' }}>
                  ⚠️ <strong>Past Request Rule:</strong> Requests that have already occurred in the past cannot be edited or canceled. Only upcoming or current leaves can be modified or canceled.
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: FAQ & QUICK TIPS */}
          {activeTab === 'faq' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>❓ Frequently Asked Questions</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Q: How do I know if my time off request was approved?</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      You will receive a real-time notification in the bell icon (🔔) at the top of your screen, and the badge in your Request History will update to green `Approved`.
                    </p>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Q: What happens if I edit the dates of an approved time off request?</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      Modifying the start or end dates of an approved request resets its status back to `Pending` so management can verify coverage for the new dates.
                    </p>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Q: Where do I view manager call recording feedback?</h4>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      Navigate to <strong>QA Scores</strong> (`/qa`), click your scorecard, and listen to audio links or read manager feedback notes directly under each evaluation category.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
