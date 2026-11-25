import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getTier, type PlanTier } from '@/lib/planFeatures'

const ALLOWED_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PENDING'])

/** Returns true if the subscription grants access right now.
 *  CANCELLED is allowed when the paid period hasn't expired yet. */
function isAllowed(sub: { status: string; currentPeriodEnd: Date | null } | null): boolean {
  if (!sub) return false
  if (ALLOWED_STATUSES.has(sub.status)) return true
  // Grace: cancelled but still within the paid period
  if (sub.status === 'CANCELLED' && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()) return true
  return false
}

/**
 * Server-side guard for pages. Redirects to /admin/subscription when the
 * business does not have an active subscription.
 * CANCELLED subscriptions retain access until currentPeriodEnd.
 */
export async function requireActiveSubscription(businessId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true, currentPeriodEnd: true },
  })
  if (!isAllowed(sub)) {
    redirect('/admin/subscription')
  }
}

/**
 * API-route variant. Returns { allowed: false } when blocked.
 */
export async function checkActiveSubscription(
  businessId: string,
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true, currentPeriodEnd: true },
  })
  if (!isAllowed(sub)) {
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
    select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
  })
  if (!isAllowed(sub)) {
    redirect('/admin/subscription')
  }
  return getTier(sub!.plan.name)
}

/**
 * API-route variant that also returns the plan tier.
 */
export async function checkActiveSubscriptionWithTier(
  businessId: string,
): Promise<{ allowed: true; tier: PlanTier } | { allowed: false; status: number; error: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
  })
  if (!isAllowed(sub)) {
    return { allowed: false, status: 402, error: 'Suscripción inactiva.' }
  }
  return { allowed: true, tier: getTier(sub!.plan.name) }
}
