'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'

interface UserPermissions {
  allowedLobs: ('VA' | 'SSD' | 'APPS')[]
  canManageDailyEntry: boolean
  canCopyEOD: boolean
  canViewQA: boolean
  canPerformQA: boolean
  canManageCoaching: boolean
  canViewTimeOff: boolean
  canApproveTimeOff: boolean
  canManageUsers: boolean
  canChangeSettings: boolean
}

interface User {
  id: number
  username: string
  display_name: string
  email?: string | null
  role: string
  active: number
  lob?: string
  permissions?: string | null
  created_at: string
}

const DEFAULT_QA_PERMISSIONS: UserPermissions = {
  allowedLobs: ['VA', 'SSD', 'APPS'],
  canManageDailyEntry: false,
  canCopyEOD: true,
  canViewQA: true,
  canPerformQA: true,
  canManageCoaching: true,
  canViewTimeOff: true,
  canApproveTimeOff: false,
  canManageUsers: false,
  canChangeSettings: false,
}

const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  allowedLobs: ['VA', 'SSD'],
  canManageDailyEntry: true,
  canCopyEOD: true,
  canViewQA: true,
  canPerformQA: true,
  canManageCoaching: true,
  canViewTimeOff: true,
  canApproveTimeOff: true,
  canManageUsers: false,
  canChangeSettings: false,
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    display_name: '',
    role: 'regular',
    lob: 'VA',
    permissions: DEFAULT_ADMIN_PERMISSIONS,
  })

  const [editPermsUser, setEditPermsUser] = useState<{ id: number; username: string; role: string; perms: UserPermissions } | null>(null)
  const [resetPwd, setResetPwd] = useState<{ id: number; pwd: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function fetchUsers() {
    setLoading(true)
    const res = await fetch('/api/users')
    const json = await res.json()
    if (Array.isArray(json)) {
      setUsers(json)
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  function showMsg(type: 'success' | 'error', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  function parsePerms(permStr?: string | null, role?: string): UserPermissions {
    if (role === 'master' || role === 'superadmin') {
      return {
        allowedLobs: ['VA', 'SSD', 'APPS'],
        canManageDailyEntry: true,
        canCopyEOD: true,
        canViewQA: true,
        canPerformQA: true,
        canManageCoaching: true,
        canViewTimeOff: true,
        canApproveTimeOff: true,
        canManageUsers: true,
        canChangeSettings: true,
      }
    }
    if (role === 'qa') {
      return DEFAULT_QA_PERMISSIONS
    }
    if (permStr) {
      try {
        const p = JSON.parse(permStr)
        return {
          allowedLobs: Array.isArray(p.allowedLobs) ? p.allowedLobs : ['VA'],
          canManageDailyEntry: Boolean(p.canManageDailyEntry),
          canCopyEOD: Boolean(p.canCopyEOD),
          canViewQA: Boolean(p.canViewQA),
          canPerformQA: Boolean(p.canPerformQA),
          canManageCoaching: Boolean(p.canManageCoaching),
          canViewTimeOff: Boolean(p.canViewTimeOff),
          canApproveTimeOff: Boolean(p.canApproveTimeOff),
          canManageUsers: Boolean(p.canManageUsers),
          canChangeSettings: Boolean(p.canChangeSettings),
        }
      } catch {}
    }
    return DEFAULT_ADMIN_PERMISSIONS
  }

  async function createUser() {
    if (!newUser.username || !newUser.password) return
    setSaving(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newUser,
        permissions: newUser.role === 'admin' ? newUser.permissions : null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      showMsg('success', `User "${newUser.username}" created successfully.`)
      setNewUser({ username: '', email: '', password: '', display_name: '', role: 'regular', lob: 'VA', permissions: DEFAULT_ADMIN_PERMISSIONS })
      setShowAdd(false)
      fetchUsers()
    } else {
      showMsg('error', json.error || 'Failed to create user.')
    }
  }

  async function toggleActive(user: User) {
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, active: user.active === 0 }),
    })
    fetchUsers()
  }

  async function updateRole(userId: number, role: string) {
    const user = users.find(u => u.id === userId)
    const perms = user ? parsePerms(user.permissions, role) : DEFAULT_ADMIN_PERMISSIONS

    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: userId,
        role,
        permissions: role === 'admin' ? perms : null,
      }),
    })
    if (res.ok) {
      showMsg('success', 'User role updated successfully.')
      fetchUsers()
    } else {
      showMsg('error', 'Failed to update user role.')
    }
  }

  async function updateLob(userId: number, lob: string) {
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, lob }),
    })
    if (res.ok) {
      showMsg('success', 'LOB updated successfully.')
      fetchUsers()
    } else {
      const json = await res.json().catch(() => ({}))
      showMsg('error', json.error || 'Failed to update LOB.')
    }
  }

  async function updateEmail(userId: number, email: string) {
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, email }),
    })
    if (res.ok) {
      showMsg('success', 'Work Email updated successfully.')
      fetchUsers()
    } else {
      showMsg('error', 'Failed to update Work Email.')
    }
  }

  async function savePermissions() {
    if (!editPermsUser) return
    setSaving(true)
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editPermsUser.id,
        permissions: editPermsUser.perms,
      }),
    })
    setSaving(false)
    if (res.ok) {
      showMsg('success', `Permissions updated for ${editPermsUser.username}.`)
      setEditPermsUser(null)
      fetchUsers()
    } else {
      showMsg('error', 'Failed to update permissions.')
    }
  }

  async function doResetPassword() {
    if (!resetPwd?.pwd) return
    setSaving(true)
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: resetPwd.id, password: resetPwd.pwd }),
    })
    setSaving(false)
    if (res.ok) {
      showMsg('success', 'Password updated.')
      setResetPwd(null)
    } else {
      showMsg('error', 'Failed to update password.')
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, padding: '32px 28px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 1000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>User Management & Role Permissions</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Assign Super Admin, Admin (Team Lead), and Regular Specialist roles with granular LOB & feature access</p>
            </div>
            <button id="btn-add-user" className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
              + Add User
            </button>
          </div>

          {/* Feedback */}
          {msg && (
            <div style={{
              background: msg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${msg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              color: msg.type === 'success' ? '#10b981' : '#ef4444',
              fontSize: 14, fontWeight: 600,
            }}>
              {msg.type === 'success' ? '✅' : '❌'} {msg.text}
            </div>
          )}

          {/* Add user form */}
          {showAdd && (
            <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 24, border: '1px solid var(--accent-color)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>New User Registration</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label className="field-label">Username</label>
                  <input id="new-username" type="text" className="input-field" placeholder="e.g. dcastillo" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Display Name</label>
                  <input id="new-displayname" type="text" className="input-field" placeholder="e.g. Daniel Castillo" value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Work Email Address</label>
                  <input id="new-email" type="email" className="input-field" placeholder="e.g. dcastillo@tabakattorneys.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Password</label>
                  <input id="new-password" type="password" className="input-field" placeholder="Temporary password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Role</label>
                  <select id="new-role" className="input-field" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="regular">Regular Specialist (View only)</option>
                    <option value="qa">Quality Analyst (QA Evaluations & Coaching)</option>
                    <option value="admin">Admin / Team Lead (Custom Permissions)</option>
                    <option value="superadmin">Super Admin (Full Unrestricted Access)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Primary LOB</label>
                  <select id="new-lob" className="input-field" value={newUser.lob} onChange={(e) => setNewUser({ ...newUser, lob: e.target.value })}>
                    <option value="VA">VA Intake Specialist</option>
                    <option value="SSD">SSD Intake Specialist</option>
                    <option value="APPS">Apps Team Representative</option>
                  </select>
                </div>
              </div>

              {/* Permission Configurator Matrix for Admin role */}
              {newUser.role === 'admin' && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-color)', marginBottom: 12 }}>⚙️ Configure Admin Permissions & LOB Access</h3>
                  
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Permitted Lines of Business (LOBs)</label>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {(['VA', 'SSD', 'APPS'] as const).map(lob => (
                        <label key={lob} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={newUser.permissions.allowedLobs.includes(lob)}
                            onChange={(e) => {
                              const curr = newUser.permissions.allowedLobs
                              const updated = e.target.checked ? [...curr, lob] : curr.filter(l => l !== lob)
                              setNewUser({ ...newUser, permissions: { ...newUser.permissions, allowedLobs: updated.length ? updated : ['VA'] } })
                            }}
                          />
                          <span>{lob === 'VA' ? 'VA Intake' : lob === 'SSD' ? 'SSD Intake' : 'Apps Team'}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Feature Access Capabilities</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canManageDailyEntry} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canManageDailyEntry: e.target.checked } })} />
                        <span>📝 Log & Edit Daily Performance Entries</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canCopyEOD} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canCopyEOD: e.target.checked } })} />
                        <span>📋 Copy EOD Reports for Outlook</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canViewQA} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canViewQA: e.target.checked } })} />
                        <span>📊 View QA Performance Analytics</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canPerformQA} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canPerformQA: e.target.checked } })} />
                        <span>📝 Conduct QA Call Evaluations</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canManageCoaching} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canManageCoaching: e.target.checked } })} />
                        <span>🎓 Manage Coaching & PIP Plans</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canViewTimeOff} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canViewTimeOff: e.target.checked } })} />
                        <span>🌴 View Team Time-Off Calendar</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canApproveTimeOff} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canApproveTimeOff: e.target.checked } })} />
                        <span>✅ Approve / Reject Time-Off Requests</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newUser.permissions.canChangeSettings} onChange={e => setNewUser({ ...newUser, permissions: { ...newUser.permissions, canChangeSettings: e.target.checked } })} />
                        <span>⚙️ Edit Monthly Target Goals</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button id="btn-create-user" className="btn-primary" onClick={createUser} disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Edit Permissions Modal */}
          {editPermsUser && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="glass-card" style={{ padding: '28px 32px', maxWidth: 600, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>⚙️ Configure Admin Permissions</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>User: <strong>{editPermsUser.username}</strong> ({editPermsUser.role})</p>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Permitted Lines of Business (LOBs)</label>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {(['VA', 'SSD', 'APPS'] as const).map(lob => (
                      <label key={lob} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editPermsUser.perms.allowedLobs.includes(lob)}
                          onChange={(e) => {
                            const curr = editPermsUser.perms.allowedLobs
                            const updated = e.target.checked ? [...curr, lob] : curr.filter(l => l !== lob)
                            setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, allowedLobs: updated.length ? updated : ['VA'] } })
                          }}
                        />
                        <span>{lob === 'VA' ? 'VA Intake' : lob === 'SSD' ? 'SSD Intake' : 'Apps Team'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Feature Capabilities</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canManageDailyEntry} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canManageDailyEntry: e.target.checked } })} />
                      <span>📝 Log & Edit Performance</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canCopyEOD} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canCopyEOD: e.target.checked } })} />
                      <span>📋 Copy EOD Reports</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canViewQA} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canViewQA: e.target.checked } })} />
                      <span>📊 View QA Analytics</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canPerformQA} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canPerformQA: e.target.checked } })} />
                      <span>📝 Conduct QA Evaluations</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canManageCoaching} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canManageCoaching: e.target.checked } })} />
                      <span>🎓 Manage Coaching & PIP</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canViewTimeOff} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canViewTimeOff: e.target.checked } })} />
                      <span>🌴 View Time-Off Calendar</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canApproveTimeOff} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canApproveTimeOff: e.target.checked } })} />
                      <span>✅ Approve Time-Off</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={editPermsUser.perms.canChangeSettings} onChange={e => setEditPermsUser({ ...editPermsUser, perms: { ...editPermsUser.perms, canChangeSettings: e.target.checked } })} />
                      <span>⚙️ Edit Target Goals</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-primary" onClick={savePermissions} disabled={saving}>{saving ? 'Saving…' : 'Save Permissions'}</button>
                  <button className="btn-secondary" onClick={() => setEditPermsUser(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Reset password modal */}
          {resetPwd && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="glass-card" style={{ padding: '28px 32px', maxWidth: 420, width: '90%' }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Reset Password</h2>
                <label className="field-label">New Password</label>
                <input id="reset-password-input" type="password" className="input-field" placeholder="New password" value={resetPwd.pwd} onChange={(e) => setResetPwd({ ...resetPwd, pwd: e.target.value })} style={{ marginBottom: 16 }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button id="btn-confirm-reset" className="btn-primary" onClick={doResetPassword} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn-secondary" onClick={() => setResetPwd(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Users table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>Loading…</div>
          ) : (
            <div className="glass-card" style={{ padding: '20px 0' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Username</th>
                    <th>Work Email (M365 Alerts)</th>
                    <th>Role</th>
                    <th>Line of Business</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSuper = user.role === 'master' || user.role === 'superadmin'
                    const isAdmin = user.role === 'admin'
                    const parsed = parsePerms(user.permissions, user.role)

                    return (
                      <tr key={user.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: isSuper ? 'linear-gradient(135deg, #b82105, #e11d48)' : isAdmin ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'linear-gradient(135deg, #475569, #64748b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, color: '#fff' }}>
                              {(user.display_name || user.username).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{user.display_name || user.username}</div>
                              {isAdmin && (
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                  LOBs: {parsed.allowedLobs.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 13 }}>{user.username}</td>
                        <td>
                          <input
                            type="email"
                            placeholder="Add M365 Email..."
                            defaultValue={user.email || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (user.email || '')) {
                                updateEmail(user.id, e.target.value)
                              }
                            }}
                            className="input-field"
                            style={{
                              padding: '4px 8px',
                              fontSize: 12,
                              width: '190px',
                              height: 'auto',
                              marginBottom: 0,
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: user.email ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                              color: user.email ? '#10b981' : 'var(--text-muted)',
                            }}
                          />
                        </td>
                        <td>
                          <select
                            value={user.role === 'master' ? 'superadmin' : user.role}
                            onChange={(e) => updateRole(user.id, e.target.value)}
                            className="input-field"
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              width: 'auto',
                              height: 'auto',
                              marginBottom: 0,
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <option value="regular" style={{ background: '#1e1b4b', color: '#fff' }}>Regular Specialist</option>
                            <option value="qa" style={{ background: '#1e1b4b', color: '#fff' }}>Quality Analyst (QA)</option>
                            <option value="admin" style={{ background: '#1e1b4b', color: '#fff' }}>Admin / Team Lead</option>
                            <option value="superadmin" style={{ background: '#1e1b4b', color: '#fff' }}>Super Admin</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={user.lob || 'VA'}
                            onChange={(e) => updateLob(user.id, e.target.value)}
                            className="input-field"
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              width: 'auto',
                              height: 'auto',
                              marginBottom: 0,
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <option value="VA" style={{ background: '#1e1b4b', color: '#fff' }}>VA Intake</option>
                            <option value="SSD" style={{ background: '#1e1b4b', color: '#fff' }}>SSD Intake</option>
                            <option value="APPS" style={{ background: '#1e1b4b', color: '#fff' }}>Apps Team</option>
                          </select>
                        </td>
                        <td>
                          <span className={user.active ? 'badge badge-success' : 'badge badge-danger'}>
                            {user.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {isAdmin && (
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 12, padding: '5px 12px', background: 'rgba(124, 58, 237, 0.2)', border: '1px solid rgba(124, 58, 237, 0.4)', color: '#c084fc' }}
                                onClick={() => setEditPermsUser({ id: user.id, username: user.username, role: user.role, perms: parsePerms(user.permissions, user.role) })}
                              >
                                ⚙️ Permissions
                              </button>
                            )}
                            <button
                              id={`btn-reset-pwd-${user.id}`}
                              className="btn-secondary"
                              style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={() => setResetPwd({ id: user.id, pwd: '' })}
                            >
                              Reset Password
                            </button>
                            <button
                              id={`btn-toggle-${user.id}`}
                              className={user.active ? 'btn-danger' : 'btn-secondary'}
                              style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={() => toggleActive(user)}
                            >
                              {user.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
