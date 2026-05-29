import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Master-only routes
    const masterRoutes = ['/entry', '/users', '/import']
    const isMasterRoute = masterRoutes.some((r) => pathname.startsWith(r))

    if (isMasterRoute && token?.role !== 'master') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
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
  matcher: ['/dashboard/:path*', '/entry/:path*', '/users/:path*', '/import/:path*'],
}
