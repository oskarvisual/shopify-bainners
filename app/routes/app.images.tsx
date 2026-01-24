import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useLocation } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { deleteImageFromS3 } from "../utils/automation.server";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Modal,
  Page,
  Text,
  Thumbnail,
  Banner as PolarisBanner,
  Icon,
  ButtonGroup,
} from "@shopify/polaris";
import { SearchIcon, AppsIcon, SearchListIcon } from "@shopify/polaris-icons";
import { BannerCreateModal } from "../components/BannerCreateModal";

const PAGE_SIZE = 24;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ images: [], nextCursor: null });
  }

  const cursor = url.searchParams.get("cursor");

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return json({ images: [], nextCursor: null, storageUsedGB: 0, storageLimitGB: 1 });
  }

  const images = await db.image.findMany({
    where: { shopId: shopRecord.id },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    ...(cursor
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
  });

  const nextCursor = images.length === PAGE_SIZE ? images[images.length - 1].id : null;

  return json({
    images: images.map((image) => ({
      id: image.id,
      filename: image.filename,
      storageUrl: image.storageUrl,
      sizeInMB: image.sizeInMB,
      sourceType: image.sourceType,
      createdAt: image.createdAt.toISOString(),
    })),
    nextCursor,
    storageUsedGB: shopRecord.storageUsedGB,
    storageLimitGB: shopRecord.storageLimitGB,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ success: false, error: "Missing shop domain" }, { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  if (action !== "delete") {
    return json({ success: false, error: "Invalid action" }, { status: 400 });
  }

  const imageId = formData.get("imageId") as string;
  if (!imageId) {
    return json({ success: false, error: "Missing imageId" }, { status: 400 });
  }

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  const image = await db.image.findFirst({
    where: { id: imageId, shopId: shopRecord.id },
    include: { bannerItems: true },
  });

  if (!image) {
    return json({ success: false, error: "Image not found" }, { status: 404 });
  }

  if (image.bannerItems.length > 0) {
    return json(
      { success: false, error: "Image is in use by a banner. Remove it first." },
      { status: 400 }
    );
  }

  const deleteResult = await deleteImageFromS3({
    shop,
    filename: image.filename,
  });

  if (!deleteResult.success) {
    return json({ success: false, error: deleteResult.error }, { status: 500 });
  }

  await db.$transaction([
    db.image.delete({ where: { id: image.id } }),
    db.shop.update({
      where: { id: shopRecord.id },
      data: { storageUsedGB: { decrement: image.sizeInMB / 1024 } },
    }),
  ]);

  return json({ success: true });
}

export default function ImageGallery() {
  const { images, nextCursor, storageUsedGB, storageLimitGB } = useLoaderData<typeof loader>();
  const loadMoreFetcher = useFetcher<typeof loader>();
  const deleteFetcher = useFetcher<typeof action>();
  const location = useLocation();
  const createParams = new URLSearchParams(location.search);
  createParams.set("modal", "1");
  const createBannerAction = `/app/banners/new?${createParams.toString()}`;
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [items, setItems] = useState(images);
  const [cursor, setCursor] = useState(nextCursor);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedImage, setSelectedImage] = useState<typeof images[number] | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (loadMoreFetcher.data?.images) {
      setItems((current) => [...current, ...loadMoreFetcher.data.images]);
      setCursor(loadMoreFetcher.data.nextCursor);
    }
  }, [loadMoreFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.data) {
      if (deleteFetcher.data.success) {
        const deletedId = deleteFetcher.formData?.get("imageId") as string;
        if (deletedId) {
          setItems((current) => current.filter((image) => image.id !== deletedId));
          setDeleteSuccess(true);
        }
      } else if (deleteFetcher.data.error) {
        setDeleteError(deleteFetcher.data.error);
      }
    }
  }, [deleteFetcher.data, deleteFetcher.formData]);

  const isLoadingMore = loadMoreFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";

  const handleLoadMore = () => {
    if (cursor) {
      loadMoreFetcher.load(`/app/images?cursor=${cursor}`);
    }
  };

  const galleryLabel = useMemo(() => {
    return `${items.length} image${items.length === 1 ? "" : "s"}`;
  }, [items.length]);

  const storagePercentage = (storageUsedGB / storageLimitGB) * 100;

  const openDetails = (image: typeof items[number]) => {
    setSelectedImage(image);
    setDetailsOpen(true);
  };

  return (
    <Page title="Image Gallery">
      <BlockStack gap="300">
        {deleteError && (
          <PolarisBanner tone="critical" title="Failed to delete image" onDismiss={() => setDeleteError(null)}>
            <p>{deleteError}</p>
          </PolarisBanner>
        )}
        {deleteSuccess && (
          <PolarisBanner tone="success" title="Image deleted successfully" onDismiss={() => setDeleteSuccess(false)} />
        )}
        <Card>
        <BlockStack gap="300">
          {/* Storage Usage */}
          <div style={{ padding: "4px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span>Storage Usage</span>
              <span>
                {storageUsedGB.toFixed(2)} GB / {storageLimitGB} GB
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "#e0e0e0",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(storagePercentage, 100)}%`,
                  height: "100%",
                  backgroundColor: storagePercentage >= 80 ? "#d72c0d" : "#0084C6",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {items.length > 0 && (
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm">
                {galleryLabel}
              </Text>
              <ButtonGroup>
                <Button
                  icon={SearchListIcon}
                  pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  List
                </Button>
                <Button
                  icon={AppsIcon}
                  pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </Button>
              </ButtonGroup>
            </InlineStack>
          )}
          {items.length === 0 ? (
            <EmptyState
              heading="No images in your gallery"
              action={{
                content: "Create Banner",
                onAction: () => setIsCreateOpen(true),
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Upload images by creating banners. Generate with AI, upload your own, or use
                product images from Shopify.
              </p>
            </EmptyState>
          ) : (
            <>
              <>
                {viewMode === "list" && (
                  <BlockStack gap="300">
                    {items.map((image) => (
                      <Card key={image.id} padding="400">
                        <InlineStack gap="400" align="start" blockAlign="center">
                          <button
                            type="button"
                            className="bainners-image-thumb"
                            onClick={() => openDetails(image)}
                          >
                            <img src={image.storageUrl} alt={image.filename} />
                            <span className="bainners-image-overlay">
                              <Icon source={SearchIcon} tone="base" />
                            </span>
                          </button>
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="p" variant="bodyMd">
                                {image.filename}
                              </Text>
                              <Badge tone="info">{image.sourceType}</Badge>
                            </InlineStack>
                            <Text as="p" variant="bodySm">
                              Size: {image.sizeInMB.toFixed(2)} MB
                            </Text>
                            <div style={{ alignSelf: "flex-start" }}>
                              <Button size="slim" onClick={() => openDetails(image)}>
                                View
                              </Button>
                            </div>
                          </BlockStack>
                        </InlineStack>
                      </Card>
                    ))}
                  </BlockStack>
                )}
                {viewMode === "grid" && (
                  <div className="bainners-gallery-grid">
                    {items.map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        className="bainners-gallery-item"
                        onClick={() => openDetails(image)}
                      >
                        <img src={image.storageUrl} alt={image.filename} />
                        <span className="bainners-image-overlay">
                          <Icon source={SearchIcon} tone="base" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
              {cursor && (
                <Button onClick={handleLoadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? "Loading..." : "Load More"}
                </Button>
              )}
            </>
          )}
        </BlockStack>
        </Card>
      </BlockStack>
      <BannerCreateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        actionUrl={createBannerAction}
        submitWithFetcher
      />
      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={selectedImage?.filename || "Image details"}
        size="large"
      >
        <Modal.Section>
          {selectedImage && (
            <BlockStack gap="200">
              <div className="bainners-modal-image">
                <img src={selectedImage.storageUrl} alt={selectedImage.filename} />
              </div>
              <Text as="p" variant="bodySm">
                Size: {selectedImage.sizeInMB.toFixed(2)} MB
              </Text>
              <Text as="p" variant="bodySm">
                Uploaded: {new Date(selectedImage.createdAt).toLocaleString()}
              </Text>
              <Text as="p" variant="bodySm">
                Source: {selectedImage.sourceType}
              </Text>
              <InlineStack align="start">
                <deleteFetcher.Form method="post">
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="imageId" value={selectedImage.id} />
                  <Button submit tone="critical" disabled={isDeleting}>
                    Delete image
                  </Button>
                </deleteFetcher.Form>
              </InlineStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
