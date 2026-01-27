import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useLocation } from "@remix-run/react";
import { useState } from "react";
import {
  Banner,
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Modal,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { BannerCreateModal } from "../components/BannerCreateModal";
import { AnalyticsLineChart } from "../components/AnalyticsLineChart";
import { DEFAULT_SHOP_DEFAULTS } from "../utils/defaults.server";

const METAOBJECT_TYPE = "bainners_banner";
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

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function ensureBannerMetaobjectDefinition(admin: any) {
  try {
    const existing = await admin.graphql(
      `
      query GetDefinition($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
        }
      }
      `,
      { variables: { type: METAOBJECT_TYPE } }
    );
    const existingJson = await existing.json();
    if (existingJson?.data?.metaobjectDefinitionByType?.id) {
      return;
    }
  } catch (error) {
    console.warn("Failed to check metaobject definition", error);
  }

  try {
    const response = await admin.graphql(
      `
      mutation CreateDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          definition: {
            name: "Bainners Banner",
            type: METAOBJECT_TYPE,
            displayNameKey: "title",
            access: {
              storefront: "PUBLIC_READ",
            },
            fieldDefinitions: [
              {
                name: "Banner ID",
                key: "banner_id",
                type: "single_line_text_field",
                required: true,
              },
              {
                name: "Title",
                key: "title",
                type: "single_line_text_field",
                required: true,
              },
              {
                name: "Status",
                key: "status",
                type: "single_line_text_field",
                required: false,
              },
              {
                name: "Thumbnail",
                key: "thumbnail",
                type: "single_line_text_field",
                required: false,
              },
            ],
          },
        },
      }
    );
    const json = await response.json();
    if (json?.data?.metaobjectDefinitionCreate?.userErrors?.length) {
      console.warn("Metaobject definition errors", json.data.metaobjectDefinitionCreate.userErrors);
    }
  } catch (error) {
    console.warn("Failed to create metaobject definition", error);
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.clone().formData();
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ success: false, error: "Missing shop domain" }, { status: 400 });
  }

  const action = formData.get("action");

  if (action === "start-setup-guide") {
    const existingShop = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (existingShop) {
      await db.shop.update({
        where: { shopDomain: shop },
        data: { setupGuideDismissedAt: new Date() },
      });
    } else {
      await db.shop.create({
        data: {
          shopDomain: shop,
          plan: "free",
          storageLimitGB: 1,
          setupGuideDismissedAt: new Date(),
          ...DEFAULT_SHOP_DEFAULTS,
        },
      });
    }

    const redirectUrl = new URL("/app/setup-guide", request.url);
    redirectUrl.search = url.search;
    return redirect(redirectUrl.toString());
  }

  return json({ success: false }, { status: 400 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({
      shop: null,
      stats: { totalBanners: 0, totalImages: 0, storageUsedGB: 0 },
      recentBanners: [],
      analytics: { views: 0, clicks: 0, ctr: 0 },
      chart: [],
      planUpdated: false,
      updatedPlanName: null,
    });
  }

  await ensureBannerMetaobjectDefinition(admin);

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
    include: {
      banners: {
        orderBy: { updatedAt: "desc" },
        where: { status: { not: "archived" } },
        take: 5,
      },
      images: true,
    },
  });
  let planUpdated = false;
  let updatedPlanName: string | null = null;

  if (shopRecord) {
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

      if (detectedPlan !== shopRecord.plan) {
        await db.shop.update({
          where: { shopDomain: shop },
          data: { plan: detectedPlan },
        });
        planUpdated = true;
        updatedPlanName = detectedPlan;
      }
    } catch (error) {
      console.error("[DASHBOARD AUTO-SYNC] Error syncing plan:", error);
    }
  }

  const totalBanners = shopRecord?.banners.length || 0;
  const totalImages = shopRecord?.images.length || 0;
  const storageUsedGB = shopRecord?.storageUsedGB || 0;
  const storageLimitGB = shopRecord?.storageLimitGB || 1;
  const showSetupGuide = !shopRecord?.setupGuideDismissedAt;
  const analyticsTotals = { views: 0, clicks: 0, ctr: 0 };
  let chartData: Array<{ date: string; views: number; clicks: number }> = [];

  if (shopRecord) {
    const today = startOfDay(new Date());
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - 6);

    const dailyTotals = await db.bannerAnalytic.groupBy({
      by: ["date"],
      where: { shopId: shopRecord.id, date: { gte: startDate } },
      _sum: { views: true, clicks: true },
      orderBy: { date: "asc" },
    });

    const dailyMap = new Map(
      dailyTotals.map((row) => [
        row.date.toISOString().slice(0, 10),
        { views: row._sum.views || 0, clicks: row._sum.clicks || 0 },
      ])
    );

    for (let i = 0; i < 7; i += 1) {
      const day = new Date(startDate);
      day.setUTCDate(startDate.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      const values = dailyMap.get(key) || { views: 0, clicks: 0 };
      chartData.push({ date: key, views: values.views, clicks: values.clicks });
      analyticsTotals.views += values.views;
      analyticsTotals.clicks += values.clicks;
    }
    analyticsTotals.ctr =
      analyticsTotals.views > 0 ? (analyticsTotals.clicks / analyticsTotals.views) * 100 : 0;
  }

  return json({
    shop,
    stats: {
      totalBanners,
      totalImages,
      storageUsedGB,
      storageLimitGB,
      plan: shopRecord?.plan || "free",
    },
    analytics: analyticsTotals,
    chart: chartData,
    showSetupGuide,
    recentBanners:
      shopRecord?.banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        status: banner.status,
        updatedAt: banner.updatedAt.toISOString(),
        scheduledStartAt: banner.scheduledStartAt
          ? banner.scheduledStartAt.toISOString()
          : "",
        scheduledEndAt: banner.scheduledEndAt ? banner.scheduledEndAt.toISOString() : "",
      })) || [],
    planUpdated,
    updatedPlanName,
  });
};

export default function Index() {
  const {
    stats,
    recentBanners,
    showSetupGuide,
    analytics,
    chart,
    planUpdated,
    updatedPlanName,
  } = useLoaderData<typeof loader>();
  const location = useLocation();
  const editSearch = location.search || "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(Boolean(planUpdated));
  const createParams = new URLSearchParams(location.search);
  createParams.set("modal", "1");
  const createBannerAction = `/app/banners/new?${createParams.toString()}`;

  const storagePercentage = (stats.storageUsedGB / stats.storageLimitGB) * 100;
  const isStorageHigh = storagePercentage >= 80;
  const nowTimestamp = Date.now();
  const isWithinSchedule = (start?: string, end?: string) => {
    const startTime = start ? new Date(start).getTime() : null;
    const endTime = end ? new Date(end).getTime() : null;
    if (startTime && nowTimestamp < startTime) return false;
    if (endTime && nowTimestamp > endTime) return false;
    return true;
  };
  const showAdvancedAnalytics = stats.plan !== "free";

  return (
    <Page
      title="Dashboard"
      primaryAction={{ content: "Create Banner", onAction: () => setIsCreateOpen(true) }}
    >
      <Layout>
        {showSetupGuide ? (
          <Layout.Section>
            <Banner title="Welcome! Complete your setup" className="bainners-setup-banner">
              <Form method="post">
                <input type="hidden" name="action" value="start-setup-guide" />
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Get started by installing the bAInners blocks on your product pages.
                    Follow our step-by-step guide to complete the setup in just 5 minutes.
                  </Text>
                  <div className="bainners-setup-cta">
                    <Button submit variant="secondary">
                      Start setup guide
                    </Button>
                  </div>
                </BlockStack>
              </Form>
            </Banner>
          </Layout.Section>
        ) : null}
        <Layout.Section>
          <div className="bainners-dashboard-stats">
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingMd">
                  {stats.totalBanners}
                </Text>
                <Text as="p" variant="bodySm">
                  Total Banners
                </Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingMd">
                  {stats.totalImages}
                </Text>
                <Text as="p" variant="bodySm">
                  Images Stored
                </Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingMd" tone={isStorageHigh ? "critical" : undefined}>
                  {stats.storageUsedGB.toFixed(2)} GB / {stats.storageLimitGB} GB
                </Text>
                <Text as="p" variant="bodySm">
                  Storage Used
                </Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingMd">
                  {analytics.views}
                </Text>
                <Text as="p" variant="bodySm">
                  Total Views (last 7 days)
                </Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingMd">
                  {analytics.clicks}
                </Text>
                <Text as="p" variant="bodySm">
                  Total Clicks (last 7 days)
                </Text>
              </BlockStack>
            </Card>
            {showAdvancedAnalytics ? (
              <Card padding="400">
                <BlockStack gap="100">
                  <Text as="p" variant="headingMd">
                    {analytics.ctr.toFixed(2)}%
                  </Text>
                  <Text as="p" variant="bodySm">
                    Total CTR (last 7 days)
                  </Text>
                </BlockStack>
              </Card>
            ) : null}
          </div>
        </Layout.Section>

        <Layout.Section>
          <div className={`bainners-dashboard-grid${showAdvancedAnalytics ? "" : " bainners-dashboard-grid--single"}`}>
            {showAdvancedAnalytics ? (
              <Card>
                <BlockStack gap="300" className="bainners-dashboard-chart">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Views vs Clicks
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Last 7 days
                    </Text>
                  </InlineStack>
                  <AnalyticsLineChart data={chart} />
                </BlockStack>
              </Card>
            ) : null}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Recent Banners
                  </Text>
                  <Button url="/app/banners">View all</Button>
                </InlineStack>
                {recentBanners.length === 0 ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      No banners yet. Create your first banner to get started.
                    </Text>
                    <Button onClick={() => setIsCreateOpen(true)} variant="primary">
                      Create Banner
                    </Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="200">
                    {recentBanners.map((banner) => (
                      <InlineStack key={banner.id} align="space-between" blockAlign="start">
                        <BlockStack gap="50">
                          <Link
                            to={`/app/banners/${banner.id}/edit${editSearch}`}
                            className="bainners-link-title"
                          >
                            {banner.title}
                          </Link>
                          {banner.status === "active" &&
                          !isWithinSchedule(
                            banner.scheduledStartAt,
                            banner.scheduledEndAt
                          ) ? (
                            <div style={{ display: "inline-block" }}>
                              <Badge tone="critical">Scheduled (hidden)</Badge>
                            </div>
                          ) : null}
                          <Text as="p" variant="bodySm">
                            Updated {new Date(banner.updatedAt).toLocaleString()}
                          </Text>
                        </BlockStack>
                        <div style={{ display: "inline-flex" }}>
                          <Badge tone={banner.status === "active" ? "success" : "info"}>
                            {banner.status === "active" ? "Published" : "Draft"}
                          </Badge>
                        </div>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
      <Modal
        open={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        title="Plan updated"
        primaryAction={{
          content: "Got it",
          onAction: () => window.location.reload(),
        }}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">
              Your plan has been updated to{" "}
              <strong>{updatedPlanName?.toUpperCase() || "the new plan"}</strong>.
            </Text>
            <List type="bullet">
              <List.Item>Refresh the page to unlock new features.</List.Item>
              <List.Item>Visit Settings to review your plan.</List.Item>
            </List>
          </BlockStack>
        </Modal.Section>
      </Modal>
      <BannerCreateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        actionUrl={createBannerAction}
        submitWithFetcher
        plan={stats.plan}
      />
    </Page>
  );
}
