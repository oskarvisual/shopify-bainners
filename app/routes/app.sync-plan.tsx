import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { normalizePlan } from "../lib/plans";
import { getPlanStorageLimitGB } from "../utils/storage.server";

const ACTIVE_SUBSCRIPTIONS_QUERY = `
  query GetActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;

  try {
    const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const data = await response.json();
    const activeSubscriptions = data?.data?.currentAppInstallation?.activeSubscriptions || [];

    let detectedPlan = "free";

    if (activeSubscriptions.length > 0) {
      const subscription = activeSubscriptions[0];
      const subscriptionName = subscription.name?.toLowerCase() || "";

      if (subscriptionName.includes("ultra")) {
        detectedPlan = "ultra";
      } else if (subscriptionName.includes("pro")) {
        detectedPlan = "pro";
      } else {
        const price = parseFloat(
          subscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0"
        );

        if (price >= 40) {
          detectedPlan = "ultra";
        } else if (price >= 15) {
          detectedPlan = "pro";
        }
      }
    }

    const normalizedPlan = normalizePlan(detectedPlan);

    await db.shop.update({
      where: { shopDomain: shop },
      data: { plan: normalizedPlan, storageLimitGB: getPlanStorageLimitGB(normalizedPlan) },
    });

    return redirect(`/app/settings?plan_updated=true&plan=${normalizedPlan}`);
  } catch (error) {
    console.error("[SYNC PLAN] Error syncing plan:", error);
    return redirect("/app/settings?plan_updated=error");
  }
};

export default function SyncPlanPage() {
  return null;
}
