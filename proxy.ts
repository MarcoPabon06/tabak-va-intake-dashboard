import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any
    const pathname = req.nextUrl.pathname

    const role = token?.role || 'regular'
    const perms = token?.permissions

    // Superadmins and Master users have unrestricted access
    if (role === 'master' || role === 'superadmin') {
      return NextResponse.next()
    }

    // Daily Entry and Excel Import routes
    if (pathname.startsWith('/entry') || pathname.startsWith('/import')) {
      const canManageEntry = role === 'admin' ? (perms?.canManageDailyEntry ?? true) : Boolean(perms?.canManageDailyEntry)
      if (!canManageEntry) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    // User Management route
    if (pathname.startsWith('/users')) {
      if (!perms?.canManageUsers) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    // Settings route
    if (pathname.startsWith('/settings')) {
      if (!perms?.canChangeSettings) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ['/dashboard/:path*', '/entry/:path*', '/users/:path*', '/import/:path*', '/settings/:path*'],
}
