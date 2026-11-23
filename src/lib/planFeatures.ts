export type PlanTier = 'BASIC' | 'PRO'

export function getTier(planName: string): PlanTier {
  return planName.toLowerCase() === 'pro' ? 'PRO' : 'BASIC'
}

export const PRO_FEATURES = ['referrals', 'birthday', 'geofencing'] as const
export type ProFeature = typeof PRO_FEATURES[number]

export function canUse(tier: PlanTier, feature: ProFeature): boolean {
  return tier === 'PRO'
}
