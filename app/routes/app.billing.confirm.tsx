import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { SubscriptionPlan, getBillingPlan, normalizePlan } from "../lib/plans";

const CURRENT_INSTALLATION_QUERY = `
  query CurrentInstallation {
    currentAppInstallation {
      activeSubscriptions(first: 10) {
        id
        name
        status
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const planParam = normalizePlan(url.searchParams.get("plan"));
  const isMock = url.searchParams.get("mock") === "true";
  const isManagedPricing = url.searchParams.get("managed_pricing") === "true";

  if (!planParam || planParam === SubscriptionPlan.FREE) {
    return redirect("/app/settings?upgrade=invalid");
  }

  const billingPlan = getBillingPlan(planParam);
  if (!billingPlan) {
    return redirect("/app/settings?upgrade=invalid");
  }

  if (isManagedPricing) {
    return redirect(`/app/settings?upgrade=managed_pricing&plan=${planParam}`);
  }

  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;

  try {
    let hasActiveSubscription = false;

    if (isMock) {
      hasActiveSubscription = true;
    } else {
      const installationResponse = await admin.graphql(CURRENT_INSTALLATION_QUERY);
      const installationData = await installationResponse.json();
      const activeSubscriptions =
        installationData?.data?.currentAppInstallation?.activeSubscriptions || [];

      hasActiveSubscription = activeSubscriptions.some(
        (subscription: any) =>
          subscription?.name === billingPlan.name && subscription?.status === "ACTIVE"
      );
    }

    await db.shop.update({
      where: { shopDomain: shop },
      data: { plan: planParam },
    });

    const status = hasActiveSubscription ? "success" : "pending";
    return redirect(`/app/settings?upgrade=${status}&plan=${planParam}`);
  } catch (error) {
    console.error("[BILLING CONFIRM] Failed to confirm billing:", error);
    return redirect("/app/settings?upgrade=error");
  }
};

export default function BillingConfirmPage() {
  return null;
}
