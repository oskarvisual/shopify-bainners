import { createContext, useContext, useMemo } from "react";
import { getPlanFeatures, normalizePlan, planHasFeature } from "./plans";

const defaultValue = {
  plan: normalizePlan(),
  features: getPlanFeatures(),
};

const PlanContext = createContext(defaultValue);

export function PlanProvider({
  value,
  children,
}: {
  value?: { plan?: string; features?: Record<string, any> };
  children: React.ReactNode;
}) {
  const memoizedValue = useMemo(() => {
    if (!value) return defaultValue;
    const normalizedPlan = normalizePlan(value.plan);
    return {
      plan: normalizedPlan,
      features: value.features || getPlanFeatures(normalizedPlan),
    };
  }, [value]);

  return <PlanContext.Provider value={memoizedValue}>{children}</PlanContext.Provider>;
}

export function usePlanContext() {
  return useContext(PlanContext);
}

export function usePlanFeatures() {
  const { features } = usePlanContext();
  return features;
}

export function usePlan() {
  const { plan } = usePlanContext();
  return plan;
}

export function usePlanFeature(feature: any) {
  const { plan, features } = usePlanContext();
  return planHasFeature(features || plan, feature);
}
