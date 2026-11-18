import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts } from '@/lib/rate-limit'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 10 * 365 * 24 * 60 * 60, // 10 años
  },
  jwt: {
    maxAge: 10 * 365 * 24 * 60 * 60, // 10 años
  },
  pages: {
    signIn: '/admin/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const { limited, minutesLeft } = checkLoginRateLimit(credentials.email)
        if (limited) {
          throw new Error(`TooManyAttempts:${minutesLeft}`)
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { business: true },
        })

        if (!user) {
          recordLoginFailure(credentials.email)
          return null
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.password)
        if (!passwordValid) {
          recordLoginFailure(credentials.email)
          return null
        }

        resetLoginAttempts(credentials.email)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          businessId: user.businessId,
          businessSlug: user.business.slug,
          businessName: user.business.name,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.businessId = (user as any).businessId
        token.businessSlug = (user as any).businessSlug
        token.businessName = (user as any).businessName
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.businessId = token.businessId as string
        session.user.businessSlug = token.businessSlug as string
        session.user.businessName = token.businessName as string
      }
      return session
    },
  },
}

// Extender tipos de NextAuth
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      businessId: string
      businessSlug: string
      businessName: string
    }
  }
}
