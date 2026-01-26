export const SubscriptionPlan = {
  FREE: "free",
  PRO: "pro",
  ULTRA: "ultra",
} as const;

export type SubscriptionPlanType =
  | typeof SubscriptionPlan.FREE
  | typeof SubscriptionPlan.PRO
  | typeof SubscriptionPlan.ULTRA;

export const PlanFeature = {
  SETTINGS_TRANSLATIONS: "settingsTranslations",
  SETTINGS_ACCESS: "settingsAccess",
  AI_GENERATION: "aiGeneration",
  ADVANCED_ANALYTICS: "advancedAnalytics",
  ANALYTICS_CTR: "analyticsCtr",
  ANALYTICS_HISTORY_30: "analyticsHistory30",
  ANALYTICS_HISTORY_90: "analyticsHistory90",
  SCHEDULING: "scheduling",
  LAYOUT_SLIDER: "layoutSlider",
} as const;

export type PlanFeatureType = (typeof PlanFeature)[keyof typeof PlanFeature];

const PLAN_FEATURE_MAP: Record<SubscriptionPlanType, Record<PlanFeatureType, boolean>> = {
  [SubscriptionPlan.FREE]: {
    [PlanFeature.SETTINGS_TRANSLATIONS]: false,
    [PlanFeature.SETTINGS_ACCESS]: false,
    [PlanFeature.AI_GENERATION]: true,
    [PlanFeature.ADVANCED_ANALYTICS]: false,
    [PlanFeature.ANALYTICS_CTR]: false,
    [PlanFeature.ANALYTICS_HISTORY_30]: false,
    [PlanFeature.ANALYTICS_HISTORY_90]: false,
    [PlanFeature.SCHEDULING]: false,
    [PlanFeature.LAYOUT_SLIDER]: true,
  },
  [SubscriptionPlan.PRO]: {
    [PlanFeature.SETTINGS_TRANSLATIONS]: true,
    [PlanFeature.SETTINGS_ACCESS]: true,
    [PlanFeature.AI_GENERATION]: true,
    [PlanFeature.ADVANCED_ANALYTICS]: true,
    [PlanFeature.ANALYTICS_CTR]: true,
    [PlanFeature.ANALYTICS_HISTORY_30]: true,
    [PlanFeature.ANALYTICS_HISTORY_90]: false,
    [PlanFeature.SCHEDULING]: true,
    [PlanFeature.LAYOUT_SLIDER]: true,
  },
  [SubscriptionPlan.ULTRA]: {
    [PlanFeature.SETTINGS_TRANSLATIONS]: true,
    [PlanFeature.SETTINGS_ACCESS]: true,
    [PlanFeature.AI_GENERATION]: true,
    [PlanFeature.ADVANCED_ANALYTICS]: true,
    [PlanFeature.ANALYTICS_CTR]: true,
    [PlanFeature.ANALYTICS_HISTORY_30]: true,
    [PlanFeature.ANALYTICS_HISTORY_90]: true,
    [PlanFeature.SCHEDULING]: true,
    [PlanFeature.LAYOUT_SLIDER]: true,
  },
};

const PLAN_ORDER: SubscriptionPlanType[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.PRO,
  SubscriptionPlan.ULTRA,
];

export function normalizePlan(plan?: string | null): SubscriptionPlanType {
  if (!plan) return SubscriptionPlan.FREE;
  const normalized = String(plan).trim().toLowerCase();
  return PLAN_ORDER.includes(normalized as SubscriptionPlanType)
    ? (normalized as SubscriptionPlanType)
    : SubscriptionPlan.FREE;
}

export function getPlanFeatures(plan?: string | null) {
  const normalizedPlan = normalizePlan(plan);
  return {
    plan: normalizedPlan,
    ...PLAN_FEATURE_MAP[SubscriptionPlan.FREE],
    ...PLAN_FEATURE_MAP[normalizedPlan],
  };
}

export function planHasFeature(planOrFeatures: any, feature?: PlanFeatureType) {
  if (!feature) return false;
  if (typeof planOrFeatures === "string") {
    return Boolean(PLAN_FEATURE_MAP[normalizePlan(planOrFeatures)]?.[feature]);
  }
  return Boolean(planOrFeatures?.[feature]);
}

export function comparePlans(current?: string | null, target?: string | null) {
  const normalizedCurrent = normalizePlan(current || SubscriptionPlan.FREE);
  const normalizedTarget = normalizePlan(target || SubscriptionPlan.FREE);
  return PLAN_ORDER.indexOf(normalizedCurrent) - PLAN_ORDER.indexOf(normalizedTarget);
}

export function isAtLeastPlan(current?: string | null, target?: string | null) {
  return comparePlans(current, target) >= 0;
}

const resolvedCurrencyCode =
  (typeof process !== "undefined" && process.env?.BILLING_CURRENCY
    ? process.env.BILLING_CURRENCY
    : "USD"
  ).toUpperCase();

export const BILLING_PLANS: Record<SubscriptionPlanType, any> = {
  [SubscriptionPlan.FREE]: null,
  [SubscriptionPlan.PRO]: {
    name: "Pro Plan",
    shortName: "Pro",
    price: 15,
    currencyCode: resolvedCurrencyCode,
    interval: "EVERY_30_DAYS",
  },
  [SubscriptionPlan.ULTRA]: {
    name: "Ultra Plan",
    shortName: "Ultra",
    price: 40,
    currencyCode: resolvedCurrencyCode,
    interval: "EVERY_30_DAYS",
  },
};

export function getBillingPlan(plan?: string | null) {
  const normalizedPlan = normalizePlan(plan);
  return BILLING_PLANS[normalizedPlan];
}

export function getBillingButtonLabel(plan?: string | null) {
  const billingPlan = getBillingPlan(plan);
  if (!billingPlan) return null;
  const amount = billingPlan.price?.toFixed(2).replace(/\.00$/, "");
  return `Upgrade to ${billingPlan.shortName} ($${amount}/${billingPlan.interval === "EVERY_30_DAYS" ? "mo" : "period"})`;
}

export function getPlanLimits(plan?: string | null) {
  const normalized = normalizePlan(plan);
  if (normalized === SubscriptionPlan.PRO) {
    return {
      activeBanners: 100,
      analyticsRange: 30,
    };
  }
  if (normalized === SubscriptionPlan.ULTRA) {
    return {
      activeBanners: Infinity,
      analyticsRange: 90,
    };
  }
  return {
    activeBanners: 3,
    analyticsRange: 7,
  };
}
