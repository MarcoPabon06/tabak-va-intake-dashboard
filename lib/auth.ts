import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import getDb, { parseUserPermissions } from './db'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const db = getDb()
        const user = db
          .prepare('SELECT * FROM users WHERE username = ? AND active = 1')
          .get(credentials.username) as any

        if (!user) return null

        const valid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!valid) return null

        const permissions = parseUserPermissions(user.role, user.permissions)

        return {
          id: String(user.id),
          name: user.display_name || user.username,
          email: user.username,
          role: user.role,
          lob: user.lob || 'VA',
          permissions,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.lob = (user as any).lob || 'VA'
        token.permissions = (user as any).permissions
      } else if (token.id) {
        try {
          const db = getDb()
          const dbUser = db.prepare('SELECT role, lob, permissions FROM users WHERE id = ? AND active = 1').get(token.id) as any
          if (dbUser) {
            token.role = dbUser.role
            token.lob = dbUser.lob || 'VA'
            token.permissions = parseUserPermissions(dbUser.role, dbUser.permissions)
          }
        } catch {
          // Keep existing token if db check fails
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).id = token.id
        ;(session.user as any).lob = token.lob || 'VA'
        ;(session.user as any).permissions = token.permissions
      }
      return session
    },
  },
}
