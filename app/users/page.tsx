'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'

interface User {
  id: number
  username: string
  display_name: string
  role: string
  active: number
  lob?: string
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', display_name: '', role: 'regular', lob: 'VA' })
  const [resetPwd, setResetPwd] = useState<{ id: number; pwd: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function fetchUsers() {
    setLoading(true)
    const res = await fetch('/api/users')
    const json = await res.json()
    setUsers(json)
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  function showMsg(type: 'success' | 'error', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function createUser() {
    if (!newUser.username || !newUser.password) return
    setSaving(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      showMsg('success', `User "${newUser.username}" created successfully.`)
      setNewUser({ username: '', password: '', display_name: '', role: 'regular', lob: 'VA' })
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
        <div style={{ maxWidth: 900 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>User Management</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Manage dashboard access for your team</p>
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
            <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>New User</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="field-label">Username</label>
                  <input id="new-username" type="text" className="input-field" placeholder="e.g. dcasillo" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Display Name</label>
                  <input id="new-displayname" type="text" className="input-field" placeholder="e.g. Daniel Castillo" value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Password</label>
                  <input id="new-password" type="password" className="input-field" placeholder="Temporary password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Role</label>
                  <select id="new-role" className="input-field" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="regular">Regular (View only)</option>
                    <option value="master">Master (Full access)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Line of Business (LOB)</label>
                  <select id="new-lob" className="input-field" value={newUser.lob} onChange={(e) => setNewUser({ ...newUser, lob: e.target.value })}>
                    <option value="VA">VA Intake Specialist</option>
                    <option value="SSD">SSD Intake Specialist</option>
                    <option value="APPS">Apps Team Representative</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button id="btn-create-user" className="btn-primary" onClick={createUser} disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
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
                    <th>Role</th>
                    <th>Line of Business</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #b82105, #5f758e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                            {(user.display_name || user.username).charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600 }}>{user.display_name || user.username}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 13 }}>{user.username}</td>
                      <td>
                        <span className={user.role === 'master' ? 'badge badge-accent' : 'badge badge-success'}>
                          {user.role}
                        </span>
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
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
