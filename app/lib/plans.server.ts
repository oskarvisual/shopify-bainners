import { db } from "../db.server";
import { getPlanFeatures, normalizePlan } from "./plans";

export async function getSubscriptionPlanContext({
  shop,
  sessionPlan,
}: {
  shop: string;
  sessionPlan?: string | null;
}) {
  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
    select: { plan: true },
  });
  const planFromDb = shopRecord?.plan || "free";
  const plan = sessionPlan ? normalizePlan(sessionPlan) : normalizePlan(planFromDb);
  const features = getPlanFeatures(plan);

  return {
    plan,
    features,
  };
}
