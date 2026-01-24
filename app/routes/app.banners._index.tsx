import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  useLoaderData,
  Link,
  useFetcher,
  useNavigate,
  useSearchParams,
  useLocation,
} from "@remix-run/react";
import { Page, Layout, Card, EmptyState, Button, Badge, Icon, Select, InlineStack } from "@shopify/polaris";
import { useState } from "react";
import { PlusIcon, ImageIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlanStorageLimitGB } from "../utils/storage.server";
import { BannerCreateModal } from "../components/BannerCreateModal";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

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
    const selectedItem = banner.bannerItems.find((item) => item.isSelected);
    return {
      id: banner.id,
      title: banner.title,
      status: banner.status,
      layout: banner.layout,
      imageCount: banner.bannerItems.length,
      image: selectedItem
        ? {
            url: selectedItem.image?.storageUrl || selectedItem.externalImageUrl || "",
            width: selectedItem.image?.width || 1920,
            height: selectedItem.image?.height || 1080,
          }
        : null,
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

    await db.banner.delete({
      where: { id: bannerId, shopId: shopRecord.id },
    });

    return json({ success: true });
  }

  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function BannersIndex() {
  const { banners, sortBy } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editSearch = location.search || "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createParams = new URLSearchParams(location.search);
  createParams.set("modal", "1");
  const createBannerAction = `/app/banners/new?${createParams.toString()}`;

  const handleDelete = (bannerId: string) => {
    if (confirm("Are you sure you want to delete this banner?")) {
      fetcher.submit(
        {
          action: "delete",
          bannerId,
        },
        { method: "post" }
      );
    }
  };

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
                              <Icon source={ImageIcon} tone="base" />
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <Link
                            to={`/app/banners/${banner.id}/edit${editSearch}`}
                            className="bainners-link-title"
                          >
                            {banner.title}
                          </Link>
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
      />
    </Page>
  );
}
