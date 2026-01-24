import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useFetcher, useLoaderData, useLocation } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormLayout,
  Icon,
  InlineStack,
  Layout,
  Modal,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
  Thumbnail,
  DropZone,
  Banner as PolarisBanner,
  Spinner,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import shopify, { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { dispatchImageAutomation, dispatchImageStatus } from "../utils/automation.server";
import { getPlanStorageLimitGB, getStorageUsageMB } from "../utils/storage.server";
import { InlineEditableText } from "../components/InlineEditableText";
import {
  ArrowLeftIcon,
  DeleteIcon,
  ImageIcon,
  ImageMagicIcon,
  UploadIcon,
  SearchIcon,
  ClipboardIcon,
  QuestionCircleIcon,
} from "@shopify/polaris-icons";

const APP_GALLERY_PAGE_SIZE = 12;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;
  const bannerId = params.bannerId;

  if (!bannerId) {
    throw new Error("Missing bannerId");
  }
  if (!shop) {
    throw new Error("Missing shop domain");
  }

  let shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    shopRecord = await db.shop.create({
      data: {
        shopDomain: shop,
        plan: "free",
        storageLimitGB: getPlanStorageLimitGB("free"),
      },
    });
  }

  const banner = await db.banner.findFirst({
    where: { id: bannerId, shopId: shopRecord.id },
    include: {
      bannerItems: {
        orderBy: { displayOrder: "asc" },
        include: {
          image: true,
        },
      },
    },
  });

  if (!banner) {
    throw new Error("Banner not found");
  }

  const analytics = await db.bannerAnalytic.aggregate({
    where: { bannerId: banner.id },
    _sum: { views: true, clicks: true },
  });

  const totalViews = analytics._sum.views || 0;
  const totalClicks = analytics._sum.clicks || 0;
  const totalCtr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

  const appImages = await db.image.findMany({
    where: { shopId: shopRecord.id },
    orderBy: { createdAt: "desc" },
    take: APP_GALLERY_PAGE_SIZE,
  });


  const appImagesNextCursor =
    appImages.length === APP_GALLERY_PAGE_SIZE ? appImages[appImages.length - 1].id : null;

  let shopifyProducts: Array<{
    id: string;
    title: string;
    handle?: string;
    status?: string;
    featuredImage?: { url: string; altText?: string };
    images: Array<{ id: string; url: string; width: number; height: number }>;
  }> = [];
  let productLoadError: string | null = null;
  let shopifyFiles: Array<{
    id: string;
    url: string;
    width: number;
    height: number;
    filename: string;
  }> = [];

  try {
    const productsResponse = await admin.graphql(
      `
        query getProducts($first: Int!) {
          products(first: $first) {
            nodes {
              id
              title
              handle
              status
              featuredImage {
                url
                altText
              }
              images(first: 20) {
                nodes {
                  id
                  url
                  width
                  height
                }
              }
            }
          }
        }
      `,
      { variables: { first: 50 } }
    );

    const { data } = await productsResponse.json();
    shopifyProducts =
      data?.products?.nodes?.map((product: any) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        featuredImage: product.featuredImage || undefined,
        images:
          product.images?.nodes?.map((image: any) => ({
            id: image.id,
            url: image.url,
            width: image.width || 1920,
            height: image.height || 1080,
          })) || [],
      })) || [];
  } catch (error) {
    productLoadError = error instanceof Error ? error.message : "Failed to load Shopify products";
    console.warn("Failed to load Shopify products", error);
  }

  try {
    const filesResponse = await admin.graphql(
      `
        query getFiles($first: Int!) {
          files(first: $first) {
            nodes {
              id
              alt
              fileStatus
              ... on MediaImage {
                image {
                  url
                  width
                  height
                }
              }
              preview {
                image {
                  url
                  width
                  height
                }
              }
            }
          }
        }
      `,
      { variables: { first: 50 } }
    );

    const { data } = await filesResponse.json();
    shopifyFiles =
      data?.files?.nodes
        ?.map((file: any) => {
          const url = file?.image?.url || file?.preview?.image?.url || "";
          if (!url) return null;
          return {
            id: file.id,
            url,
            width: file?.image?.width || file?.preview?.image?.width || 1920,
            height: file?.image?.height || file?.preview?.image?.height || 1080,
            filename: file?.alt || "Shopify file",
          };
        })
        .filter(Boolean) || [];
  } catch (error) {
    console.warn("Failed to load Shopify files", error);
  }

  const storageUsedMB = await getStorageUsageMB(shopRecord.id);

  return json({
    shop: shopRecord.shopDomain,
    plan: shopRecord.plan,
    storageUsedMB,
    storageLimitGB: shopRecord.storageLimitGB,
    banner: {
      id: banner.id,
      title: banner.title,
      descriptionInternal: banner.descriptionInternal || "",
      layout: banner.layout,
      sliderType: banner.sliderType || "slide",
      status: banner.status,
      customCss: banner.customCss || "",
      scheduledStartAt: banner.scheduledStartAt
        ? banner.scheduledStartAt.toISOString().slice(0, 16)
        : "",
      scheduledEndAt: banner.scheduledEndAt
        ? banner.scheduledEndAt.toISOString().slice(0, 16)
        : "",
    },
    bannerItems: banner.bannerItems.map((item) => ({
      id: item.id,
      title: item.title || banner.title,
      description: item.description || banner.descriptionInternal || "",
      imageUrl: item.image?.storageUrl || item.externalImageUrl || "",
      imageId: item.imageId || null,
      externalImageUrl: item.externalImageUrl || null,
      sourceType: item.image?.sourceType || (item.externalImageUrl ? "shopify" : "unknown"),
      sizeInMB: item.image?.sizeInMB || 0,
      isSelected: item.isSelected,
      tags: item.tags || {},
      createdAt: item.createdAt.toISOString(),
    })),
    analytics: {
      views: totalViews,
      clicks: totalClicks,
      ctr: totalCtr,
    },
    appImages: appImages.map((image) => ({
      id: image.id,
      storageUrl: image.storageUrl,
      filename: image.filename,
      sizeInMB: image.sizeInMB,
      sourceType: image.sourceType,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
    })),
    appImagesNextCursor,
    shopifyProducts,
    shopifyFiles,
    productLoadError,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;
  const bannerId = params.bannerId;

  if (!bannerId) {
    return json({ success: false, error: "Missing bannerId" }, { status: 400 });
  }
  if (!shop) {
    return json({ success: false, error: "Missing shop domain" }, { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("action") as string;

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  const banner = await db.banner.findFirst({
    where: { id: bannerId, shopId: shopRecord.id },
  });

  if (!banner) {
    return json({ success: false, error: "Banner not found" }, { status: 404 });
  }

    if (action === "update-banner") {
      const nextStatus = (formData.get("status") as string) || banner.status;
      await db.banner.update({
        where: { id: banner.id },
        data: {
          title: (formData.get("title") as string) || banner.title,
          descriptionInternal: (formData.get("descriptionInternal") as string) || null,
          layout: (formData.get("layout") as string) || banner.layout,
          sliderType: (formData.get("sliderType") as string) || banner.sliderType,
          status: nextStatus,
          customCss: formData.has("customCss")
            ? ((formData.get("customCss") as string) || null)
            : banner.customCss,
      },
    });

    return json({ success: true });
  }

  if (action === "reorder-images") {
    const itemIds = JSON.parse(formData.get("itemIds") as string);

    // Update display order for each banner item
    await Promise.all(
      itemIds.map((itemId: string, index: number) =>
        db.bannerItem.update({
          where: { id: itemId, bannerId: banner.id },
          data: { displayOrder: index, isSelected: index === 0 },
        })
      )
    );

    // Update banner's updatedAt timestamp
    await db.banner.update({
      where: { id: banner.id },
      data: { updatedAt: new Date() },
    });

    return json({ success: true });
  }

  if (action === "generate-image") {
    const prompt = formData.get("prompt") as string;
    const additionalDetails = formData.get("additionalDetails") as string;
    const aspectRatio = (formData.get("aspectRatio") as string) || "16:9";
    const stylePrompt = formData.get("stylePrompt") as string;
    const resolution = (formData.get("resolution") as string) || "1K";
    const includeText = formData.get("includeText") === "1";
    const textMode = (formData.get("textMode") as string) || "none";
    const textTitle = formData.get("textTitle") as string;
    const textDescription = formData.get("textDescription") as string;
    const characterImageId = formData.get("characterImageId") as string;
    const productImageUrl = formData.get("productImageUrl") as string;
    const productId = formData.get("productId") as string;
    const productTitle = formData.get("productTitle") as string;

    if (!prompt) {
      return json({ success: false, error: "Prompt is required." }, { status: 400 });
    }

    const referenceImages: string[] = [];
    if (characterImageId) {
      const characterImage = await db.image.findFirst({
        where: { id: characterImageId, shopId: shopRecord.id },
      });
      if (characterImage?.storageUrl) {
        referenceImages.push(characterImage.storageUrl);
      }
    }
    if (productImageUrl) {
      referenceImages.push(productImageUrl);
    }

    const textBlock = includeText
      ? [
          "Include text in image:",
          `Text mode: ${textMode}`,
          textTitle ? `Title: ${textTitle}` : "",
          textDescription ? `Description: ${textDescription}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const fullPrompt = [prompt, additionalDetails, textBlock].filter(Boolean).join("\n");
    const referenceImagesCsv = referenceImages.join(",");
    const storageUsedMB = await getStorageUsageMB(shopRecord.id);

    const result = await dispatchImageAutomation({
      shop,
      action: "generate",
      plan: shopRecord.plan,
      payload: {
        action: "generate",
        shop,
        app: process.env.AUTOMATIONS_APP_ID || "shopify-bainners",
        prompt: fullPrompt,
        aspect_ratio: aspectRatio,
        resolution,
        output_format: "png",
        stylePrompt: stylePrompt || undefined,
        productContext: productId
          ? {
              productId,
              title: productTitle,
            }
          : undefined,
        referenceImages: referenceImagesCsv,
        variantsCount: 1,
        storageUsedMB,
      },
    });

    if (!result.success) {
      return json({ success: false, error: result.error }, { status: 500 });
    }

    const taskId = result.data?.data?.taskId || result.data?.taskId;
    if (!taskId) {
      return json({ success: false, error: "No taskId returned from n8n." }, { status: 500 });
    }

    return json({
      success: true,
      taskId,
      state: "pending",
    });
  }

  if (action === "poll-generate") {
    const taskId = formData.get("taskId") as string;
    if (!taskId) {
      return json({ success: false, error: "Missing taskId" }, { status: 400 });
    }

    const prompt = formData.get("prompt") as string;
    const additionalDetails = formData.get("additionalDetails") as string;
    const aspectRatio = (formData.get("aspectRatio") as string) || "16:9";
    const stylePrompt = formData.get("stylePrompt") as string;
    const resolution = (formData.get("resolution") as string) || "1K";
    const includeText = formData.get("includeText") === "1";
    const textMode = (formData.get("textMode") as string) || "none";
    const textTitle = (formData.get("textTitle") as string) || "";
    const textDescription = (formData.get("textDescription") as string) || "";
    const characterImageId = (formData.get("characterImageId") as string) || "";
    const productImageUrl = (formData.get("productImageUrl") as string) || "";
    const productId = (formData.get("productId") as string) || "";
    const productTitle = (formData.get("productTitle") as string) || "";

    const referenceImages: string[] = [];
    if (characterImageId) {
      const characterImage = await db.image.findFirst({
        where: { id: characterImageId, shopId: shopRecord.id },
      });
      if (characterImage?.storageUrl) {
        referenceImages.push(characterImage.storageUrl);
      }
    }
    if (productImageUrl) {
      referenceImages.push(productImageUrl);
    }

    const textBlock = includeText
      ? [
          "Include text in image:",
          `Text mode: ${textMode}`,
          textTitle ? `Title: ${textTitle}` : "",
          textDescription ? `Description: ${textDescription}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const fullPrompt = [prompt, additionalDetails, textBlock].filter(Boolean).join("\n");
    const referenceImagesCsv = referenceImages.join(",");
    const storageUsedMB = await getStorageUsageMB(shopRecord.id);

    const payload = {
      appId: process.env.AUTOMATIONS_APP_ID || "shopify-bainners",
      shop,
      app: process.env.AUTOMATIONS_APP_ID || "shopify-bainners",
      action: "generate",
      plan: shopRecord.plan,
      prompt: fullPrompt,
      aspect_ratio: aspectRatio,
      stylePrompt: stylePrompt || undefined,
      resolution,
      output_format: "png",
      productContext: productId
        ? {
            productId,
            title: productTitle,
          }
        : undefined,
      referenceImages: referenceImagesCsv,
      variantsCount: 1,
      storageUsedMB,
      taskId,
      meta: {
        plan: shopRecord.plan,
        dispatchedAt: new Date().toISOString(),
      },
    };

    const result = await dispatchImageStatus({
      shop,
      payload,
    });

    if (!result.success) {
      return json({ success: false, error: result.error }, { status: 500 });
    }

    const statusPayload = Array.isArray(result.data) ? result.data[0] : result.data;
    const n8nImage = extractN8nImage(statusPayload);
    if (!n8nImage.imageUrl) {
      return json({ success: true, state: "waiting" });
    }

    const sizeInMB = parseFilesize(n8nImage.filesize || 0);

    const existing = await db.image.findFirst({
      where: { shopId: shopRecord.id, storageUrl: n8nImage.imageUrl },
    });

    const image =
      existing ||
      (await db.image.create({
        data: {
          shopId: shopRecord.id,
          filename: n8nImage.filename || "generated-image.webp",
          storageUrl: n8nImage.imageUrl,
          sizeInMB,
          width: n8nImage.width || 1920,
          height: n8nImage.height || 1080,
          aspectRatio: aspectRatio || "16:9",
          format: "webp",
          sourceType: "ai_generated",
        },
      }));

    if (!existing) {
      await db.shop.update({
        where: { id: shopRecord.id },
        data: { storageUsedGB: { increment: sizeInMB / 1024 } },
      });
    }

    return json({
      success: true,
      state: "success",
      image: {
        id: image.id,
        url: image.storageUrl,
        sizeInMB: image.sizeInMB,
        filename: image.filename,
      },
    });
  }

  if (action === "upload-image") {
    const imageFile = formData.get("imageFile") as File;
    if (!imageFile || imageFile.size === 0) {
      return json({ success: false, error: "Please select an image to upload." }, { status: 400 });
    }
    const maxSizeBytes = 4 * 1024 * 1024;
    if (imageFile.size > maxSizeBytes) {
      return json(
        { success: false, error: "Image is too large. Max size is 4 MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const storageUsedMB = await getStorageUsageMB(shopRecord.id);

    const result = await dispatchImageAutomation({
      shop,
      action: "upload",
      plan: shopRecord.plan,
      payload: {
        action: "upload",
        shop,
        app: process.env.AUTOMATIONS_APP_ID || "shopify-bainners",
        imageBase64: base64,
        fileName: imageFile.name,
        mimeType: imageFile.type,
        optimize: true,
        storageUsedMB,
      },
    });

    if (!result.success) {
      return json({ success: false, error: result.error }, { status: 500 });
    }

    const n8nImage = extractN8nImage(result.data);
    if (!n8nImage.imageUrl) {
      return json({ success: false, error: "No image URL returned from n8n." }, { status: 500 });
    }

    const sizeInMB = parseFilesize(n8nImage.filesize || imageFile.size / (1024 * 1024));

    const image = await db.image.create({
      data: {
        shopId: shopRecord.id,
        filename: n8nImage.filename || imageFile.name,
        storageUrl: n8nImage.imageUrl,
        sizeInMB,
        width: n8nImage.width || 1920,
        height: n8nImage.height || 1080,
        aspectRatio: "16:9",
        format: "webp",
        sourceType: "uploaded",
      },
    });

    await db.shop.update({
      where: { id: shopRecord.id },
      data: { storageUsedGB: { increment: sizeInMB / 1024 } },
    });

    return json({
      success: true,
      image: {
        id: image.id,
        url: image.storageUrl,
        sizeInMB: image.sizeInMB,
        filename: image.filename,
      },
    });
  }

  if (action === "attach-image") {
    const imageId = formData.get("imageId") as string;
    const externalImageUrl = formData.get("externalImageUrl") as string;
    const externalImageWidth = parseInt(formData.get("externalImageWidth") as string) || 1920;
    const externalImageHeight = parseInt(formData.get("externalImageHeight") as string) || 1080;

    if (!imageId && !externalImageUrl) {
      return json({ success: false, error: "No image selected." }, { status: 400 });
    }

    if (banner.layout === "hero") {
      await db.bannerItem.deleteMany({
        where: { bannerId: banner.id },
      });
    } else {
      await db.bannerItem.updateMany({
        where: { bannerId: banner.id },
        data: { isSelected: false },
      });
    }

    const nextDisplayOrder = await db.bannerItem.count({
      where: { bannerId: banner.id },
    });

    await db.bannerItem.create({
      data: {
        shopId: shopRecord.id,
        bannerId: banner.id,
        imageId: imageId || null,
        externalImageUrl: externalImageUrl || null,
        isSelected: true,
        displayOrder: nextDisplayOrder,
        title: banner.title,
        description: banner.descriptionInternal || null,
        alt: banner.title,
      },
    });

    // Update banner's updatedAt timestamp
    await db.banner.update({
      where: { id: banner.id },
      data: { updatedAt: new Date() },
    });

    return json({
      success: true,
      externalImageWidth,
      externalImageHeight,
    });
  }

  if (action === "remove-banner-item") {
    const itemId = formData.get("itemId") as string;
    if (!itemId) {
      return json({ success: false, error: "Missing itemId" }, { status: 400 });
    }

    await db.bannerItem.delete({
      where: { id: itemId, bannerId: banner.id },
    });

    const remaining = await db.bannerItem.findMany({
      where: { bannerId: banner.id },
      orderBy: { displayOrder: "asc" },
    });

    if (remaining.length > 0) {
      await db.bannerItem.update({
        where: { id: remaining[0].id },
        data: { isSelected: true },
      });
    }

    return json({ success: true });
  }

  if (action === "update-banner-item") {
    const itemId = formData.get("itemId") as string;
    if (!itemId) {
      return json({ success: false, error: "Missing itemId" }, { status: 400 });
    }
    const existing = await db.bannerItem.findUnique({
      where: { id: itemId, bannerId: banner.id },
      select: { tags: true },
    });

    if (!existing) {
      return json({ success: false, error: "Banner item not found" }, { status: 404 });
    }

    const nextTags: Record<string, any> = { ...(existing.tags as Record<string, any> | null) };
    if (formData.has("showOverlay")) {
      nextTags.showOverlay = formData.get("showOverlay") === "true";
    }
    if (formData.has("showTextOverlay")) {
      nextTags.showTextOverlay = formData.get("showTextOverlay") === "true";
    }
    if (formData.has("textTitle")) {
      nextTags.textTitle = (formData.get("textTitle") as string) || "";
    }
    if (formData.has("textDescription")) {
      nextTags.textDescription = (formData.get("textDescription") as string) || "";
    }
    if (formData.has("showCta")) {
      nextTags.showCta = formData.get("showCta") === "true";
    }
    if (formData.has("ctaText")) {
      nextTags.ctaText = (formData.get("ctaText") as string) || "";
    }
    if (formData.has("ctaUrl")) {
      nextTags.ctaUrl = (formData.get("ctaUrl") as string) || "";
    }

    await db.bannerItem.update({
      where: { id: itemId, bannerId: banner.id },
      data: {
        tags: nextTags,
      },
    });

    return json({ success: true });
  }

  if (action === "delete-banner") {
    await db.banner.delete({
      where: { id: banner.id, shopId: shopRecord.id },
    });

    const redirectUrl = new URL("/app/banners", request.url);
    redirectUrl.search = url.search;
    return redirect(redirectUrl.toString());
  }

  return json({ success: false, error: "Invalid action." }, { status: 400 });
}

function parseFilesize(filesizeStr: string | number): number {
  if (typeof filesizeStr === "number") return filesizeStr;
  if (!filesizeStr) return 0;

  const match = filesizeStr.toString().match(/([\d.]+)\s*(MB|KB|GB)?/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();

  if (unit === "KB") return value / 1024;
  if (unit === "GB") return value * 1024;
  return value;
}

function extractN8nImage(data: any): {
  imageUrl?: string;
  filename?: string;
  filesize?: string | number;
  width?: number;
  height?: number;
} {
  if (!data) return {};

  if (data.imageUrl || data.url) {
    return {
      imageUrl: data.imageUrl || data.url,
      filename: data.filename,
      filesize: data.filesize || data.sizeInMB,
      width: data.width,
      height: data.height,
    };
  }

  const firstVariant = Array.isArray(data.variants) ? data.variants[0] : undefined;
  if (firstVariant) {
    return {
      imageUrl: firstVariant.imageUrl,
      filename: data.filename || firstVariant.filename,
      filesize: data.filesize || firstVariant.sizeInMB,
      width: firstVariant.width,
      height: firstVariant.height,
    };
  }

  return {};
}

export default function BannerEdit() {
  const {
    plan,
    storageUsedMB,
    storageLimitGB,
    banner,
    bannerItems,
    analytics,
    appImages,
    appImagesNextCursor,
    shopifyProducts,
    shopifyFiles,
    productLoadError,
  } = useLoaderData<typeof loader>();
  const location = useLocation();
  const editSearch = location.search || "";

  const updateFetcher = useFetcher();
  const itemUpdateFetcher = useFetcher();
  const generateFetcher = useFetcher();
  const pollFetcher = useFetcher();
  const uploadFetcher = useFetcher();
  const characterUploadFetcher = useFetcher();
  const productUploadFetcher = useFetcher();
  const attachFetcher = useFetcher();
  const reorderFetcher = useFetcher();
  const removeItemFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalOption, setModalOption] = useState<"gallery" | "upload" | "generate" | null>(
    null
  );
  const [galleryTab, setGalleryTab] = useState<"shopify" | "app">("shopify");
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<{
    source: "shopify" | "app";
    id?: string;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [selectedShopifyProductId, setSelectedShopifyProductId] = useState<string | null>(null);
  const [selectedShopifyImage, setSelectedShopifyImage] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [selectedCharacterImageId, setSelectedCharacterImageId] = useState<string>("");
  const [selectedCharacterImageUrl, setSelectedCharacterImageUrl] = useState<string>("");
  const [appImageOptions, setAppImageOptions] = useState(appImages);
  const [titleValue, setTitleValue] = useState(banner.title);
  const [descriptionValue, setDescriptionValue] = useState(banner.descriptionInternal);
  const [customCssValue, setCustomCssValue] = useState(banner.customCss || "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customCssDraft, setCustomCssDraft] = useState(banner.customCss || "");
  const [layoutValue, setLayoutValue] = useState(banner.layout);
  const [sliderTypeValue, setSliderTypeValue] = useState(banner.sliderType || "slide");
  const [statusValue, setStatusValue] = useState(
    banner.status === "scheduled" ? "draft" : banner.status
  );
  const [generatedImage, setGeneratedImage] = useState<{
    id: string;
    url: string;
    sizeInMB: number;
  } | null>(null);
  const [generationTaskId, setGenerationTaskId] = useState<string>("");
  const [modalError, setModalError] = useState("");
  const [uploadedImage, setUploadedImage] = useState<{
    id: string;
    url: string;
    sizeInMB: number;
  } | null>(null);
  const [generationPayload, setGenerationPayload] = useState<FormData | null>(null);
  const [orderedItems, setOrderedItems] = useState(bannerItems);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [includeTextInImage, setIncludeTextInImage] = useState(false);
  const [textMode, setTextMode] = useState<"none" | "integrated" | "overlay">("none");
  const [selectedStyleTag, setSelectedStyleTag] = useState<string>("fashion");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>("16:9");
  const [selectedResolution, setSelectedResolution] = useState<string>("1K");
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [pendingCharacterSelection, setPendingCharacterSelection] = useState<string>("");
  const [pendingProductImage, setPendingProductImage] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [pendingProductId, setPendingProductId] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDetails, setAiDetails] = useState("");
  const [aiTextTitle, setAiTextTitle] = useState("");
  const [aiTextDescription, setAiTextDescription] = useState("");
  const [previewItem, setPreviewItem] = useState<{
    url: string;
    title: string;
    sizeInMB: number;
    sourceType: string;
  } | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copiedBannerId, setCopiedBannerId] = useState(false);
  const [copiedEmbedHtml, setCopiedEmbedHtml] = useState(false);

  const storageUsageLabel = useMemo(() => {
    const usedGB = storageUsedMB / 1024;
    return `${usedGB.toFixed(2)} GB / ${storageLimitGB} GB`;
  }, [storageUsedMB, storageLimitGB]);

  const attachedImageIds = useMemo(() => {
    return new Set(bannerItems.map((item) => item.imageId).filter(Boolean) as string[]);
  }, [bannerItems]);
  const attachedExternalUrls = useMemo(() => {
    return new Set(
      bannerItems.map((item) => item.externalImageUrl).filter(Boolean) as string[]
    );
  }, [bannerItems]);

  const titleError =
    titleValue.trim().length === 0 ? "Title is required" : undefined;

  const saveBanner = useCallback(
    (next?: {
      title?: string;
      descriptionInternal?: string;
      layout?: string;
      sliderType?: string;
      status?: string;
      customCss?: string;
    }) => {
      const formData = new FormData();
      formData.set("action", "update-banner");
      formData.set("title", next?.title ?? titleValue);
      formData.set("descriptionInternal", next?.descriptionInternal ?? descriptionValue);
      formData.set("layout", next?.layout ?? layoutValue);
      formData.set("sliderType", next?.sliderType ?? sliderTypeValue);
      formData.set("status", next?.status ?? statusValue);
      formData.set("customCss", next?.customCss ?? customCssValue);
      updateFetcher.submit(formData, { method: "post" });
    },
    [
      customCssValue,
      descriptionValue,
      layoutValue,
      sliderTypeValue,
      statusValue,
      titleValue,
      updateFetcher,
    ]
  );

  const selectedProduct = useMemo(() => {
    if (!selectedShopifyProductId) return null;
    return shopifyProducts.find((product) => product.id === selectedShopifyProductId) || null;
  }, [selectedShopifyProductId, shopifyProducts]);

  const pendingProduct = useMemo(() => {
    if (!pendingProductId) return null;
    return shopifyProducts.find((product) => product.id === pendingProductId) || null;
  }, [pendingProductId, shopifyProducts]);

  const pendingCharacterImage = useMemo(() => {
    if (!pendingCharacterSelection) return null;
    return appImageOptions.find((image) => image.id === pendingCharacterSelection) || null;
  }, [appImageOptions, pendingCharacterSelection]);


  const galleryTabs = [
    { id: "shopify", content: "Shopify gallery", panelID: "shopify-gallery" },
    { id: "app", content: "App gallery", panelID: "app-gallery" },
  ];
  const selectedGalleryIndex = galleryTab === "shopify" ? 0 : 1;

  const styleOptions = [
    { id: "fashion", label: "Fashion" },
    { id: "sports", label: "Sports" },
    { id: "luxury", label: "Luxury" },
    { id: "tech", label: "Tech" },
    { id: "outdoors", label: "Outdoors" },
    { id: "kids", label: "Kids" },
    { id: "food", label: "Food" },
    { id: "minimal", label: "Minimal" },
  ];

  const aspectRatioOptions = [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    "auto",
  ];

  const resolutionOptions =
    plan === "ultra" ? ["1K", "2K", "4K"] : plan === "pro" ? ["1K", "2K"] : ["1K"];

  const selectedStyleLabel =
    styleOptions.find((option) => option.id === selectedStyleTag)?.label || selectedStyleTag;

  const styleSelectOptions = styleOptions.map((option) => ({
    label: option.label,
    value: option.id,
  }));

  const aspectRatioSelectOptions = aspectRatioOptions.map((ratio) => ({
    label: ratio,
    value: ratio,
  }));

  const resolutionSelectOptions = resolutionOptions.map((res) => ({
    label: res,
    value: res,
  }));

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setModalOption(null);
    setGalleryTab("shopify");
    setSelectedGalleryImage(null);
    setSelectedShopifyImage(null);
    setGeneratedImage(null);
    setGenerationTaskId("");
    setModalError("");
    setUploadedImage(null);
  }, []);

  useEffect(() => {
    if (attachFetcher.data && "success" in attachFetcher.data && attachFetcher.data.success) {
      handleModalClose();
    }
  }, [attachFetcher.data, handleModalClose]);

  const handleGenerateSubmit = useCallback(
    (formData: FormData) => {
      setGeneratedImage(null);
      setGenerationTaskId("");
      setModalError("");
      setGenerationPayload(formData);
      generateFetcher.submit(formData, { method: "post" });
    },
    [generateFetcher]
  );

  const regenerate = useCallback(() => {
    if (generationPayload) {
      handleGenerateSubmit(generationPayload);
    }
  }, [generationPayload, handleGenerateSubmit]);

  const modalBusy =
    generateFetcher.state !== "idle" ||
    (generationTaskId !== "" && !generatedImage && !modalError);

  useEffect(() => {
    if (!generateFetcher.data || !("success" in generateFetcher.data)) return;
    if (generateFetcher.data.success && generateFetcher.data.taskId) {
      setGenerationTaskId(generateFetcher.data.taskId);
    }
    if (!generateFetcher.data.success && generateFetcher.data.error) {
      setModalError(generateFetcher.data.error as string);
    }
  }, [generateFetcher.data]);

  useEffect(() => {
    if (!generationTaskId || !generationPayload) return;
    if (modalOption !== "generate") return;

    const intervalId = setInterval(() => {
      if (pollFetcher.state !== "idle") return;
      if (generatedImage || modalError) return;
      const pollData = new FormData();
      pollData.set("action", "poll-generate");
      pollData.set("taskId", generationTaskId);
      for (const [key, value] of generationPayload.entries()) {
        if (key === "action") continue;
        pollData.set(key, value.toString());
      }
      pollFetcher.submit(pollData, { method: "post" });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [generationTaskId, generationPayload, modalOption, pollFetcher, generatedImage, modalError]);

  useEffect(() => {
    if (!pollFetcher.data || !("success" in pollFetcher.data)) return;
    if (pollFetcher.data.success && pollFetcher.data.state === "success" && pollFetcher.data.image) {
      setGeneratedImage(pollFetcher.data.image);
      setGenerationTaskId("");
    }
    if (!pollFetcher.data.success && pollFetcher.data.error) {
      setModalError(pollFetcher.data.error as string);
      setGenerationTaskId("");
    }
  }, [pollFetcher.data]);

  const uploadError =
    uploadFetcher.data && "error" in uploadFetcher.data
      ? (uploadFetcher.data.error as string)
      : "";

  const characterUploadError =
    characterUploadFetcher.data && "error" in characterUploadFetcher.data
      ? (characterUploadFetcher.data.error as string)
      : "";

  const productUploadError =
    productUploadFetcher.data && "error" in productUploadFetcher.data
      ? (productUploadFetcher.data.error as string)
      : "";

  useEffect(() => {
    const data = generateFetcher.data as any;
    if (data?.image?.id && data?.image?.url) {
      setGeneratedImage({
        id: data.image.id,
        url: data.image.url,
        sizeInMB: data.image.sizeInMB,
      });
    }
  }, [generateFetcher.data]);

  useEffect(() => {
    const data = uploadFetcher.data as any;
    if (data?.image?.id && data?.image?.url) {
      setUploadedImage({
        id: data.image.id,
        url: data.image.url,
        sizeInMB: data.image.sizeInMB,
      });
    }
  }, [uploadFetcher.data]);

  useEffect(() => {
    const data = productUploadFetcher.data as any;
    if (data?.image?.id && data?.image?.url) {
      const image = {
        url: data.image.url,
        width: data.image.width || 1920,
        height: data.image.height || 1080,
      };
      setPendingProductImage(image);
      setSelectedShopifyImage(image);
      setSelectedShopifyProductId(null);
      setProductModalOpen(false);
    }
  }, [productUploadFetcher.data]);

  useEffect(() => {
    const data = characterUploadFetcher.data as any;
    if (data?.image?.id && data?.image?.url) {
      setAppImageOptions((current) => [
        {
          id: data.image.id,
          storageUrl: data.image.url,
          filename: data.image.filename,
          sizeInMB: data.image.sizeInMB,
          sourceType: "uploaded",
          width: data.image.width || 1920,
          height: data.image.height || 1080,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setSelectedCharacterImageId(data.image.id);
      setSelectedCharacterImageUrl(data.image.url);
      setPendingCharacterSelection(data.image.id);
    }
  }, [characterUploadFetcher.data]);

  useEffect(() => {
    setOrderedItems(bannerItems);
  }, [bannerItems]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newItems = [...orderedItems];
    const draggedItem = newItems[draggedIndex];
    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);

    setOrderedItems(newItems);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex === null) return;

    // Save new order to server
    const itemIds = orderedItems.map((item) => item.id);
    reorderFetcher.submit(
      {
        action: "reorder-images",
        itemIds: JSON.stringify(itemIds),
      },
      { method: "post" }
    );

    setDraggedIndex(null);
  };

  const handleUseGalleryImage = () => {
    if (!selectedGalleryImage) return;
    if (selectedGalleryImage.source === "app" && selectedGalleryImage.id) {
      if (attachedImageIds.has(selectedGalleryImage.id)) return;
      attachFetcher.submit(
        { action: "attach-image", imageId: selectedGalleryImage.id },
        { method: "post" }
      );
      return;
    }
    if (attachedExternalUrls.has(selectedGalleryImage.url)) return;
    attachFetcher.submit(
      {
        action: "attach-image",
        externalImageUrl: selectedGalleryImage.url,
        externalImageWidth: selectedGalleryImage.width,
        externalImageHeight: selectedGalleryImage.height,
      },
      { method: "post" }
    );
  };

  const handleUseUploadedImage = () => {
    if (!uploadedImage) return;
    if (attachedImageIds.has(uploadedImage.id)) return;
    attachFetcher.submit(
      { action: "attach-image", imageId: uploadedImage.id },
      { method: "post" }
    );
  };

  const updateBannerItem = (
    itemId: string,
    data: {
      showOverlay?: boolean;
      showTextOverlay?: boolean;
      textTitle?: string;
      textDescription?: string;
      showCta?: boolean;
      ctaText?: string;
      ctaUrl?: string;
    }
  ) => {
    const formData = new FormData();
    formData.set("action", "update-banner-item");
    formData.set("itemId", itemId);
    if (data.showOverlay !== undefined) {
      formData.set("showOverlay", data.showOverlay ? "true" : "false");
    }
    if (data.showTextOverlay !== undefined) {
      formData.set("showTextOverlay", data.showTextOverlay ? "true" : "false");
    }
    if (data.textTitle !== undefined) {
      formData.set("textTitle", data.textTitle);
    }
    if (data.textDescription !== undefined) {
      formData.set("textDescription", data.textDescription);
    }
    if (data.showCta !== undefined) {
      formData.set("showCta", data.showCta ? "true" : "false");
    }
    if (data.ctaText !== undefined) {
      formData.set("ctaText", data.ctaText);
    }
    if (data.ctaUrl !== undefined) {
      formData.set("ctaUrl", data.ctaUrl);
    }
    itemUpdateFetcher.submit(formData, { method: "post" });
  };

  const handleUploadDrop = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("action", "upload-image");
    formData.set("imageFile", file);
    uploadFetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  const handleCharacterDrop = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("action", "upload-image");
    formData.set("imageFile", file);
    characterUploadFetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  const handleProductDrop = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("action", "upload-image");
    formData.set("imageFile", file);
    productUploadFetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  return (
    <Page title="">
      <Layout>
        <Layout.Section>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <InlineStack align="start" blockAlign="center" gap="200" wrap={false}>
                <Button
                  icon={ArrowLeftIcon}
                  variant="tertiary"
                  url={`/app/banners${editSearch}`}
                >
                  Back
                </Button>
                <div style={{ flex: 1 }}>
                  <InlineEditableText
                    label="Banner Title"
                    value={titleValue}
                    placeholder="Add a banner title"
                    variant="headingLg"
                    onChange={setTitleValue}
                    onCommit={(value) => {
                      if (!value.trim()) return false;
                      saveBanner({ title: value });
                      return true;
                    }}
                    error={titleError}
                  />
                </div>
              </InlineStack>
              <InlineStack gap="200" blockAlign="center" wrap={false}>
                <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                  Preview
                </Button>
                <Button variant="primary" onClick={() => setEmbedOpen(true)}>
                  Embed banner
                </Button>
              </InlineStack>
            </InlineStack>

            <InlineEditableText
              label="Internal Description"
              value={descriptionValue}
              placeholder="Add a description for internal context."
              multiline
              variant="bodyMd"
              onChange={setDescriptionValue}
              onCommit={(value) => {
                saveBanner({ descriptionInternal: value });
                return true;
              }}
              maxLength={500}
              showCharacterCount
            />
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Configuration
                </Text>
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setCustomCssDraft(customCssValue);
                    setAdvancedOpen(true);
                  }}
                >
                  Advanced
                </Button>
              </InlineStack>
              <FormLayout>
                <Select
                  label="Layout"
                  name="layout"
                  options={[
                    { label: "Hero Banner", value: "hero" },
                    { label: "Slider", value: "slider" },
                    { label: "Promo Strip", value: "promo_strip" },
                    { label: "Product Highlight", value: "product_highlight" },
                  ]}
                  value={layoutValue}
                  onChange={(value) => {
                    setLayoutValue(value);
                    saveBanner({ layout: value });
                  }}
                />
                {layoutValue === "slider" ? (
                  <Select
                    label="Slider type"
                    name="sliderType"
                    options={[
                      { label: "Slide", value: "slide" },
                      { label: "Fade", value: "fade" },
                      { label: "Coverflow", value: "coverflow" },
                      { label: "Cards", value: "cards" },
                      { label: "Creative", value: "creative" },
                      { label: "Flip", value: "flip" },
                    ]}
                    value={sliderTypeValue}
                    onChange={(value) => {
                      setSliderTypeValue(value);
                      saveBanner({ sliderType: value });
                    }}
                  />
                ) : null}
                <Select
                  label="Status"
                  name="status"
                  options={[
                    { label: "Draft", value: "draft" },
                    { label: "Published", value: "active" },
                    { label: "Archived", value: "archived" },
                  ]}
                  value={statusValue}
                  onChange={(value) => {
                    setStatusValue(value);
                    saveBanner({ status: value });
                  }}
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Banner Images
                </Text>
                {orderedItems.length > 0 && layoutValue !== "hero" ? (
                  <Button
                    onClick={() => setModalOpen(true)}
                    variant="primary"
                    disabled={layoutValue === "hero" && orderedItems.length >= 1}
                  >
                    Add Image
                  </Button>
                ) : null}
              </InlineStack>
              {orderedItems.length === 0 ? (
                <EmptyState
                  heading="No images yet"
                  action={{
                    content: "Add Image",
                    onAction: () => setModalOpen(true),
                    primary: true,
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add an image to start building this banner.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {(layoutValue === "hero" ? orderedItems.slice(0, 1) : orderedItems).map(
                    (item, index) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{
                        cursor: "move",
                        backgroundColor: draggedIndex === index ? "#f6f6f7" : "transparent",
                        transition: "background-color 0.2s",
                        borderRadius: "8px",
                      }}
                    >
                      <Card padding="400">
                        <InlineStack gap="400" align="start" blockAlign="center">
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                              cursor: "move",
                              alignSelf: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "12px",
                                height: "2px",
                                backgroundColor: "#8c9196",
                              }}
                            />
                            <div
                              style={{
                                width: "12px",
                                height: "2px",
                                backgroundColor: "#8c9196",
                              }}
                            />
                            <div
                              style={{
                                width: "12px",
                                height: "2px",
                                backgroundColor: "#8c9196",
                              }}
                            />
                          </div>
                            <button
                              type="button"
                              className="bainners-image-thumb bainners-image-thumb--large"
                              onClick={() =>
                              setPreviewItem({
                                url: item.imageUrl,
                                title: item.title,
                                sizeInMB: item.sizeInMB,
                                sourceType: item.sourceType,
                              })
                              }
                            >
                            <img src={item.imageUrl} alt={item.title} />
                            <span className="bainners-image-overlay">
                              <Icon source={SearchIcon} tone="base" />
                            </span>
                            <div className="bainners-banner-tags">
                              {item.isSelected && <Badge tone="success">Selected</Badge>}
                              <Badge tone="info">{item.sourceType}</Badge>
                            </div>
                          </button>
                          <BlockStack gap="100">
                            <Checkbox
                              label="Show overlay"
                              checked={Boolean(item.tags?.showOverlay)}
                              onChange={(value) =>
                                updateBannerItem(item.id, { showOverlay: value })
                              }
                            />
                            <BlockStack gap="200">
                              <Checkbox
                                label="Show text overlay"
                                checked={Boolean(item.tags?.showTextOverlay)}
                                onChange={(value) =>
                                  updateBannerItem(item.id, { showTextOverlay: value })
                                }
                              />
                              {item.tags?.showTextOverlay && (
                                <InlineStack gap="200" blockAlign="center">
                                  <TextField
                                    label="Overlay title"
                                    value={item.tags?.textTitle || ""}
                                    onChange={(value) =>
                                      updateBannerItem(item.id, { textTitle: value })
                                    }
                                  />
                                  <TextField
                                    label="Overlay description"
                                    value={item.tags?.textDescription || ""}
                                    onChange={(value) =>
                                      updateBannerItem(item.id, { textDescription: value })
                                    }
                                  />
                                </InlineStack>
                              )}
                            </BlockStack>
                            <BlockStack gap="200">
                              <Checkbox
                                label="Show CTA"
                                checked={Boolean(item.tags?.showCta)}
                                onChange={(value) => updateBannerItem(item.id, { showCta: value })}
                              />
                              {item.tags?.showCta && (
                                <InlineStack gap="200" blockAlign="center">
                                  <TextField
                                    label="CTA text"
                                    value={item.tags?.ctaText || ""}
                                    onChange={(value) =>
                                      updateBannerItem(item.id, { ctaText: value })
                                    }
                                  />
                                  <TextField
                                    label="CTA URL"
                                    value={item.tags?.ctaUrl || ""}
                                    onChange={(value) =>
                                      updateBannerItem(item.id, { ctaUrl: value })
                                    }
                                  />
                                </InlineStack>
                              )}
                            </BlockStack>
                            <div className="bainners-banner-item-actions">
                              <Button
                                size="slim"
                                tone="critical"
                                onClick={() => {
                                  if (!confirm("Remove this image from the banner?")) return;
                                  const formData = new FormData();
                                  formData.set("action", "remove-banner-item");
                                  formData.set("itemId", item.id);
                                  removeItemFetcher.submit(formData, { method: "post" });
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </BlockStack>
                        </InlineStack>
                      </Card>
                    </div>
                  )
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>

      <div style={{ marginTop: "24px" }}>
        <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Danger zone
              </Text>
              <Text as="p" variant="bodySm">
                Deleting a banner is permanent and cannot be undone.
              </Text>
              <Form method="post">
                <input type="hidden" name="action" value="delete-banner" />
                <Button
                  tone="critical"
                  submit
                  onClick={(event) => {
                    if (!confirm("Delete this banner permanently?")) {
                      event.preventDefault();
                    }
                  }}
                >
                  Delete banner
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        </Layout>
      </div>

      <Modal
        open={modalOpen}
        onClose={handleModalClose}
        title={
          modalOption ? (
            <InlineStack align="start" blockAlign="center" gap="200">
              <Button
                icon={ArrowLeftIcon}
                variant="tertiary"
                onClick={() => setModalOption(null)}
              >
                Back
              </Button>
              <Text as="span" variant="headingMd">
                {modalOption === "gallery"
                  ? "Gallery"
                  : modalOption === "upload"
                  ? "Upload image"
                  : "Generate with AI"}
              </Text>
            </InlineStack>
          ) : (
            "Add Image"
          )
        }
        primaryAction={undefined}
        size="large"
      >
        <Modal.Section>
          <div className="bainners-add-image-modal">
            {!modalOption && (
              <BlockStack gap="400" align="center">
                <Text as="p" variant="bodyMd" alignment="center">
                  Choose how you want to add an image.
                </Text>
                <div className="bainners-option-grid">
                  <button
                    type="button"
                    className="bainners-option-card"
                    onClick={() => setModalOption("gallery")}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={ImageIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Gallery
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Use Shopify or app images
                    </Text>
                  </button>
                  <button
                    type="button"
                    className="bainners-option-card"
                    onClick={() => setModalOption("upload")}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={UploadIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Upload image
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Upload a new image from your device
                    </Text>
                  </button>
                  <button
                    type="button"
                    className="bainners-option-card"
                    onClick={() => setModalOption("generate")}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={ImageMagicIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Generate with AI
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Describe what you want and generate
                    </Text>
                  </button>
                </div>
              </BlockStack>
            )}

            {modalOption === "gallery" && (
              <BlockStack gap="300">
                <Tabs
                  tabs={galleryTabs}
                  selected={selectedGalleryIndex}
                  onSelect={(index) => {
                    const nextTab = index === 0 ? "shopify" : "app";
                    setGalleryTab(nextTab);
                    setSelectedGalleryImage(null);
                  }}
                />

                {galleryTab === "shopify" && shopifyFiles.length === 0 && (
                  <EmptyState
                    heading="No Shopify files yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Upload images in Shopify Admin to see them here.</p>
                  </EmptyState>
                )}

                {galleryTab === "app" && appImageOptions.length === 0 && (
                  <EmptyState
                    heading="No app images yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Generate or upload images to see them here.</p>
                  </EmptyState>
                )}

                {((galleryTab === "shopify" && shopifyFiles.length > 0) ||
                  (galleryTab === "app" && appImageOptions.length > 0)) && (
                  <div className="bainners-image-grid">
                    {(galleryTab === "shopify" ? shopifyFiles : appImageOptions).map((image) => {
                      const imageUrl = "storageUrl" in image ? image.storageUrl : image.url;
                      const isSelected = selectedGalleryImage?.url === imageUrl;
                      const alreadyUsed =
                        "storageUrl" in image
                          ? attachedImageIds.has(image.id)
                          : attachedExternalUrls.has(image.url);
                      const imageLabel = "filename" in image ? image.filename : "Shopify file";
                      const width = "width" in image ? image.width : 1920;
                      const height = "height" in image ? image.height : 1080;
                      return (
                        <button
                          key={image.id}
                          type="button"
                          className={`bainners-image-tile${
                            isSelected ? " bainners-image-tile--selected" : ""
                          }${alreadyUsed ? " bainners-image-tile--disabled" : ""}`}
                          onClick={() =>
                            setSelectedGalleryImage({
                              source: galleryTab,
                              id: "storageUrl" in image ? image.id : undefined,
                              url: imageUrl,
                              width,
                              height,
                            })
                          }
                          disabled={alreadyUsed}
                        >
                          <img src={imageUrl} alt={imageLabel} />
                          <span>{imageLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <InlineStack align="end">
                  <Button
                    primary
                    disabled={
                      !selectedGalleryImage ||
                      (selectedGalleryImage.source === "app" &&
                        !!selectedGalleryImage.id &&
                        attachedImageIds.has(selectedGalleryImage.id)) ||
                      (selectedGalleryImage.source === "shopify" &&
                        attachedExternalUrls.has(selectedGalleryImage.url))
                    }
                    onClick={handleUseGalleryImage}
                  >
                    Use Image
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {modalOption === "upload" && (
              <BlockStack gap="300">
                {!uploadedImage ? (
                  <DropZone
                    accept="image/*"
                    type="image"
                    onDrop={handleUploadDrop}
                    allowMultiple={false}
                    disabled={uploadFetcher.state !== "idle"}
                  >
                    <DropZone.FileUpload />
                  </DropZone>
                ) : (
                  <div className="bainners-generated-preview">
                    <img src={uploadedImage.url} alt="Uploaded image" />
                  </div>
                )}
                {uploadFetcher.state !== "idle" && (
                  <Text as="p" variant="bodySm">
                    Uploading image...
                  </Text>
                )}
                {uploadError && (
                  <PolarisBanner tone="critical" title="Upload failed">
                    <p>{uploadError}</p>
                  </PolarisBanner>
                )}
                <InlineStack align="end" gap="200">
                  {uploadedImage && (
                    <Button
                      onClick={() => {
                        setUploadedImage(null);
                      }}
                    >
                      Upload another
                    </Button>
                  )}
                  <Button
                    primary
                    disabled={!uploadedImage || attachedImageIds.has(uploadedImage?.id || "")}
                    onClick={handleUseUploadedImage}
                  >
                    Use Image
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {modalOption === "generate" && (
              <div className="bainners-generate-layout">
                <div className={`bainners-generate-sidebar${modalBusy ? " is-disabled" : ""}`}>
                  <generateFetcher.Form
                    method="post"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      handleGenerateSubmit(formData);
                    }}
                  >
                    <input type="hidden" name="action" value="generate-image" />
                    <input type="hidden" name="aspectRatio" value={selectedAspectRatio} />
                    <input type="hidden" name="resolution" value={selectedResolution} />
                    <input type="hidden" name="stylePrompt" value={selectedStyleLabel} />
                    <input
                      type="hidden"
                      name="characterImageId"
                      value={selectedCharacterImageId}
                    />
                    <input type="hidden" name="productId" value={selectedShopifyProductId || ""} />
                    <input type="hidden" name="productTitle" value={selectedProduct?.title || ""} />
                    <input
                      type="hidden"
                      name="productImageUrl"
                      value={selectedShopifyImage?.url || ""}
                    />
                  <input type="hidden" name="includeText" value={includeTextInImage ? "1" : "0"} />
                  <input type="hidden" name="textMode" value={textMode} />

                    <FormLayout>
                      <TextField
                        label="Describe the image"
                        name="prompt"
                        multiline={4}
                        placeholder="Describe what you want to generate"
                        value={aiPrompt}
                        onChange={setAiPrompt}
                        disabled={modalBusy}
                      />
                    <Select
                      label="Text style"
                      options={[
                        { label: "No text", value: "none" },
                        { label: "Integrated in image", value: "integrated" },
                        { label: "Overlay on banner", value: "overlay" },
                      ]}
                      value={textMode}
                      onChange={(value) => {
                        setTextMode(value as "none" | "integrated" | "overlay");
                        setIncludeTextInImage(value !== "none");
                      }}
                      disabled={modalBusy}
                    />
                    {textMode !== "none" && (
                        <>
                          <TextField
                            label="Text title"
                            name="textTitle"
                            placeholder="Headline text"
                            value={aiTextTitle}
                            onChange={setAiTextTitle}
                            disabled={modalBusy}
                          />
                          <TextField
                            label="Text description"
                            name="textDescription"
                            placeholder="Supporting line"
                            value={aiTextDescription}
                            onChange={setAiTextDescription}
                            disabled={modalBusy}
                          />
                        </>
                      )}
                      <TextField
                        label="Additional details"
                        name="additionalDetails"
                        multiline={2}
                        placeholder="Optional details to guide the result"
                        value={aiDetails}
                        onChange={setAiDetails}
                        disabled={modalBusy}
                      />
                    </FormLayout>

                    <BlockStack gap="200" className="bainners-generate-stack-tight">
                      <div className="bainners-section-title">
                        <Text as="h3" variant="headingMd">
                          References
                        </Text>
                      </div>
                      <div className="bainners-selection-grid">
                        <div className="bainners-selection-card">
                          {selectedCharacterImageId ? (
                            <div className="bainners-selection-preview">
                              <div className="bainners-selection-remove">
                                <Button
                                  icon={DeleteIcon}
                                  variant="tertiary"
                                  onClick={() => {
                                    setSelectedCharacterImageId("");
                                    setSelectedCharacterImageUrl("");
                                  }}
                                >
                                  Remove image
                                </Button>
                              </div>
                              <img src={selectedCharacterImageUrl} alt="Character" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="bainners-option-card"
                              onClick={() => {
                                setPendingCharacterSelection("");
                                setCharacterModalOpen(true);
                              }}
                              disabled={modalBusy}
                            >
                              <div className="bainners-option-card__icon">
                                <Icon source={ImageIcon} />
                              </div>
                              <Text as="p" variant="headingMd">
                                Character
                              </Text>
                            </button>
                          )}
                        </div>
                        <div className="bainners-selection-card">
                          {selectedShopifyImage ? (
                            <div className="bainners-selection-preview">
                              <div className="bainners-selection-remove">
                                <Button
                                  icon={DeleteIcon}
                                  variant="tertiary"
                                  onClick={() => {
                                    setSelectedShopifyImage(null);
                                    setSelectedShopifyProductId(null);
                                  }}
                                >
                                  Remove image
                                </Button>
                              </div>
                              <img src={selectedShopifyImage.url} alt="Product" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="bainners-option-card"
                              onClick={() => {
                                setPendingProductId("");
                                setPendingProductImage(null);
                                setProductModalOpen(true);
                              }}
                              disabled={modalBusy}
                            >
                              <div className="bainners-option-card__icon">
                                <Icon source={ImageIcon} />
                              </div>
                              <Text as="p" variant="headingMd">
                                Product
                              </Text>
                            </button>
                          )}
                        </div>
                      </div>
                    </BlockStack>

                    <div className="bainners-select-row">
                      <div className="bainners-select-card">
                        <Select
                          labelHidden
                          label="Style"
                          options={styleSelectOptions}
                          value={selectedStyleTag}
                          onChange={setSelectedStyleTag}
                          disabled={modalBusy}
                        />
                      </div>
                      <div className="bainners-select-card">
                        <Select
                          labelHidden
                          label="Aspect ratio"
                          options={aspectRatioSelectOptions}
                          value={selectedAspectRatio}
                          onChange={setSelectedAspectRatio}
                          disabled={modalBusy}
                        />
                      </div>
                      <div className="bainners-select-card">
                        <Select
                          labelHidden
                          label="Resolution"
                          options={resolutionSelectOptions}
                          value={selectedResolution}
                          onChange={setSelectedResolution}
                          disabled={modalBusy}
                        />
                      </div>
                    </div>

                    <InlineStack align="end">
                      <Button submit disabled={modalBusy} primary fullWidth>
                        Generate
                      </Button>
                    </InlineStack>
                  </generateFetcher.Form>
                </div>

                <div className="bainners-generate-preview">
                  {modalError && (
                    <PolarisBanner tone="critical" title="Generation failed">
                      <p>{modalError}</p>
                    </PolarisBanner>
                  )}
                  {modalBusy && (
                    <div className="bainners-loading">
                      <Spinner size="large" />
                      <Text as="p" variant="bodyMd">
                        Loading
                      </Text>
                    </div>
                  )}
                  {!modalBusy && !generatedImage && (
                    <div className="bainners-generate-placeholder">
                      <Text as="p" variant="bodyMd" alignment="center">
                        Generated image will appear here.
                      </Text>
                    </div>
                  )}
                  {!modalBusy && generatedImage && (
                    <div className="bainners-generated-preview">
                      <img src={generatedImage.url} alt="Generated image" />
                    </div>
                  )}
                  <div className="bainners-generate-actions">
                    {generatedImage ? (
                      <Button variant="tertiary" onClick={regenerate}>
                        Regenerate image
                      </Button>
                    ) : (
                      <div />
                    )}
                    <attachFetcher.Form method="post">
                      <input type="hidden" name="action" value="attach-image" />
                      <input type="hidden" name="imageId" value={generatedImage?.id || ""} />
                      <Button submit primary disabled={!generatedImage}>
                        Use Image
                      </Button>
                    </attachFetcher.Form>
                  </div>
                </div>

              </div>
            )}
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={embedOpen}
        onClose={() => setEmbedOpen(false)}
        title="Embed banner"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Option 1
              </Text>
              <Text as="p" variant="bodySm">
                Use the Banner ID inside the Theme Editor block.
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap={false}>
                <Text as="span" variant="headingSm">
                  ID: {banner.id}
                </Text>
                <Button
                  icon={ClipboardIcon}
                  variant="tertiary"
                  accessibilityLabel="Copy banner ID"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(banner.id);
                      setCopiedBannerId(true);
                      setTimeout(() => setCopiedBannerId(false), 2000);
                    } catch {
                      setCopiedBannerId(false);
                    }
                  }}
                />
                {copiedBannerId ? (
                  <Text as="span" variant="bodySm" tone="success">
                    Copied
                  </Text>
                ) : null}
                <Button
                  icon={QuestionCircleIcon}
                  variant="tertiary"
                  url={`/app/setup-guide${editSearch}`}
                  accessibilityLabel="Setup guide"
                />
              </InlineStack>
              <div className="bainners-embed-media">
                <Text as="p" variant="bodySm" tone="subdued">
                  Add the “Bainners Banner” block in the Theme Editor and paste the ID.
                </Text>
              </div>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Option 2
              </Text>
              <Text as="p" variant="bodySm">
                Paste this HTML snippet into your theme to render the banner on any page.
              </Text>
              <TextField
                label="Embed HTML"
                labelHidden
                multiline={6}
                readOnly
                value={`<bainners-banner data-banner-id="${banner.id}"></bainners-banner>
<script>
  (function () {
    var banners = document.querySelectorAll('bainners-banner[data-banner-id]');
    banners.forEach(function (el) {
      var id = el.getAttribute('data-banner-id');
      fetch('/apps/bainners/banner?banner_id=' + encodeURIComponent(id))
        .then(function (res) { return res.text(); })
        .then(function (html) { el.innerHTML = html; })
        .catch(function () { el.innerHTML = 'Unable to load banner.'; });
    });
  })();
</script>`}
                monospaced
              />
              <InlineStack gap="200">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `<bainners-banner data-banner-id="${banner.id}"></bainners-banner>\n<script>\n  (function () {\n    var banners = document.querySelectorAll('bainners-banner[data-banner-id]');\n    banners.forEach(function (el) {\n      var id = el.getAttribute('data-banner-id');\n      fetch('/apps/bainners/banner?banner_id=' + encodeURIComponent(id))\n        .then(function (res) { return res.text(); })\n        .then(function (html) { el.innerHTML = html; })\n        .catch(function () { el.innerHTML = 'Unable to load banner.'; });\n    });\n  })();\n</script>`
                      );
                      setCopiedEmbedHtml(true);
                      setTimeout(() => setCopiedEmbedHtml(false), 2000);
                    } catch {
                      setCopiedEmbedHtml(false);
                    }
                  }}
                >
                  Copy HTML
                </Button>
                {copiedEmbedHtml ? (
                  <Text as="span" variant="bodySm" tone="success">
                    Copied
                  </Text>
                ) : null}
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                This snippet supports multiple banners on the same page.
              </Text>
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Banner preview"
        size="large"
      >
        <Modal.Section>
          <div className="bainners-preview-frame">
            <iframe
              title="Banner preview"
              src={`/app/banners/${banner.id}/preview${editSearch}`}
            />
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title="Advanced settings"
        primaryAction={{
          content: "Save and close",
          onAction: () => {
            setCustomCssValue(customCssDraft);
            saveBanner({ customCss: customCssDraft });
            setAdvancedOpen(false);
          },
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setAdvancedOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm">
              Additional CSS (optional)
            </Text>
            <TextField
              label="Custom CSS"
              labelHidden
              multiline={8}
              placeholder=".hero-banner { }"
              value={customCssDraft}
              onChange={setCustomCssDraft}
              monospaced
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title="Image preview"
        size="large"
      >
        <Modal.Section>
          {previewItem && (
            <BlockStack gap="200">
              <div className="bainners-modal-image">
                <img src={previewItem.url} alt={previewItem.title} />
              </div>
              <Text as="p" variant="bodySm">
                Size: {previewItem.sizeInMB.toFixed(2)} MB
              </Text>
              <Text as="p" variant="bodySm">
                Source: {previewItem.sourceType}
              </Text>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      <Modal
        open={characterModalOpen}
        onClose={() => setCharacterModalOpen(false)}
        title="Select character"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="300">
            <DropZone
              accept="image/*"
              type="image"
              onDrop={handleCharacterDrop}
              allowMultiple={false}
              disabled={characterUploadFetcher.state !== "idle"}
            >
              <DropZone.FileUpload />
            </DropZone>
            {characterUploadFetcher.state !== "idle" && (
              <Text as="p" variant="bodySm">
                Uploading character image...
              </Text>
            )}
            {characterUploadError && (
              <PolarisBanner tone="critical" title="Upload failed">
                <p>{characterUploadError}</p>
              </PolarisBanner>
            )}
            <div className="bainners-image-grid">
              {appImageOptions.map((image) => {
                const isSelected = pendingCharacterSelection === image.id;
                return (
                  <button
                    key={image.id}
                    type="button"
                    className={`bainners-image-tile${
                      isSelected ? " bainners-image-tile--selected" : ""
                    }`}
                    onClick={() => {
                      setPendingCharacterSelection(image.id);
                      setSelectedCharacterImageUrl(image.storageUrl);
                    }}
                  >
                    <img src={image.storageUrl} alt={image.filename} />
                    <span>{image.filename}</span>
                  </button>
                );
              })}
            </div>
            <InlineStack align="end">
              <Button
                primary
                disabled={!pendingCharacterSelection}
                onClick={() => {
                  setSelectedCharacterImageId(pendingCharacterSelection);
                  setSelectedCharacterImageUrl(pendingCharacterImage?.storageUrl || "");
                  setCharacterModalOpen(false);
                }}
              >
                Use character
              </Button>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title="Select product"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="300">
            <DropZone accept="image/*" type="image" onDrop={handleProductDrop} allowMultiple={false}>
              <DropZone.FileUpload />
            </DropZone>
            {productUploadError && (
              <PolarisBanner tone="critical" title="Upload failed">
                <p>{productUploadError}</p>
              </PolarisBanner>
            )}
            {productUploadFetcher.state !== "idle" && (
              <BlockStack gap="100">
                <Text as="p" variant="bodySm">
                  Uploading product image...
                </Text>
              </BlockStack>
            )}
            {productLoadError ? (
              <PolarisBanner tone="critical" title="Failed to load products">
                <p>{productLoadError}</p>
              </PolarisBanner>
            ) : shopifyProducts.length === 0 ? (
              <PolarisBanner tone="info">
                <p>No Shopify products found.</p>
              </PolarisBanner>
            ) : (
              <>
                <Select
                  label="Select product"
                  options={[
                    { label: "Select a product...", value: "", disabled: true },
                    ...shopifyProducts.map((product) => ({
                      label: product.title,
                      value: product.id,
                    })),
                  ]}
                  value={pendingProductId || ""}
                  onChange={(value) => {
                    setPendingProductId(value);
                    setPendingProductImage(null);
                  }}
                />
                {pendingProduct && (
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">
                      {pendingProduct.title}
                    </Text>
                    <Badge
                      tone={pendingProduct.status === "ACTIVE" ? "success" : "warning"}
                    >
                      {(pendingProduct.status || "ACTIVE").toUpperCase()}
                    </Badge>
                  </InlineStack>
                )}
              </>
            )}

            {pendingProduct && pendingProduct.images.length > 0 && (
              <div className="bainners-image-grid">
                {pendingProduct.images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className={`bainners-image-tile${
                      pendingProductImage?.url === image.url
                        ? " bainners-image-tile--selected"
                        : ""
                    }`}
                    onClick={() =>
                      setPendingProductImage({
                        url: image.url,
                        width: image.width,
                        height: image.height,
                      })
                    }
                  >
                    <img src={image.url} alt={pendingProduct.title} />
                    <span>{pendingProduct.title}</span>
                  </button>
                ))}
              </div>
            )}

            <InlineStack align="end">
              <Button
                primary
                disabled={!pendingProductImage}
                onClick={() => {
                  setSelectedShopifyProductId(pendingProductId || null);
                  setSelectedShopifyImage(pendingProductImage);
                  setProductModalOpen(false);
                }}
              >
                Use product image
              </Button>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
