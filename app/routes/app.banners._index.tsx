import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  useLoaderData,
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "@remix-run/react";
import { Page, Layout, Card, EmptyState, Button, Badge, Icon, Select, InlineStack, BlockStack } from "@shopify/polaris";
import { useState } from "react";
import { PlusIcon, ImageIcon, MegaphoneIcon, PlayCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlanStorageLimitGB } from "../utils/storage.server";
import { BannerCreateModal } from "../components/BannerCreateModal";
import { DEFAULT_SHOP_DEFAULTS } from "../utils/defaults.server";

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

async function syncAllBannerMetaobjects(admin: any, shopId: string) {
  if (!admin) return;

  await ensureBannerMetaobjectDefinition(admin);

  // 1. Delete ALL existing metaobjects
  try {
    const allMetaResponse = await admin.graphql(
      `query { metaobjects(first: 250, type: "${METAOBJECT_TYPE}") { nodes { id } } }`
    );
    const allMetaJson = await allMetaResponse.json();
    const existingMetaobjects = allMetaJson?.data?.metaobjects?.nodes || [];

    for (const meta of existingMetaobjects) {
      await admin.graphql(
        `mutation { metaobjectDelete(id: "${meta.id}") { deletedId } }`
      );
    }
  } catch (error) {
    console.error("[syncAllBannerMetaobjects] Failed to delete existing metaobjects:", error);
  }

  // 2. Get all active banners
  const activeBanners = await db.banner.findMany({
    where: { shopId, status: "active" },
    select: {
      id: true,
      title: true,
      status: true,
      bannerItems: {
        orderBy: { displayOrder: "asc" },
        take: 1,
        select: {
          image: { select: { storageUrl: true } },
          externalImageUrl: true,
          tags: true,
        },
      },
    },
  });

  // 3. Create metaobjects for all active banners
  for (const banner of activeBanners) {
    const firstItem = banner.bannerItems[0];
    let thumbnail = "";

    if (firstItem) {
      const itemTags = (firstItem.tags as Record<string, any> | null) || {};
      if (itemTags.mediaType === "video") {
        const provider = itemTags.videoProvider;
        const videoId = itemTags.videoId;
        if (provider === "youtube" && videoId) {
          thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        } else if (provider === "vimeo" && videoId) {
          thumbnail = `https://vumbnail.com/${videoId}.jpg`;
        }
      } else {
        thumbnail = firstItem.image?.storageUrl || firstItem.externalImageUrl || "";
      }
    }

    const fields = [
      { key: "banner_id", value: banner.id },
      { key: "title", value: banner.title },
      { key: "status", value: banner.status },
      { key: "thumbnail", value: thumbnail },
    ];

    try {
      const createResponse = await admin.graphql(
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
      const createJson = await createResponse.json();
      if (createJson?.data?.metaobjectCreate?.userErrors?.length > 0) {
        console.error("[syncAllBannerMetaobjects] Create error for", banner.title, ":", createJson.data.metaobjectCreate.userErrors);
      }
    } catch (error) {
      console.error("[syncAllBannerMetaobjects] Failed to create metaobject for", banner.title, ":", error);
    }
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const sortBy = url.searchParams.get("sortBy") || "updatedAt";

  const shop = session?.shop || shopParam;
  if (!shop) {
    throw new Error("Could not determine shop domain");
  }

  // Determine sort order
  let orderBy: any = { updatedAt: "desc" };
  if (sortBy === "createdAt") {
    orderBy = { createdAt: "desc" };
  } else if (sortBy === "updatedAt") {
    orderBy = { updatedAt: "desc" };
  }

  // Get or create shop record
  let shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
    include: {
      banners: {
        orderBy,
        where: { status: { not: "archived" } },
        include: {
          bannerItems: {
            include: {
              image: true,
            },
          },
        },
      },
    },
  });

  if (!shopRecord) {
    shopRecord = await db.shop.create({
      data: {
        shopDomain: shop,
        plan: "free",
        storageLimitGB: getPlanStorageLimitGB("free"),
        ...DEFAULT_SHOP_DEFAULTS,
      },
      include: {
        banners: {
          orderBy,
          include: {
            bannerItems: {
              include: {
                image: true,
              },
            },
          },
        },
      },
    });
  }

  let banners = shopRecord.banners.map((banner) => {
    const firstItem = banner.bannerItems[0];
    const itemTags = (firstItem?.tags as Record<string, any> | null) || {};
    let thumbnailUrl = "";

    if (firstItem) {
      if (itemTags.mediaType === "video") {
        const provider = itemTags.videoProvider;
        const videoId = itemTags.videoId;
        if (provider === "youtube" && videoId) {
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        } else if (provider === "vimeo" && videoId) {
          thumbnailUrl = `https://vumbnail.com/${videoId}.jpg`;
        }
      } else {
        thumbnailUrl = firstItem.image?.storageUrl || firstItem.externalImageUrl || "";
      }
    }

    return {
      id: banner.id,
      title: banner.title,
      status: banner.status,
      layout: banner.layout,
      imageCount: banner.bannerItems.length,
      scheduledStartAt: banner.scheduledStartAt
        ? banner.scheduledStartAt.toISOString()
        : "",
      scheduledEndAt: banner.scheduledEndAt ? banner.scheduledEndAt.toISOString() : "",
      image: thumbnailUrl
        ? {
            url: thumbnailUrl,
            width: firstItem?.image?.width || 1920,
            height: firstItem?.image?.height || 1080,
          }
        : null,
      hasVideo: itemTags.mediaType === "video",
      createdAt: banner.createdAt.toISOString(),
      updatedAt: banner.updatedAt.toISOString(),
    };
  });

  // Sort by imageCount if needed (can't do in Prisma directly)
  if (sortBy === "imageCount") {
    banners = banners.sort((a, b) => b.imageCount - a.imageCount);
  }

  return json({
    shop: shopRecord.shopDomain,
    banners,
    sortBy,
    plan: shopRecord.plan || "free",
  });
}

export async function action({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;

  const shop = session?.shop || shopParam;
  if (!shop) {
    throw new Error("Could not determine shop domain");
  }

  const formData = await request.formData();
  const action = formData.get("action");

  // Delete banner
  if (action === "delete") {
    const bannerId = formData.get("bannerId") as string;

    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    const deleted = await db.banner.deleteMany({
      where: { id: bannerId, shopId: shopRecord.id },
    });

    if (deleted.count === 0) {
      return json({ success: false, error: "Banner not found" }, { status: 404 });
    }

    // Sync metaobjects after deleting banner
    await syncAllBannerMetaobjects(admin, shopRecord.id);

    return json({ success: true });
  }

  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function BannersIndex() {
  const { banners, sortBy, plan } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editSearch = location.search || "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createParams = new URLSearchParams(location.search);
  createParams.set("modal", "1");
  const createBannerAction = `/app/banners/new?${createParams.toString()}`;

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sortBy", value);
    navigate(`?${params.toString()}`);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, "success" | "info" | "warning"> = {
      active: "success",
      draft: "info",
      archived: "warning",
    };
    return <Badge tone={statusMap[status] || "info"}>{status}</Badge>;
  };
  const nowTimestamp = Date.now();
  const isWithinSchedule = (start?: string, end?: string) => {
    const startTime = start ? new Date(start).getTime() : null;
    const endTime = end ? new Date(end).getTime() : null;
    if (startTime && nowTimestamp < startTime) return false;
    if (endTime && nowTimestamp > endTime) return false;
    return true;
  };

  return (
    <Page title="Banners">
      <Layout>
        {banners.length > 0 && (
          <Layout.Section>
            <InlineStack align="space-between" blockAlign="center">
              <div style={{ maxWidth: "220px" }}>
                <Select
                  label="Sort by"
                  labelHidden
                  options={[
                    { label: "Last Modified", value: "updatedAt" },
                    { label: "Date Created", value: "createdAt" },
                    { label: "Number of Images", value: "imageCount" },
                  ]}
                  value={sortBy}
                  onChange={handleSortChange}
                />
              </div>
              <Button variant="primary" icon={PlusIcon} onClick={() => setIsCreateOpen(true)}>
                Create Banner
              </Button>
            </InlineStack>
          </Layout.Section>
        )}

        {/* Banners List */}
        <Layout.Section>
          {banners.length === 0 ? (
            <Card>
              <EmptyState
                heading="Create your first banner"
                action={{
                  content: "Create Banner",
                  onAction: () => setIsCreateOpen(true),
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Start creating beautiful AI-powered banners for your store. Generate with AI,
                  upload your own images, or use product images from Shopify.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
                      <th style={{ padding: "12px", textAlign: "left", width: "80px" }}>Image</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Title</th>
                      <th style={{ padding: "12px", textAlign: "left", width: "120px" }}>Status</th>
                      <th style={{ padding: "12px", textAlign: "left", width: "120px" }}>Layout</th>
                      <th style={{ padding: "12px", textAlign: "left", width: "100px" }}>Images</th>
                      <th style={{ padding: "12px", textAlign: "left", width: "150px" }}>
                        Updated
                      </th>
                      <th style={{ padding: "12px", textAlign: "right", width: "100px" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {banners.map((banner) => (
                      <tr
                        key={banner.id}
                        style={{
                          borderBottom: "1px solid #e0e0e0",
                        }}
                      >
                        <td style={{ padding: "12px" }}>
                          {banner.image ? (
                            <img
                              src={banner.image.url || ""}
                              alt={banner.title}
                              style={{
                                width: "60px",
                                height: "60px",
                                objectFit: "cover",
                                borderRadius: "4px",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "60px",
                                height: "60px",
                                backgroundColor: "#f6f6f7",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon
                                source={
                                  banner.layout === "announcement"
                                    ? MegaphoneIcon
                                    : banner.hasVideo
                                    ? PlayCircleIcon
                                    : ImageIcon
                                }
                                tone="base"
                              />
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <BlockStack gap="100" inlineAlign="start">
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
                              <Badge tone="critical">Scheduled (hidden)</Badge>
                            ) : null}
                          </BlockStack>
                        </td>
                        <td style={{ padding: "12px" }}>{getStatusBadge(banner.status)}</td>
                        <td style={{ padding: "12px" }}>
                          {banner.layout.replace("_", " ")}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <Badge tone="info">{banner.imageCount}</Badge>
                        </td>
                        <td style={{ padding: "12px", color: "#6d7175", fontSize: "14px" }}>
                          {new Date(banner.updatedAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <Link to={`/app/banners/${banner.id}/edit${editSearch}`}>
                              <Button size="slim">Edit</Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Layout.Section>
      </Layout>
      <BannerCreateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        actionUrl={createBannerAction}
        submitWithFetcher
        plan={plan}
      />
    </Page>
  );
}
