import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getTier, type PlanTier } from '@/lib/planFeatures'

const ALLOWED_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PENDING'])

/**
 * Server-side guard for pages. Redirects to /admin/subscription when the
 * business does not have an active subscription (ACTIVE, TRIALING, PENDING).
 * PAST_DUE, CANCELLED, and missing subscriptions are all blocked.
 */
export async function requireActiveSubscription(businessId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true },
  })
  if (!sub || !ALLOWED_STATUSES.has(sub.status)) {
    redirect('/admin/subscription')
  }
}

/**
 * API-route variant. Returns { allowed: false, response } when blocked so the
 * caller can return the response immediately, or { allowed: true } to proceed.
 */
export async function checkActiveSubscription(
  businessId: string,
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true },
  })
  if (!sub || !ALLOWED_STATUSES.has(sub.status)) {
    return { allowed: false, status: 402, error: 'Suscripción inactiva.' }
  }
  return { allowed: true }
}

/**
 * Server-side guard that also returns the plan tier.
 * Redirects to /admin/subscription when blocked.
 */
export async function requireActiveSubscriptionWithTier(businessId: string): Promise<PlanTier> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true, plan: { select: { name: true } } },
  })
  if (!sub || !ALLOWED_STATUSES.has(sub.status)) {
    redirect('/admin/subscription')
  }
  return getTier(sub.plan.name)
}

/**
 * API-route variant that also returns the plan tier.
 */
export async function checkActiveSubscriptionWithTier(
  businessId: string,
): Promise<{ allowed: true; tier: PlanTier } | { allowed: false; status: number; error: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true, plan: { select: { name: true } } },
  })
  if (!sub || !ALLOWED_STATUSES.has(sub.status)) {
    return { allowed: false, status: 402, error: 'Suscripción inactiva.' }
  }
  return { allowed: true, tier: getTier(sub.plan.name) }
}
