'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import NotificationBell from '@/components/NotificationBell'

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#b82105',
  'Adriana Soto': '#5f758e',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f5a524',
  'Omar Soto': '#0284c7',
}

export { AGENT_COLORS }

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/apps-team', label: 'Apps Team', icon: '📲' },
  { href: '/entry', label: 'Daily Entry', icon: '✏️', masterOnly: true },
  { href: '/qa-entry', label: 'QA Entry', icon: '📋', masterOnly: true },
  { href: '/qa', label: 'QA Scores', icon: '🏅' },
  { href: '/coaching', label: 'Coaching Logs', icon: '🎯' },
  { href: '/time-off', label: 'Time Off', icon: '📅' },
  { href: '/guide', label: 'User Guide', icon: '📖' },
  { href: '/import', label: 'Import Excel', icon: '📥', masterOnly: true },
  { href: '/users', label: 'User Management', icon: '👥', masterOnly: true },
  { href: '/settings', label: 'Settings', icon: '⚙️', masterOnly: true },
]

export default function Navigation() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user as any
  const role = user?.role || 'regular'
  const isSuper = role === 'master' || role === 'superadmin'
  const isAdmin = role === 'admin'
  const perms = user?.permissions

  const userName = session?.user?.name || 'User'

  // Permission evaluation helper
  function canAccessLink(link: typeof navLinks[0]): boolean {
    if (isSuper) return true
    const userLob = user?.lob || 'VA'
    const allowedLobs: string[] = Array.isArray(perms?.allowedLobs) ? perms.allowedLobs : [userLob]

    if (link.href === '/apps-team') {
      if (role === 'regular') return userLob === 'APPS'
      if (isAdmin) {
        return (
          userLob === 'SSD' ||
          userLob === 'APPS' ||
          allowedLobs.includes('SSD') ||
          allowedLobs.includes('APPS') ||
          allowedLobs.includes('All')
        )
      }
      return false
    }

    if (role === 'regular') {
      if (['/dashboard', '/qa', '/coaching', '/time-off', '/guide'].includes(link.href)) return true
      return false
    }
    if (isAdmin) {
      if (link.href === '/dashboard' || link.href === '/guide') return true
      if (link.href === '/entry') return perms?.canManageDailyEntry ?? true
      if (link.href === '/qa-entry') return perms?.canPerformQA ?? true
      if (link.href === '/qa') return perms?.canViewQA ?? true
      if (link.href === '/coaching') return perms?.canManageCoaching ?? true
      if (link.href === '/time-off') return perms?.canViewTimeOff ?? true
      if (link.href === '/import') return perms?.canManageDailyEntry ?? true
      if (link.href === '/users') return perms?.canManageUsers ?? false
      if (link.href === '/settings') return perms?.canChangeSettings ?? false
    }
    return false
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 24px', borderBottom: '1px solid var(--border)' }}>
        <img
          src="/logo.png"
          alt="Tabak LLC Logo"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(184, 33, 5, 0.35)',
            flexShrink: 0,
            objectFit: 'cover'
          }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em' }}>Tabak LLC</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
            {isSuper ? 'Super Admin' : isAdmin ? 'Team Lead Admin' : 'Specialist View'}
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ marginTop: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px', marginBottom: 4 }}>
          Navigation
        </div>
        {navLinks.map((link) => {
          if (!canAccessLink(link)) return null
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isSuper ? 'linear-gradient(135deg, #b82105, #e11d48)' : isAdmin ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'linear-gradient(135deg, #475569, #64748b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0, color: '#fff',
            }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
              <div style={{ fontSize: 11 }}>
                <span className={`badge ${isSuper ? 'badge-accent' : isAdmin ? 'badge-primary' : 'badge-success'}`} style={{ padding: '1px 7px', fontSize: 10 }}>
                  {isSuper ? 'Super Admin' : isAdmin ? 'Admin' : 'Specialist'}
                </span>
              </div>
            </div>
          </div>
          <NotificationBell />
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
