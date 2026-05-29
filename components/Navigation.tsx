'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#6366f1',
  'Adriana Soto': '#ec4899',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f59e0b',
  'Omar Soto': '#3b82f6',
}

export { AGENT_COLORS }

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/entry', label: 'Daily Entry', icon: '✏️', masterOnly: true },
  { href: '/import', label: 'Import Excel', icon: '📥', masterOnly: true },
  { href: '/users', label: 'User Management', icon: '👥', masterOnly: true },
]

export default function Navigation() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isMaster = (session?.user as any)?.role === 'master'
  const userName = session?.user?.name || 'User'

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        minHeight: '100vh',
        background: 'rgba(10, 22, 40, 0.95)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 12px',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 50,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '8px 8px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
            flexShrink: 0,
          }}>⚡</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em' }}>Tabak LLC</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Veterans Benefits</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ marginTop: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', marginBottom: 4 }}>
          Navigation
        </div>
        {navLinks.map((link) => {
          if (link.masterOnly && !isMaster) return null
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${isActive ? 'active' : ''}`}
              id={`nav-${link.href.replace('/', '')}`}
            >
              <span style={{ fontSize: 16 }}>{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 12px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
            <div style={{ fontSize: 11 }}>
              <span className={`badge ${isMaster ? 'badge-accent' : 'badge-success'}`} style={{ padding: '1px 7px', fontSize: 10 }}>
                {isMaster ? 'Master' : 'Viewer'}
              </span>
            </div>
          </div>
        </div>
        <button
          id="btn-signout"
          className="btn-secondary"
          style={{ width: '100%', fontSize: 13 }}
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
