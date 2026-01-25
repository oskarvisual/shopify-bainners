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
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { BannerCreateModal } from "../components/BannerCreateModal";

const METAOBJECT_TYPE = "bainners_banner";

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

async function syncBannerMetaobject(admin: any, banner: { id: string; title: string; status: string }) {
  if (!admin) return;
  const query = `banner_id:${banner.id}`;
  let existingId: string | null = null;
  try {
    const lookup = await admin.graphql(
      `
      query FindMetaobject($type: String!, $query: String!) {
        metaobjects(first: 1, type: $type, query: $query) {
          nodes {
            id
          }
        }
      }
      `,
      { variables: { type: METAOBJECT_TYPE, query } }
    );
    const json = await lookup.json();
    existingId = json?.data?.metaobjects?.nodes?.[0]?.id || null;
  } catch (error) {
    console.warn("Failed to lookup metaobject", error);
  }

  const fields = [
    { key: "banner_id", value: banner.id },
    { key: "title", value: banner.title },
    { key: "status", value: banner.status },
  ];

  try {
    if (existingId) {
      await admin.graphql(
        `
        mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
        `,
        { variables: { id: existingId, metaobject: { fields } } }
      );
    } else {
      await admin.graphql(
        `
        mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
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
            metaobject: {
              type: METAOBJECT_TYPE,
              handle: `banner-${banner.id}`,
              fields,
            },
          },
        }
      );
    }
  } catch (error) {
    console.warn("Failed to upsert metaobject", error);
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

  if (shopRecord) {
    const activeBanners = await db.banner.findMany({
      where: { shopId: shopRecord.id, status: "active" },
      select: { id: true, title: true, status: true },
    });
    await Promise.all(activeBanners.map((banner) => syncBannerMetaobject(admin, banner)));
  }

  const totalBanners = shopRecord?.banners.length || 0;
  const totalImages = shopRecord?.images.length || 0;
  const storageUsedGB = shopRecord?.storageUsedGB || 0;
  const storageLimitGB = shopRecord?.storageLimitGB || 1;
  const showSetupGuide = !shopRecord?.setupGuideDismissedAt;

  return json({
    shop,
    stats: {
      totalBanners,
      totalImages,
      storageUsedGB,
      storageLimitGB,
      plan: shopRecord?.plan || "free",
    },
    showSetupGuide,
    recentBanners:
      shopRecord?.banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        status: banner.status,
        updatedAt: banner.updatedAt.toISOString(),
      })) || [],
  });
};

export default function Index() {
  const { stats, recentBanners, showSetupGuide } = useLoaderData<typeof loader>();
  const location = useLocation();
  const editSearch = location.search || "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createParams = new URLSearchParams(location.search);
  createParams.set("modal", "1");
  const createBannerAction = `/app/banners/new?${createParams.toString()}`;

  const storagePercentage = (stats.storageUsedGB / stats.storageLimitGB) * 100;
  const isStorageHigh = storagePercentage >= 80;

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
                    Get started by installing the Q&A blocks on your product pages.
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
          <InlineStack gap="300">
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
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
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
                    <InlineStack key={banner.id} align="space-between">
                      <BlockStack gap="50">
                        <Link
                          to={`/app/banners/${banner.id}/edit${editSearch}`}
                          className="bainners-link-title"
                        >
                          {banner.title}
                        </Link>
                        <Text as="p" variant="bodySm">
                          Updated {new Date(banner.updatedAt).toLocaleString()}
                        </Text>
                      </BlockStack>
                      <Badge tone={banner.status === "active" ? "success" : "info"}>
                        {banner.status}
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <BannerCreateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        actionUrl={createBannerAction}
        submitWithFetcher
      />
    </Page>
  );
}
