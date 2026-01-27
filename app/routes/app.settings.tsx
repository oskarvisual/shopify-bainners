import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  List,
  Modal,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { syncAllBannerMetaobjects } from "../utils/metaobjects.server";
import { DEFAULT_SHOP_DEFAULTS } from "../utils/defaults.server";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import {
  PlanFeature,
  SubscriptionPlan,
  getBillingButtonLabel,
  getBillingPlan,
  isAtLeastPlan,
} from "../lib/plans";
import { usePlan, usePlanFeature } from "../lib/plan-context";

const TIMEZONE_FALLBACK = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];


const SIZE_OPTIONS = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
  { label: "Extra large", value: "xl" },
];

const ANIMATION_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Shake", value: "shake" },
  { label: "Pulse", value: "pulse" },
  { label: "Bounce", value: "bounce" },
];

const COUNTDOWN_STYLE_OPTIONS = [
  { label: "Solid", value: "solid" },
  { label: "Text only", value: "text" },
  { label: "Segments", value: "segments" },
  { label: "Pill", value: "pill" },
];

const ARROW_STYLE_OPTIONS = [
  { label: "Chevron", value: "chevron" },
  { label: "Arrow", value: "arrow" },
  { label: "Minimal", value: "minimal" },
];

const ANNOUNCEMENT_LAYOUT_OPTIONS = [
  { label: "Inline", value: "inline" },
  { label: "Stacked", value: "stacked" },
];

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

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;
  const upgradeStatus = url.searchParams.get("upgrade");
  const upgradePlan = url.searchParams.get("plan");
  const planUpdated = url.searchParams.get("plan_updated");

  if (!shop) {
    return json({ shop: null, defaults: {}, upgradeStatus, upgradePlan, planUpdated });
  }

  let shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    shopRecord = await db.shop.create({
      data: {
        shopDomain: shop,
        plan: "free",
        storageLimitGB: 1,
        ...DEFAULT_SHOP_DEFAULTS,
      },
    });
  }

  const planContext = await getSubscriptionPlanContext({ shop, sessionPlan: session?.subscriptionPlan });

  return json({
    shop,
    planContext,
    upgradeStatus,
    upgradePlan,
    planUpdated,
    billingHandle: process.env.SHOPIFY_APP_HANDLE || "bainners-ai-image-banners",
    defaults: {
      bannerBackgroundColor:
        shopRecord.defaultBannerBackgroundColor || DEFAULT_SHOP_DEFAULTS.defaultBannerBackgroundColor,
      titleFontSize: shopRecord.defaultTitleFontSize || "lg",
      descriptionFontSize: shopRecord.defaultDescriptionFontSize || "md",
      titleColor: shopRecord.defaultTitleColor || DEFAULT_SHOP_DEFAULTS.defaultTitleColor,
      descriptionColor:
        shopRecord.defaultDescriptionColor || DEFAULT_SHOP_DEFAULTS.defaultDescriptionColor,
      ctaTextColor: shopRecord.defaultCtaTextColor || DEFAULT_SHOP_DEFAULTS.defaultCtaTextColor,
      ctaBackgroundColor:
        shopRecord.defaultCtaBackgroundColor || DEFAULT_SHOP_DEFAULTS.defaultCtaBackgroundColor,
      ctaBorderColor:
        shopRecord.defaultCtaBorderColor || DEFAULT_SHOP_DEFAULTS.defaultCtaBorderColor,
      ctaBordered: shopRecord.defaultCtaBordered ?? false,
      ctaRounded: shopRecord.defaultCtaRounded ?? true,
      ctaShadow: shopRecord.defaultCtaShadow ?? false,
      ctaStyle: shopRecord.defaultCtaStyle || "button",
      ctaUnderline: shopRecord.defaultCtaUnderline ?? false,
      countdownTextColor:
        shopRecord.defaultCountdownTextColor || DEFAULT_SHOP_DEFAULTS.defaultCountdownTextColor,
      countdownBackgroundColor:
        shopRecord.defaultCountdownBackgroundColor ||
        DEFAULT_SHOP_DEFAULTS.defaultCountdownBackgroundColor,
      countdownStyle: shopRecord.defaultCountdownStyle || "solid",
      countdownFontSize: shopRecord.defaultCountdownFontSize || "md",
      countdownTimezone: shopRecord.defaultCountdownTimezone || "UTC",
      sliderArrowStyle: shopRecord.defaultSliderArrowStyle || "chevron",
      sliderArrowColor:
        shopRecord.defaultSliderArrowColor || DEFAULT_SHOP_DEFAULTS.defaultSliderArrowColor,
      sliderBulletColor:
        shopRecord.defaultSliderBulletColor || DEFAULT_SHOP_DEFAULTS.defaultSliderBulletColor,
      announcementMarquee: shopRecord.defaultAnnouncementMarquee ?? false,
      announcementAnimation: shopRecord.defaultAnnouncementAnimation || "none",
      announcementCloseColor:
        shopRecord.defaultAnnouncementCloseColor || DEFAULT_SHOP_DEFAULTS.defaultAnnouncementCloseColor,
      announcementClosable: shopRecord.defaultAnnouncementClosable ?? false,
      announcementLayout: shopRecord.defaultAnnouncementLayout || "inline",
      announcementContentSpacing: shopRecord.defaultAnnouncementContentSpacing ?? 12,
      announcementShowText: shopRecord.defaultAnnouncementShowText ?? true,
      announcementShowCta: shopRecord.defaultAnnouncementShowCta ?? true,
      announcementShowCoupon: shopRecord.defaultAnnouncementShowCoupon ?? false,
      announcementCouponTextColor:
        shopRecord.defaultAnnouncementCouponTextColor ||
        DEFAULT_SHOP_DEFAULTS.defaultAnnouncementCouponTextColor,
      announcementCouponBorderColor:
        shopRecord.defaultAnnouncementCouponBorderColor ||
        DEFAULT_SHOP_DEFAULTS.defaultAnnouncementCouponBorderColor,
      announcementCouponBackgroundColor:
        shopRecord.defaultAnnouncementCouponBackgroundColor ||
        DEFAULT_SHOP_DEFAULTS.defaultAnnouncementCouponBackgroundColor,
      translationCouponCopied: shopRecord.defaultTranslationCouponCopied || "Coupon copied",
      translationDays: shopRecord.defaultTranslationDays || "d",
      translationHours: shopRecord.defaultTranslationHours || "h",
      translationMinutes: shopRecord.defaultTranslationMinutes || "m",
      translationSeconds: shopRecord.defaultTranslationSeconds || "s",
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ success: false, error: "Missing shop" }, { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("action");
  const intent = formData.get("intent");

  if (intent === "sync-plan") {
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

      await db.shop.update({
        where: { shopDomain: shop },
        data: { plan: detectedPlan },
      });

      return json({ success: true, plan: detectedPlan });
    } catch (error) {
      console.error("[SETTINGS SYNC] Error syncing plan:", error);
      return json({ success: false, error: "Unable to sync plan" }, { status: 500 });
    }
  }

  if (action === "sync-metaobjects") {
    const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
    if (shopRecord) {
      await syncAllBannerMetaobjects(admin, shopRecord.id);
    }
    return json({ success: true });
  }

  await db.shop.upsert({
    where: { shopDomain: shop },
    update: {
      defaultBannerBackgroundColor: formData.get("bannerBackgroundColor") as string,
      defaultTitleFontSize: formData.get("titleFontSize") as string,
      defaultDescriptionFontSize: formData.get("descriptionFontSize") as string,
      defaultTitleColor: formData.get("titleColor") as string,
      defaultDescriptionColor: formData.get("descriptionColor") as string,
      defaultCtaTextColor: formData.get("ctaTextColor") as string,
      defaultCtaBackgroundColor: formData.get("ctaBackgroundColor") as string,
      defaultCtaBorderColor: formData.get("ctaBorderColor") as string,
      defaultCtaBordered: formData.get("ctaBordered") === "true",
      defaultCtaRounded: formData.get("ctaRounded") !== "false",
      defaultCtaShadow: formData.get("ctaShadow") === "true",
      defaultCtaStyle: formData.get("ctaStyle") as string,
      defaultCtaUnderline: formData.get("ctaUnderline") === "true",
      defaultCountdownTextColor: formData.get("countdownTextColor") as string,
      defaultCountdownBackgroundColor: formData.get("countdownBackgroundColor") as string,
      defaultCountdownStyle: formData.get("countdownStyle") as string,
      defaultCountdownFontSize: formData.get("countdownFontSize") as string,
      defaultCountdownTimezone: formData.get("countdownTimezone") as string,
      defaultSliderArrowStyle: formData.get("sliderArrowStyle") as string,
      defaultSliderArrowColor: formData.get("sliderArrowColor") as string,
      defaultSliderBulletColor: formData.get("sliderBulletColor") as string,
      defaultAnnouncementMarquee: formData.get("announcementMarquee") === "true",
      defaultAnnouncementAnimation: formData.get("announcementAnimation") as string,
      defaultAnnouncementCloseColor: formData.get("announcementCloseColor") as string,
      defaultAnnouncementClosable: formData.get("announcementClosable") === "true",
      defaultAnnouncementLayout: formData.get("announcementLayout") as string,
      defaultAnnouncementContentSpacing: Number(formData.get("announcementContentSpacing") || 12),
      defaultAnnouncementShowText: formData.get("announcementShowText") !== "false",
      defaultAnnouncementShowCta: formData.get("announcementShowCta") !== "false",
      defaultAnnouncementShowCoupon: formData.get("announcementShowCoupon") === "true",
      defaultAnnouncementCouponTextColor: formData.get("announcementCouponTextColor") as string,
      defaultAnnouncementCouponBorderColor: formData.get("announcementCouponBorderColor") as string,
      defaultAnnouncementCouponBackgroundColor: formData.get(
        "announcementCouponBackgroundColor"
      ) as string,
      defaultTranslationCouponCopied: formData.get("translationCouponCopied") as string,
      defaultTranslationDays: formData.get("translationDays") as string,
      defaultTranslationHours: formData.get("translationHours") as string,
      defaultTranslationMinutes: formData.get("translationMinutes") as string,
      defaultTranslationSeconds: formData.get("translationSeconds") as string,
    },
    create: {
      shopDomain: shop,
      plan: "free",
      storageLimitGB: 1,
      defaultBannerBackgroundColor: formData.get("bannerBackgroundColor") as string,
      defaultTitleFontSize: formData.get("titleFontSize") as string,
      defaultDescriptionFontSize: formData.get("descriptionFontSize") as string,
      defaultTitleColor: formData.get("titleColor") as string,
      defaultDescriptionColor: formData.get("descriptionColor") as string,
      defaultCtaTextColor: formData.get("ctaTextColor") as string,
      defaultCtaBackgroundColor: formData.get("ctaBackgroundColor") as string,
      defaultCtaBorderColor: formData.get("ctaBorderColor") as string,
      defaultCtaBordered: formData.get("ctaBordered") === "true",
      defaultCtaRounded: formData.get("ctaRounded") !== "false",
      defaultCtaShadow: formData.get("ctaShadow") === "true",
      defaultCtaStyle: formData.get("ctaStyle") as string,
      defaultCtaUnderline: formData.get("ctaUnderline") === "true",
      defaultCountdownTextColor: formData.get("countdownTextColor") as string,
      defaultCountdownBackgroundColor: formData.get("countdownBackgroundColor") as string,
      defaultCountdownStyle: formData.get("countdownStyle") as string,
      defaultCountdownFontSize: formData.get("countdownFontSize") as string,
      defaultCountdownTimezone: formData.get("countdownTimezone") as string,
      defaultSliderArrowStyle: formData.get("sliderArrowStyle") as string,
      defaultSliderArrowColor: formData.get("sliderArrowColor") as string,
      defaultSliderBulletColor: formData.get("sliderBulletColor") as string,
      defaultAnnouncementMarquee: formData.get("announcementMarquee") === "true",
      defaultAnnouncementAnimation: formData.get("announcementAnimation") as string,
      defaultAnnouncementCloseColor: formData.get("announcementCloseColor") as string,
      defaultAnnouncementClosable: formData.get("announcementClosable") === "true",
      defaultAnnouncementLayout: formData.get("announcementLayout") as string,
      defaultAnnouncementContentSpacing: Number(formData.get("announcementContentSpacing") || 12),
      defaultAnnouncementShowText: formData.get("announcementShowText") !== "false",
      defaultAnnouncementShowCta: formData.get("announcementShowCta") !== "false",
      defaultAnnouncementShowCoupon: formData.get("announcementShowCoupon") === "true",
      defaultAnnouncementCouponTextColor: formData.get("announcementCouponTextColor") as string,
      defaultAnnouncementCouponBorderColor: formData.get("announcementCouponBorderColor") as string,
      defaultAnnouncementCouponBackgroundColor: formData.get(
        "announcementCouponBackgroundColor"
      ) as string,
      defaultTranslationCouponCopied: formData.get("translationCouponCopied") as string,
      defaultTranslationDays: formData.get("translationDays") as string,
      defaultTranslationHours: formData.get("translationHours") as string,
      defaultTranslationMinutes: formData.get("translationMinutes") as string,
      defaultTranslationSeconds: formData.get("translationSeconds") as string,
    },
  });

  return json({ success: true });
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="bainners-color-field">
      <Text as="p" variant="bodySm">
        {label}
      </Text>
      <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.currentTarget.value)} />
    </div>
  );
}

export default function SettingsPage() {
  const { defaults, shop, upgradeStatus, upgradePlan, planUpdated, billingHandle } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();
  const syncPlanFetcher = useFetcher();
  const plan = usePlan();
  const canUseTranslations = usePlanFeature(PlanFeature.SETTINGS_TRANSLATIONS);
  const canUseSettings = usePlanFeature(PlanFeature.SETTINGS_ACCESS);
  const [state, setState] = useState(defaults);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const timezoneOptions = (() => {
    const supported =
      typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function"
        ? ((Intl as any).supportedValuesOf("timeZone") as string[])
        : TIMEZONE_FALLBACK;
    const unique = Array.from(new Set(supported.filter(Boolean)));
    const rest = unique.filter((tz) => tz !== "UTC").sort();
    const ordered = ["UTC", ...rest];
    return ordered.map((tz) => ({ label: tz, value: tz }));
  })();

  useEffect(() => {
    setState(defaults);
  }, [defaults]);

  useEffect(() => {
    const data = syncPlanFetcher.data as { success?: boolean; plan?: string } | undefined;
    if (data?.success && data.plan) {
      window.location.assign(`/app/settings?upgrade=success&plan=${data.plan}`);
    }
  }, [syncPlanFetcher.data]);

  const save = () => {
    const formData = new FormData();
    Object.entries(state).forEach(([key, value]) => {
      formData.set(key, String(value ?? ""));
    });
    fetcher.submit(formData, { method: "post" });
  };

  const handleUpgrade = (targetPlan: string) => {
    const billingPlan = getBillingPlan(targetPlan);
    if (!billingPlan) return;
    const shopDomain = (shop || "").replace(".myshopify.com", "");
    const handle = billingHandle || "bainners-ai-image-banners";
    const shopifyBillingUrl = `https://admin.shopify.com/store/${shopDomain}/charges/${handle}/pricing_plans`;
    window.open(shopifyBillingUrl, "_blank");
    setShowSyncModal(true);
  };

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Banner title="Need help installing the app?" className="bainners-setup-banner">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                Follow our step-by-step guide to add bAInners blocks to your theme.
              </Text>
              <div>
                <Button url="/app/setup-guide">
                  View Setup Guide
                </Button>
              </div>
            </BlockStack>
          </Banner>
        </Layout.Section>

        {upgradeStatus === "managed_pricing" ? (
          <Layout.Section>
            <Banner title="Upgrade Your Plan" tone="info">
              <BlockStack gap="200">
                <Text as="p">
                  To upgrade to the <strong>{upgradePlan?.toUpperCase()}</strong> plan, complete
                  the upgrade in Shopify Billing, then sync your plan here.
                </Text>
                <InlineStack gap="200">
                  <Button
                    onClick={() => handleUpgrade(upgradePlan || SubscriptionPlan.PRO)}
                    variant="primary"
                  >
                    Open Shopify Billing
                  </Button>
                  <Button
                    onClick={() => {
                      const formData = new FormData();
                      formData.append("intent", "sync-plan");
                      syncPlanFetcher.submit(formData, { method: "post" });
                    }}
                  >
                    Sync My Plan
                  </Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          </Layout.Section>
        ) : null}

        {upgradeStatus === "success" ? (
          <Layout.Section>
            <Banner tone="success" title="Plan updated">
              <Text as="p">
                Your plan has been updated to{" "}
                <strong>{upgradePlan?.toUpperCase() || "the new plan"}</strong>.
              </Text>
            </Banner>
          </Layout.Section>
        ) : null}

        {planUpdated === "true" ? (
          <Layout.Section>
            <Banner tone="success" title="Plan updated">
              <Text as="p">
                Your plan has been updated to{" "}
                <strong>{upgradePlan?.toUpperCase() || "the new plan"}</strong>.
              </Text>
            </Banner>
          </Layout.Section>
        ) : null}

        {upgradeStatus === "error" ? (
          <Layout.Section>
            <Banner tone="critical" title="Upgrade failed">
              <Text as="p">We couldn’t confirm your upgrade. Please try syncing again.</Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Plan & Billing
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Current plan: {plan.toUpperCase()}
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                {!isAtLeastPlan(plan, SubscriptionPlan.PRO) ? (
                  <Button variant="primary" onClick={() => handleUpgrade(SubscriptionPlan.PRO)}>
                    {getBillingButtonLabel(SubscriptionPlan.PRO) || "Upgrade to Pro"}
                  </Button>
                ) : null}
                {!isAtLeastPlan(plan, SubscriptionPlan.ULTRA) ? (
                  <Button variant="primary" onClick={() => handleUpgrade(SubscriptionPlan.ULTRA)}>
                    {getBillingButtonLabel(SubscriptionPlan.ULTRA) || "Upgrade to Ultra"}
                  </Button>
                ) : null}
                {isAtLeastPlan(plan, SubscriptionPlan.ULTRA) ? (
                  <Banner tone="success" title="You’re on the top plan">
                    <Text as="p">All features are unlocked.</Text>
                  </Banner>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {!canUseSettings ? (
          <Layout.Section>
            <Banner tone="warning" title="Upgrade required">
              <Text as="p">
                Settings are available on the Pro and Ultra plans.
              </Text>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <div
              className={!canUseSettings ? "bainners-disabled" : undefined}
              aria-disabled={!canUseSettings}
            >
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Banner configuration
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  These defaults apply to newly created banners.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Banner
                </Text>
                <ColorField
                  label="Background color"
                  value={state.bannerBackgroundColor}
                  onChange={(value) => setState((prev) => ({ ...prev, bannerBackgroundColor: value }))}
                />
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Typography
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Title size"
                    options={SIZE_OPTIONS}
                    value={state.titleFontSize}
                    onChange={(value) => setState((prev) => ({ ...prev, titleFontSize: value }))}
                  />
                  <ColorField
                    label="Title color"
                    value={state.titleColor}
                    onChange={(value) => setState((prev) => ({ ...prev, titleColor: value }))}
                  />
                </InlineStack>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Description size"
                    options={SIZE_OPTIONS}
                    value={state.descriptionFontSize}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, descriptionFontSize: value }))
                    }
                  />
                  <ColorField
                    label="Description color"
                    value={state.descriptionColor}
                    onChange={(value) => setState((prev) => ({ ...prev, descriptionColor: value }))}
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Announcement defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Layout"
                    options={ANNOUNCEMENT_LAYOUT_OPTIONS}
                    value={state.announcementLayout}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementLayout: value }))
                    }
                  />
                  <TextField
                    label="Content spacing (px)"
                    type="number"
                    value={String(state.announcementContentSpacing ?? 12)}
                    onChange={(value) =>
                      setState((prev) => ({
                        ...prev,
                        announcementContentSpacing: Number(value || 12),
                      }))
                    }
                    min={0}
                    step={1}
                  />
                </InlineStack>
                <InlineStack gap="300" align="start">
                  <Checkbox
                    label="Show text"
                    checked={Boolean(state.announcementShowText)}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementShowText: value }))
                    }
                  />
                  <Checkbox
                    label="Show CTA"
                    checked={Boolean(state.announcementShowCta)}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementShowCta: value }))
                    }
                  />
                  <Checkbox
                    label="Show coupon"
                    checked={Boolean(state.announcementShowCoupon)}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementShowCoupon: value }))
                    }
                  />
                </InlineStack>
                <InlineStack gap="300" align="start">
                  <ColorField
                    label="Coupon text color"
                    value={state.announcementCouponTextColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementCouponTextColor: value }))
                    }
                  />
                  <ColorField
                    label="Coupon border"
                    value={state.announcementCouponBorderColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementCouponBorderColor: value }))
                    }
                  />
                  <ColorField
                    label="Coupon background"
                    value={state.announcementCouponBackgroundColor}
                    onChange={(value) =>
                      setState((prev) => ({
                        ...prev,
                        announcementCouponBackgroundColor: value,
                      }))
                    }
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  CTA defaults
                </Text>
                <Select
                  label="CTA style"
                  options={[
                    { label: "Button", value: "button" },
                    { label: "Link", value: "link" },
                  ]}
                  value={state.ctaStyle || "button"}
                  onChange={(value) => setState((prev) => ({ ...prev, ctaStyle: value }))}
                />
                <InlineStack gap="300" align="start">
                  <ColorField
                    label="CTA text color"
                    value={state.ctaTextColor}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaTextColor: value }))}
                  />
                  {state.ctaStyle !== "link" ? (
                    <>
                      <ColorField
                        label="CTA background"
                        value={state.ctaBackgroundColor}
                        onChange={(value) =>
                          setState((prev) => ({ ...prev, ctaBackgroundColor: value }))
                        }
                      />
                      <ColorField
                        label="CTA border"
                        value={state.ctaBorderColor}
                        onChange={(value) =>
                          setState((prev) => ({ ...prev, ctaBorderColor: value }))
                        }
                      />
                    </>
                  ) : null}
                </InlineStack>
                <InlineStack gap="300" align="start">
                  {state.ctaStyle !== "link" ? (
                    <>
                      <Checkbox
                        label="Bordered"
                        checked={state.ctaBordered}
                        onChange={(value) =>
                          setState((prev) => ({ ...prev, ctaBordered: value }))
                        }
                      />
                      <Checkbox
                        label="Rounded"
                        checked={state.ctaRounded}
                        onChange={(value) =>
                          setState((prev) => ({ ...prev, ctaRounded: value }))
                        }
                      />
                      <Checkbox
                        label="Shadow"
                        checked={state.ctaShadow}
                        onChange={(value) => setState((prev) => ({ ...prev, ctaShadow: value }))}
                      />
                    </>
                  ) : (
                    <Checkbox
                      label="Underline"
                      checked={Boolean(state.ctaUnderline)}
                      onChange={(value) =>
                        setState((prev) => ({ ...prev, ctaUnderline: value }))
                      }
                    />
                  )}
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Timezone
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Used for scheduled banners/items and countdowns.
                </Text>
                <Select
                  label="Timezone"
                  options={timezoneOptions}
                  value={state.countdownTimezone || "UTC"}
                  onChange={(value) =>
                    setState((prev) => ({ ...prev, countdownTimezone: value }))
                  }
                />
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Countdown defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Countdown style"
                    options={COUNTDOWN_STYLE_OPTIONS}
                    value={state.countdownStyle}
                    onChange={(value) => setState((prev) => ({ ...prev, countdownStyle: value }))}
                  />
                  <Select
                    label="Countdown size"
                    options={SIZE_OPTIONS}
                    value={state.countdownFontSize || "md"}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, countdownFontSize: value }))
                    }
                  />
                  <ColorField
                    label="Countdown text"
                    value={state.countdownTextColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, countdownTextColor: value }))
                    }
                  />
                  <ColorField
                    label="Countdown background"
                    value={state.countdownBackgroundColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, countdownBackgroundColor: value }))
                    }
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Slider defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Arrow style"
                    options={ARROW_STYLE_OPTIONS}
                    value={state.sliderArrowStyle}
                    onChange={(value) => setState((prev) => ({ ...prev, sliderArrowStyle: value }))}
                  />
                  <ColorField
                    label="Arrow color"
                    value={state.sliderArrowColor}
                    onChange={(value) => setState((prev) => ({ ...prev, sliderArrowColor: value }))}
                  />
                  <ColorField
                    label="Bullet color"
                    value={state.sliderBulletColor}
                    onChange={(value) => setState((prev) => ({ ...prev, sliderBulletColor: value }))}
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Announcement defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Checkbox
                    label="Closable"
                    checked={state.announcementClosable}
                    onChange={(value) => setState((prev) => ({ ...prev, announcementClosable: value }))}
                  />
                  <Checkbox
                    label="Marquee"
                    checked={state.announcementMarquee}
                    onChange={(value) => setState((prev) => ({ ...prev, announcementMarquee: value }))}
                  />
                  <Select
                    label="Animation"
                    options={ANIMATION_OPTIONS}
                    value={state.announcementAnimation}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementAnimation: value }))
                    }
                  />
                  <ColorField
                    label="Close color"
                    value={state.announcementCloseColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementCloseColor: value }))
                    }
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Translations
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Customize the few labels shown on the storefront.
                </Text>
                <InlineStack gap="300" align="start">
                  <TextField
                    label="Coupon copied message"
                    value={state.translationCouponCopied}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, translationCouponCopied: value }))
                    }
                    disabled={!canUseTranslations}
                  />
                  <TextField
                    label="Days"
                    value={state.translationDays}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, translationDays: value }))
                    }
                    disabled={!canUseTranslations}
                  />
                  <TextField
                    label="Hours"
                    value={state.translationHours}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, translationHours: value }))
                    }
                    disabled={!canUseTranslations}
                  />
                </InlineStack>
                <InlineStack gap="300" align="start">
                  <TextField
                    label="Minutes"
                    value={state.translationMinutes}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, translationMinutes: value }))
                    }
                    disabled={!canUseTranslations}
                  />
                  <TextField
                    label="Seconds"
                    value={state.translationSeconds}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, translationSeconds: value }))
                    }
                    disabled={!canUseTranslations}
                  />
                </InlineStack>
              </BlockStack>

              <InlineStack align="end">
                <Button
                  onClick={save}
                  variant="primary"
                  loading={fetcher.state !== "idle"}
                  disabled={!canUseSettings}
                >
                  Save settings
                </Button>
              </InlineStack>
            </BlockStack>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Metaobjects
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                If your banner selector gets out of sync, refresh the metaobjects here.
              </Text>
              <InlineStack gap="200" align="start">
                <Button
                  loading={syncFetcher.state !== "idle"}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("action", "sync-metaobjects");
                    syncFetcher.submit(formData, { method: "post" });
                  }}
                >
                  Sync metaobjects
                </Button>
                {syncFetcher.data?.success ? (
                  <Text as="span" variant="bodySm" tone="success">
                    Synced
                  </Text>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <Modal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Complete Your Upgrade"
        primaryAction={{
          content: "Sync My Plan",
          loading: syncPlanFetcher.state === "submitting",
          onAction: () => {
            const formData = new FormData();
            formData.append("intent", "sync-plan");
            syncPlanFetcher.submit(formData, { method: "post" });
          },
        }}
        secondaryActions={[
          {
            content: "I'll do this later",
            onAction: () => setShowSyncModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              A new tab has opened with Shopify's billing page. Please complete your plan upgrade
              there, then sync your plan here.
            </Text>
            <List type="number">
              <List.Item>Select your desired plan</List.Item>
              <List.Item>Confirm the subscription</List.Item>
              <List.Item>Return here and click "Sync My Plan"</List.Item>
            </List>
            <Banner tone="info">
              <p>
                <strong>Note:</strong> If you’ve already completed the upgrade in Shopify, click
                “Sync My Plan” to activate your new features immediately.
              </p>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
