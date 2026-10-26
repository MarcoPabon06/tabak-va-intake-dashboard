'use client'

import { useState, useEffect } from 'react'
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
  { href: '/va-tracker', label: 'VA Tracker', icon: '📑' },
  { href: '/ssd-tracker', label: 'SSD Tracker', icon: '💼' },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileMenuOpen])

  const activeNavLabel = navLinks.find((l) => l.href === pathname)?.label || 'Dashboard'

  // Permission evaluation helper
  function canAccessLink(link: typeof navLinks[0]): boolean {
    if (isSuper) return true
    const userLob = user?.lob || 'VA'
    const allowedLobs: string[] = Array.isArray(perms?.allowedLobs) ? perms.allowedLobs : [userLob]

    if (link.href === '/va-tracker') {
      if (role === 'regular') return userLob === 'VA'
      if (isAdmin) {
        return (
          userLob === 'VA' ||
          allowedLobs.includes('VA') ||
          allowedLobs.includes('All')
        )
      }
      if (role === 'qa') return true
      return false
    }

    if (link.href === '/ssd-tracker') {
      if (role === 'regular') return userLob === 'SSD'
      if (isAdmin) {
        return (
          userLob === 'SSD' ||
          allowedLobs.includes('SSD') ||
          allowedLobs.includes('All')
        )
      }
      if (role === 'qa') return true
      return false
    }

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

    if (role === 'qa') {
      if (['/dashboard', '/va-tracker', '/ssd-tracker', '/qa-entry', '/qa', '/coaching', '/time-off', '/guide'].includes(link.href)) return true
      if (link.href === '/apps-team') return userLob === 'APPS' || allowedLobs.includes('APPS') || allowedLobs.includes('All')
      return false
    }

    if (role === 'regular') {
      if (['/dashboard', '/qa', '/coaching', '/time-off', '/guide'].includes(link.href)) return true
      if (link.href === '/va-tracker') return userLob === 'VA'
      if (link.href === '/ssd-tracker') return userLob === 'SSD'
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
    <>
      {/* Sticky Mobile / Tablet Top Header Bar (visible <= 1023px) */}
      <header className="mobile-top-bar" role="banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          <img
            src="/logo.png"
            alt="Tabak LLC Logo"
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              boxShadow: '0 2px 8px rgba(184, 33, 5, 0.35)',
              flexShrink: 0,
              objectFit: 'cover',
            }}
          />

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Tabak LLC
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeNavLabel}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          title={userName}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px 5px 6px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'rgba(255, 255, 255, 0.04)',
            color: '#fff',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: isSuper
                ? 'linear-gradient(135deg, #b82105, #e11d48)'
                : isAdmin
                  ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                  : 'linear-gradient(135deg, #475569, #64748b)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {userName.split(' ')[0]}
          </span>
        </button>
      </header>

      {/* Mobile / Tablet Drawer Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Responsive Sidebar / Drawer */}
      <aside className={`app-sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Main Navigation">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 8px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <img
              src="/logo.png"
              alt="Tabak LLC Logo"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(184, 33, 5, 0.35)',
                flexShrink: 0,
                objectFit: 'cover',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em' }}>Tabak LLC</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                {isSuper ? 'Super Admin' : isAdmin ? 'Team Lead Admin' : 'Specialist View'}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-close-btn"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Nav links */}
        <nav style={{ marginTop: 14, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 2 }}>
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
                onClick={() => setMobileMenuOpen(false)}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{link.icon}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Pinned User Info & Sign Out Footer */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 12px' }}>
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
    </>
  )
}
