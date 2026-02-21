import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
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
  DropZone,
  Banner as PolarisBanner,
  Spinner,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { dispatchImageAutomation, dispatchImageStatus } from "../utils/automation.server";
import { getPlanStorageLimitGB, getStorageUsageMB } from "../utils/storage.server";
import { zonedTimeToUtc } from "../utils/timezone.server";
import { InlineEditableText } from "../components/InlineEditableText";
import { AnalyticsLineChart } from "../components/AnalyticsLineChart";
import { DEFAULT_SHOP_DEFAULTS } from "../utils/defaults.server";
import { getPlanLimits, planHasFeature, PlanFeature } from "../lib/plans";
import {
  ArrowLeftIcon,
  DeleteIcon,
  ImageIcon,
  ImageMagicIcon,
  UploadIcon,
  SearchIcon,
  QuestionCircleIcon,
  ViewIcon,
  MegaphoneIcon,
  SlideshowIcon,
  PlayCircleIcon,
} from "@shopify/polaris-icons";

const APP_GALLERY_PAGE_SIZE = 12;
const METAOBJECT_TYPE = "bainners_banner";

function sanitizeCustomCssInput(rawValue: unknown, maxLength = 20000) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  return value.split(String.fromCharCode(0)).join("").slice(0, maxLength);
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
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
        ...DEFAULT_SHOP_DEFAULTS,
      },
    });
  }
  let storageLimitGB = shopRecord.storageLimitGB;
  const desiredStorageLimitGB = getPlanStorageLimitGB(shopRecord.plan);
  if (storageLimitGB !== desiredStorageLimitGB) {
    await db.shop.update({
      where: { shopDomain: shop },
      data: { storageLimitGB: desiredStorageLimitGB },
    });
    storageLimitGB = desiredStorageLimitGB;
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

  const storageUsedMB = await getStorageUsageMB(shopRecord.id);
  const defaultCountdownTimezone = shopRecord.defaultCountdownTimezone || "UTC";

  return json({
    shop: shopRecord.shopDomain,
    plan: shopRecord.plan,
    storageUsedMB,
    storageLimitGB,
    defaultCountdownTimezone,
    banner: {
      id: banner.id,
      title: banner.title,
      descriptionInternal: banner.descriptionInternal || "",
      layout: banner.layout,
      sliderType: banner.sliderType || "slide",
      sliderShowArrows: banner.sliderShowArrows ?? true,
      sliderShowBullets: banner.sliderShowBullets ?? true,
      sliderAutoplay: banner.sliderAutoplay ?? false,
      sliderLoop: banner.sliderLoop ?? true,
      sliderPerView: banner.sliderPerView ?? 1,
      sliderSpeed: banner.sliderSpeed || "regular",
      sliderAutoplayDelay: banner.sliderAutoplayDelay ?? 3500,
      sliderCentered: banner.sliderCentered ?? false,
      sliderSpaceBetween: banner.sliderSpaceBetween ?? 16,
      sliderPauseOnHover: banner.sliderPauseOnHover ?? true,
      sliderArrowStyle: banner.sliderArrowStyle || "chevron",
      sliderArrowColor: banner.sliderArrowColor || "",
      sliderBulletColor: banner.sliderBulletColor || "",
      announcementText: banner.announcementText || "",
      announcementCtaText: banner.announcementCtaText || "",
      announcementCtaUrl: banner.announcementCtaUrl || "",
      announcementCtaTarget: banner.announcementCtaTarget || "_self",
      announcementClosable: banner.announcementClosable ?? false,
      announcementShowText: banner.announcementShowText ?? true,
      announcementShowCta: banner.announcementShowCta ?? true,
      announcementShowCoupon: banner.announcementShowCoupon ?? false,
      announcementCouponCode: banner.announcementCouponCode || "",
      announcementCouponTextColor: banner.announcementCouponTextColor || "",
      announcementCouponBorderColor: banner.announcementCouponBorderColor || "",
      announcementCouponBackgroundColor: banner.announcementCouponBackgroundColor || "",
      announcementContentOrder: Array.isArray(banner.announcementContentOrder)
        ? banner.announcementContentOrder
        : ["text", "coupon", "cta", "countdown"],
      announcementLayout: banner.announcementLayout || "inline",
      announcementContentSpacing: banner.announcementContentSpacing ?? 12,
      announcementCloseColor: banner.announcementCloseColor || "",
      announcementMarquee: banner.announcementMarquee ?? false,
      announcementAnimation: banner.announcementAnimation || "none",
      announcementSeparatorEnabled: banner.announcementSeparatorEnabled ?? false,
      announcementSeparatorText: banner.announcementSeparatorText || "|",
      announcementShowCountdown: banner.announcementShowCountdown,
      announcementCountdownMode: banner.announcementCountdownMode || "fixed",
      announcementCountdownEndAt: banner.announcementCountdownEndAt
        ? banner.announcementCountdownEndAt.toISOString().slice(0, 16)
        : "",
      announcementCountdownTimezone:
        banner.announcementCountdownTimezone || defaultCountdownTimezone || "UTC",
      announcementCountdownDurationHours: banner.announcementCountdownDurationHours || "1",
      announcementCountdownShowLabels: banner.announcementCountdownShowLabels ?? false,
      bannerBackgroundColor: banner.bannerBackgroundColor || "",
      titleFontSize: banner.titleFontSize || "lg",
      descriptionFontSize: banner.descriptionFontSize || "md",
      titleColor: banner.titleColor || "",
      descriptionColor: banner.descriptionColor || "",
      ctaTextColor: banner.ctaTextColor || "",
      ctaBackgroundColor: banner.ctaBackgroundColor || "",
      ctaBorderColor: banner.ctaBorderColor || "",
      ctaBordered: banner.ctaBordered ?? false,
      ctaRounded: banner.ctaRounded ?? true,
      ctaShadow: banner.ctaShadow ?? false,
      ctaStyle: banner.ctaStyle || "button",
      ctaUnderline: banner.ctaUnderline ?? false,
      countdownTextColor: banner.countdownTextColor || "",
      countdownBackgroundColor: banner.countdownBackgroundColor || "",
      countdownStyle: banner.countdownStyle || "solid",
      countdownFontSize: banner.countdownFontSize || "md",
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
      scheduledStartAt: item.scheduledStartAt
        ? item.scheduledStartAt.toISOString().slice(0, 16)
        : "",
      scheduledEndAt: item.scheduledEndAt
        ? item.scheduledEndAt.toISOString().slice(0, 16)
        : "",
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
    shopifyProducts: [],
    shopifyFiles: [],
    productLoadError: null,
  });
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: any) {
  if (actionResult && typeof actionResult === "object" && actionResult.skipRevalidate) {
    return false;
  }
  return defaultShouldRevalidate;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
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
  const planLimits = getPlanLimits(shopRecord.plan);
  const defaultCountdownTimezone = shopRecord.defaultCountdownTimezone || "UTC";

  if (action === "load-shopify-products") {
    let shopifyProducts: Array<{
      id: string;
      title: string;
      handle?: string;
      status?: string;
      featuredImage?: { url: string; altText?: string };
      images: Array<{ id: string; url: string; width: number; height: number }>;
    }> = [];
    let productLoadError: string | null = null;
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
      productLoadError =
        error instanceof Error ? error.message : "Failed to load Shopify products";
      console.warn("Failed to load Shopify products", error);
    }

    return json({ success: true, shopifyProducts, productLoadError, skipRevalidate: true });
  }

  if (action === "load-shopify-files") {
    let shopifyFiles: Array<{
      id: string;
      url: string;
      width: number;
      height: number;
      filename: string;
    }> = [];
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

    return json({ success: true, shopifyFiles, skipRevalidate: true });
  }

  const banner = await db.banner.findFirst({
    where: { id: bannerId, shopId: shopRecord.id },
  });

  if (!banner) {
    return json({ success: false, error: "Banner not found" }, { status: 404 });
  }

  if (action === "update-banner") {
    const nextStatus = (formData.get("status") as string) || banner.status;
    const announcementContentOrder = formData.has("announcementContentOrder")
      ? (() => {
          try {
            const parsed = JSON.parse(formData.get("announcementContentOrder") as string);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : null;
    const toZonedDate = (value: FormDataEntryValue | null) => {
      if (!value) return null;
      const raw = String(value).trim();
      if (!raw) return null;
      return zonedTimeToUtc(raw, defaultCountdownTimezone);
    };
    if (nextStatus === "active") {
      const activeCount = await db.banner.count({
        where: {
          shopId: shopRecord.id,
          status: "active",
          id: { not: banner.id },
        },
      });
      if (Number.isFinite(planLimits.activeBanners) && activeCount >= planLimits.activeBanners) {
        return json(
          {
            success: false,
            error: `Your plan allows up to ${planLimits.activeBanners} active banners.`,
          },
          { status: 400 }
        );
      }
    }

    await db.banner.update({
      where: { id: banner.id },
      data: {
        title: (formData.get("title") as string) || banner.title,
        descriptionInternal: (formData.get("descriptionInternal") as string) || null,
        layout: (formData.get("layout") as string) || banner.layout,
        sliderType: (formData.get("sliderType") as string) || banner.sliderType,
        sliderShowArrows: formData.has("sliderShowArrows")
          ? formData.get("sliderShowArrows") === "true"
          : banner.sliderShowArrows,
        sliderShowBullets: formData.has("sliderShowBullets")
          ? formData.get("sliderShowBullets") === "true"
          : banner.sliderShowBullets,
        sliderAutoplay: formData.has("sliderAutoplay")
          ? formData.get("sliderAutoplay") === "true"
          : banner.sliderAutoplay,
        sliderLoop: formData.has("sliderLoop")
          ? formData.get("sliderLoop") === "true"
          : banner.sliderLoop,
        sliderPerView: formData.has("sliderPerView")
          ? Number(formData.get("sliderPerView") || 1)
          : banner.sliderPerView,
        sliderSpeed: formData.has("sliderSpeed")
          ? ((formData.get("sliderSpeed") as string) || null)
          : banner.sliderSpeed,
        sliderAutoplayDelay: formData.has("sliderAutoplayDelay")
          ? Number(formData.get("sliderAutoplayDelay") || 3500)
          : banner.sliderAutoplayDelay,
        sliderCentered: formData.has("sliderCentered")
          ? formData.get("sliderCentered") === "true"
          : banner.sliderCentered,
        sliderSpaceBetween: formData.has("sliderSpaceBetween")
          ? Number(formData.get("sliderSpaceBetween") || 16)
          : banner.sliderSpaceBetween,
        sliderPauseOnHover: formData.has("sliderPauseOnHover")
          ? formData.get("sliderPauseOnHover") === "true"
          : banner.sliderPauseOnHover,
        sliderArrowStyle: formData.has("sliderArrowStyle")
          ? ((formData.get("sliderArrowStyle") as string) || null)
          : banner.sliderArrowStyle,
        sliderArrowColor: formData.has("sliderArrowColor")
          ? ((formData.get("sliderArrowColor") as string) || null)
          : banner.sliderArrowColor,
        sliderBulletColor: formData.has("sliderBulletColor")
          ? ((formData.get("sliderBulletColor") as string) || null)
          : banner.sliderBulletColor,
        status: nextStatus,
        announcementText: formData.has("announcementText")
          ? ((formData.get("announcementText") as string) || null)
          : banner.announcementText,
        announcementCtaText: formData.has("announcementCtaText")
          ? ((formData.get("announcementCtaText") as string) || null)
          : banner.announcementCtaText,
        announcementCtaUrl: formData.has("announcementCtaUrl")
          ? ((formData.get("announcementCtaUrl") as string) || null)
          : banner.announcementCtaUrl,
        announcementCtaTarget: formData.has("announcementCtaTarget")
          ? ((formData.get("announcementCtaTarget") as string) || null)
          : banner.announcementCtaTarget,
        announcementClosable: formData.has("announcementClosable")
          ? formData.get("announcementClosable") === "true"
          : banner.announcementClosable,
        announcementShowText: formData.has("announcementShowText")
          ? formData.get("announcementShowText") === "true"
          : banner.announcementShowText,
        announcementShowCta: formData.has("announcementShowCta")
          ? formData.get("announcementShowCta") === "true"
          : banner.announcementShowCta,
        announcementShowCoupon: formData.has("announcementShowCoupon")
          ? formData.get("announcementShowCoupon") === "true"
          : banner.announcementShowCoupon,
        announcementCouponCode: formData.has("announcementCouponCode")
          ? ((formData.get("announcementCouponCode") as string) || null)
          : banner.announcementCouponCode,
        announcementContentOrder: formData.has("announcementContentOrder")
          ? announcementContentOrder
          : banner.announcementContentOrder,
        announcementLayout: formData.has("announcementLayout")
          ? ((formData.get("announcementLayout") as string) || null)
          : banner.announcementLayout,
        announcementContentSpacing: formData.has("announcementContentSpacing")
          ? Number(formData.get("announcementContentSpacing") || 12)
          : banner.announcementContentSpacing,
        announcementCloseColor: formData.has("announcementCloseColor")
          ? ((formData.get("announcementCloseColor") as string) || null)
          : banner.announcementCloseColor,
        announcementMarquee: formData.has("announcementMarquee")
          ? formData.get("announcementMarquee") === "true"
          : banner.announcementMarquee,
        announcementAnimation: formData.has("announcementAnimation")
          ? ((formData.get("announcementAnimation") as string) || null)
          : banner.announcementAnimation,
        announcementSeparatorEnabled: formData.has("announcementSeparatorEnabled")
          ? formData.get("announcementSeparatorEnabled") === "true"
          : banner.announcementSeparatorEnabled,
        announcementSeparatorText: formData.has("announcementSeparatorText")
          ? ((formData.get("announcementSeparatorText") as string) || null)
          : banner.announcementSeparatorText,
        announcementCouponTextColor: formData.has("announcementCouponTextColor")
          ? ((formData.get("announcementCouponTextColor") as string) || null)
          : banner.announcementCouponTextColor,
        announcementCouponBorderColor: formData.has("announcementCouponBorderColor")
          ? ((formData.get("announcementCouponBorderColor") as string) || null)
          : banner.announcementCouponBorderColor,
        announcementCouponBackgroundColor: formData.has("announcementCouponBackgroundColor")
          ? ((formData.get("announcementCouponBackgroundColor") as string) || null)
          : banner.announcementCouponBackgroundColor,
        announcementShowCountdown: formData.has("announcementShowCountdown")
          ? formData.get("announcementShowCountdown") === "true"
          : banner.announcementShowCountdown,
        announcementCountdownMode: formData.has("announcementCountdownMode")
          ? ((formData.get("announcementCountdownMode") as string) || null)
          : banner.announcementCountdownMode,
        announcementCountdownEndAt: formData.has("announcementCountdownEndAt")
          ? toZonedDate(formData.get("announcementCountdownEndAt"))
          : banner.announcementCountdownEndAt,
        announcementCountdownTimezone: formData.has("announcementCountdownTimezone")
          ? ((formData.get("announcementCountdownTimezone") as string) || null)
          : banner.announcementCountdownTimezone,
        announcementCountdownDurationHours: formData.has("announcementCountdownDurationHours")
          ? ((formData.get("announcementCountdownDurationHours") as string) || null)
          : banner.announcementCountdownDurationHours,
        announcementCountdownShowLabels: formData.has("announcementCountdownShowLabels")
          ? formData.get("announcementCountdownShowLabels") === "true"
          : banner.announcementCountdownShowLabels,
        bannerBackgroundColor: formData.has("bannerBackgroundColor")
          ? ((formData.get("bannerBackgroundColor") as string) || null)
          : banner.bannerBackgroundColor,
        titleFontSize: formData.has("titleFontSize")
          ? ((formData.get("titleFontSize") as string) || null)
          : banner.titleFontSize,
        descriptionFontSize: formData.has("descriptionFontSize")
          ? ((formData.get("descriptionFontSize") as string) || null)
          : banner.descriptionFontSize,
        titleColor: formData.has("titleColor")
          ? ((formData.get("titleColor") as string) || null)
          : banner.titleColor,
        descriptionColor: formData.has("descriptionColor")
          ? ((formData.get("descriptionColor") as string) || null)
          : banner.descriptionColor,
        ctaTextColor: formData.has("ctaTextColor")
          ? ((formData.get("ctaTextColor") as string) || null)
          : banner.ctaTextColor,
        ctaBackgroundColor: formData.has("ctaBackgroundColor")
          ? ((formData.get("ctaBackgroundColor") as string) || null)
          : banner.ctaBackgroundColor,
        ctaBorderColor: formData.has("ctaBorderColor")
          ? ((formData.get("ctaBorderColor") as string) || null)
          : banner.ctaBorderColor,
        ctaBordered: formData.has("ctaBordered")
          ? formData.get("ctaBordered") === "true"
          : banner.ctaBordered,
        ctaRounded: formData.has("ctaRounded")
          ? formData.get("ctaRounded") === "true"
          : banner.ctaRounded,
        ctaShadow: formData.has("ctaShadow")
          ? formData.get("ctaShadow") === "true"
          : banner.ctaShadow,
        ctaStyle: formData.has("ctaStyle")
          ? ((formData.get("ctaStyle") as string) || null)
          : banner.ctaStyle,
        ctaUnderline: formData.has("ctaUnderline")
          ? formData.get("ctaUnderline") === "true"
          : banner.ctaUnderline,
        countdownTextColor: formData.has("countdownTextColor")
          ? ((formData.get("countdownTextColor") as string) || null)
          : banner.countdownTextColor,
        countdownBackgroundColor: formData.has("countdownBackgroundColor")
          ? ((formData.get("countdownBackgroundColor") as string) || null)
          : banner.countdownBackgroundColor,
        countdownStyle: formData.has("countdownStyle")
          ? ((formData.get("countdownStyle") as string) || null)
          : banner.countdownStyle,
        countdownFontSize: formData.has("countdownFontSize")
          ? ((formData.get("countdownFontSize") as string) || null)
          : banner.countdownFontSize,
        customCss: formData.has("customCss")
          ? shopRecord.plan === "free"
            ? null
            : sanitizeCustomCssInput(formData.get("customCss"))
          : banner.customCss,
        scheduledStartAt: formData.has("scheduledStartAt")
          ? planHasFeature(shopRecord.plan, PlanFeature.SCHEDULING)
            ? toZonedDate(formData.get("scheduledStartAt"))
            : null
          : banner.scheduledStartAt,
        scheduledEndAt: formData.has("scheduledEndAt")
          ? planHasFeature(shopRecord.plan, PlanFeature.SCHEDULING)
            ? toZonedDate(formData.get("scheduledEndAt"))
            : null
          : banner.scheduledEndAt,
      },
    });

    // Only sync metaobjects when status actually changes
    if (nextStatus !== banner.status) {
      await syncAllBannerMetaobjects(admin, shopRecord.id);
    }

    return json({ success: true, skipRevalidate: true });
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

    return json({ success: true, skipRevalidate: true });
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
    if (!getAllowedAspectRatios(shopRecord.plan).includes(aspectRatio)) {
      return json({ success: false, error: "Aspect ratio not allowed for plan." }, { status: 400 });
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
      skipRevalidate: true,
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
    if (!getAllowedAspectRatios(shopRecord.plan).includes(aspectRatio)) {
      return json({ success: false, error: "Aspect ratio not allowed for plan." }, { status: 400 });
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
      return json({ success: true, state: "waiting", skipRevalidate: true });
    }

    const sizeInMB = parseFilesize(n8nImage.filesize || 0);

    const existing = await db.image.findFirst({
      where: { shopId: shopRecord.id, storageUrl: n8nImage.imageUrl },
    });

    const remoteMeta = await fetchRemoteImageMeta(n8nImage.imageUrl, n8nImage.filename);
    const resolvedWidth = remoteMeta.width || n8nImage.width || 1920;
    const resolvedHeight = remoteMeta.height || n8nImage.height || 1080;
    const resolvedFormat =
      remoteMeta.format ||
      getFormatFromName(n8nImage.filename || n8nImage.imageUrl || "") ||
      "png";
    const resolvedAspectRatio =
      aspectRatio || getAspectRatioFromDimensions(resolvedWidth, resolvedHeight) || "16:9";

    const image =
      existing ||
      (await db.image.create({
        data: {
          shopId: shopRecord.id,
          filename: n8nImage.filename || "generated-image.webp",
          storageUrl: n8nImage.imageUrl,
          sizeInMB,
          width: resolvedWidth,
          height: resolvedHeight,
          aspectRatio: resolvedAspectRatio,
          format: resolvedFormat,
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
      skipRevalidate: true,
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

    const remoteMeta = await fetchRemoteImageMeta(n8nImage.imageUrl, n8nImage.filename);
    const resolvedWidth = remoteMeta.width || n8nImage.width || 1920;
    const resolvedHeight = remoteMeta.height || n8nImage.height || 1080;
    const resolvedFormat =
      remoteMeta.format ||
      getFormatFromName(n8nImage.filename || n8nImage.imageUrl || "") ||
      "png";
    const resolvedAspectRatio =
      getAspectRatioFromDimensions(resolvedWidth, resolvedHeight) || "16:9";

    const image = await db.image.create({
      data: {
        shopId: shopRecord.id,
        filename: n8nImage.filename || imageFile.name,
        storageUrl: n8nImage.imageUrl,
        sizeInMB,
        width: resolvedWidth,
        height: resolvedHeight,
        aspectRatio: resolvedAspectRatio,
        format: resolvedFormat,
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
      skipRevalidate: true,
    });
  }

  if (action === "add-video") {
    const videoUrl = (formData.get("videoUrl") as string) || "";
    const autoplay = formData.get("autoplay") === "true";
    const muted = formData.get("muted") === "true";
    const loop = formData.get("loop") === "true";
    const showControls = formData.get("showControls") !== "false";

    if (!videoUrl) {
      return json({ success: false, error: "Video URL is required." }, { status: 400 });
    }

    if (banner.layout === "slider" && shopRecord.plan === "free") {
      const sliderCount = await db.bannerItem.count({
        where: { bannerId: banner.id },
      });
      if (sliderCount >= 5) {
        return json(
          { success: false, error: "Free plan allows up to 5 slider items." },
          { status: 400 }
        );
      }
    }

    const parsed = parseVideoUrl(videoUrl);
    if (!parsed) {
      return json(
        { success: false, error: "Please use a valid YouTube or Vimeo URL." },
        { status: 400 }
      );
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

    const displayOrder = await db.bannerItem.count({
      where: { bannerId: banner.id },
    });

    const videoThumbnailUrl =
      parsed.provider === "youtube"
        ? `https://img.youtube.com/vi/${parsed.id}/hqdefault.jpg`
        : `https://vumbnail.com/${parsed.id}.jpg`;

    const item = await db.bannerItem.create({
      data: {
        shopId: shopRecord.id,
        bannerId: banner.id,
        displayOrder,
        isSelected: displayOrder === 0,
        tags: {
          mediaType: "video",
          videoUrl,
          videoProvider: parsed.provider,
          videoId: parsed.id,
          videoThumbnailUrl,
          autoplay,
          muted,
          loop,
          showControls,
          showOverlay: false,
          showTextOverlay: false,
          textTitle: "",
          textDescription: "",
          textPosition: "bottom_left",
          showCta: false,
          ctaText: "",
          ctaUrl: "",
          ctaTarget: "_self",
          ctaMode: "button",
          showCountdown: false,
          countdownMode: "fixed",
          countdownEndAt: "",
          countdownTimezone: defaultCountdownTimezone || "UTC",
          countdownDurationHours: "1",
          contentOrder: ["title", "description", "cta", "countdown"],
        },
      },
    });

    return json({
      success: true,
      item: {
        id: item.id,
        title: item.title || banner.title,
        description: item.description || banner.descriptionInternal || "",
        imageUrl: "",
        imageId: null,
        externalImageUrl: null,
        sourceType: "video",
        sizeInMB: 0,
        isSelected: item.isSelected,
        tags: item.tags || {},
        createdAt: item.createdAt.toISOString(),
      },
      skipRevalidate: true,
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

    if (banner.layout === "slider" && shopRecord.plan === "free") {
      const sliderCount = await db.bannerItem.count({
        where: { bannerId: banner.id },
      });
      if (sliderCount >= 5) {
        return json(
          { success: false, error: "Free plan allows up to 5 slider items." },
          { status: 400 }
        );
      }
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

    const createdItem = await db.bannerItem.create({
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
      include: { image: true },
    });

    // Update banner's updatedAt timestamp
    await db.banner.update({
      where: { id: banner.id },
      data: { updatedAt: new Date() },
    });

    return json({
      success: true,
      item: {
        id: createdItem.id,
        title: createdItem.title || banner.title,
        description: createdItem.description || banner.descriptionInternal || "",
        imageUrl: createdItem.image?.storageUrl || createdItem.externalImageUrl || "",
        imageId: createdItem.imageId || null,
        externalImageUrl: createdItem.externalImageUrl || null,
        sourceType:
          createdItem.image?.sourceType || (createdItem.externalImageUrl ? "shopify" : "unknown"),
        sizeInMB: createdItem.image?.sizeInMB || 0,
        isSelected: createdItem.isSelected,
        tags: createdItem.tags || {},
        createdAt: createdItem.createdAt.toISOString(),
      },
      externalImageWidth,
      externalImageHeight,
      skipRevalidate: true,
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

    return json({ success: true, removedItemId: itemId, skipRevalidate: true });
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

    if (formData.has("tagsJson")) {
      const tagsJson = formData.get("tagsJson") as string;
      const nextTags = tagsJson ? JSON.parse(tagsJson) : {};
      const toZonedDate = (value: FormDataEntryValue | null) => {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;
        return zonedTimeToUtc(raw, defaultCountdownTimezone);
      };
      const scheduledStartAt = formData.has("scheduledStartAt")
        ? planHasFeature(shopRecord.plan, PlanFeature.SCHEDULING)
          ? ((formData.get("scheduledStartAt") as string) || null)
            ? toZonedDate(formData.get("scheduledStartAt"))
            : null
          : null
        : undefined;
      const scheduledEndAt = formData.has("scheduledEndAt")
        ? planHasFeature(shopRecord.plan, PlanFeature.SCHEDULING)
          ? ((formData.get("scheduledEndAt") as string) || null)
            ? toZonedDate(formData.get("scheduledEndAt"))
            : null
          : null
        : undefined;

      if (nextTags.countdownMode === "fixed" && nextTags.countdownEndAt) {
        const converted = zonedTimeToUtc(nextTags.countdownEndAt, defaultCountdownTimezone);
        nextTags.countdownEndAt = converted ? converted.toISOString() : "";
      }
      if (nextTags.countdownMode !== "fixed") {
        nextTags.countdownEndAt = "";
      }
      nextTags.countdownTimezone = defaultCountdownTimezone;

      await db.bannerItem.update({
        where: { id: itemId, bannerId: banner.id },
        data: {
          tags: nextTags,
          ...(scheduledStartAt !== undefined ? { scheduledStartAt } : {}),
          ...(scheduledEndAt !== undefined ? { scheduledEndAt } : {}),
        },
      });
      return json({ success: true, skipRevalidate: true });
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
    if (formData.has("ctaTarget")) {
      nextTags.ctaTarget = (formData.get("ctaTarget") as string) || "_self";
    }
    if (formData.has("ctaMode")) {
      nextTags.ctaMode = (formData.get("ctaMode") as string) || "button";
    }

    await db.bannerItem.update({
      where: { id: itemId, bannerId: banner.id },
      data: {
        tags: nextTags,
      },
    });

    return json({ success: true, skipRevalidate: true });
  }

  if (action === "delete-banner") {
    await db.banner.delete({
      where: { id: banner.id },
    });

    // Sync metaobjects after deleting banner
    await syncAllBannerMetaobjects(admin, shopRecord.id);

    const redirectUrl = new URL("/app/banners", request.url);
    const redirectParams = new URLSearchParams(url.searchParams);
    redirectParams.delete("_data");
    redirectUrl.search = redirectParams.toString();
    return redirect(redirectUrl.toString());
  }

  if (action === "get-analytics") {
    const scope = (formData.get("scope") as string) || "banner";
    const rangeParam = formData.get("range") as string;
    const maxRange = planLimits.analyticsRange;
    const rangeDays = Math.max(7, Math.min(maxRange, Number(rangeParam) || 7));

    const today = new Date();
    const startDate = new Date(today);
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));

    if (scope === "item") {
      const itemId = (formData.get("itemId") as string) || "";
      if (!itemId) {
        return json({ success: false, error: "Missing itemId", scope }, { status: 400 });
      }

      const item = await db.bannerItem.findFirst({
        where: { id: itemId, bannerId: banner.id },
        select: { id: true },
      });
      if (!item) {
        return json({ success: false, error: "Item not found", scope }, { status: 404 });
      }

      const dailyTotals = await db.bannerItemAnalytic.groupBy({
        by: ["date"],
        where: { bannerItemId: item.id, date: { gte: startDate } },
        _sum: { views: true, clicks: true },
        orderBy: { date: "asc" },
      });

      const chart: Array<{ date: string; views: number; clicks: number }> = [];
      const dailyMap = new Map(
        dailyTotals.map((row) => [
          row.date.toISOString().slice(0, 10),
          { views: row._sum.views || 0, clicks: row._sum.clicks || 0 },
        ])
      );
      for (let i = 0; i < rangeDays; i += 1) {
        const day = new Date(startDate);
        day.setUTCDate(startDate.getUTCDate() + i);
        const key = day.toISOString().slice(0, 10);
        const values = dailyMap.get(key) || { views: 0, clicks: 0 };
        chart.push({ date: key, views: values.views, clicks: values.clicks });
      }

      const totals = chart.reduce(
        (acc, row) => {
          acc.views += row.views;
          acc.clicks += row.clicks;
          return acc;
        },
        { views: 0, clicks: 0 }
      );

      const showCtr = planHasFeature(shopRecord.plan, PlanFeature.ANALYTICS_CTR);
      const showChart = planHasFeature(shopRecord.plan, PlanFeature.ADVANCED_ANALYTICS);
      return json({
        success: true,
        scope,
        rangeDays,
        totals: {
          views: totals.views,
          clicks: totals.clicks,
          ctr: showCtr ? (totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0) : 0,
        },
        chart: showChart ? chart : [],
        skipRevalidate: true,
      });
    }

    const dailyTotals = await db.bannerAnalytic.groupBy({
      by: ["date"],
      where: { bannerId: banner.id, date: { gte: startDate } },
      _sum: { views: true, clicks: true },
      orderBy: { date: "asc" },
    });

    const chart: Array<{ date: string; views: number; clicks: number }> = [];
    const dailyMap = new Map(
      dailyTotals.map((row) => [
        row.date.toISOString().slice(0, 10),
        { views: row._sum.views || 0, clicks: row._sum.clicks || 0 },
      ])
    );
    for (let i = 0; i < rangeDays; i += 1) {
      const day = new Date(startDate);
      day.setUTCDate(startDate.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      const values = dailyMap.get(key) || { views: 0, clicks: 0 };
      chart.push({ date: key, views: values.views, clicks: values.clicks });
    }

    const totals = chart.reduce(
      (acc, row) => {
        acc.views += row.views;
        acc.clicks += row.clicks;
        return acc;
      },
      { views: 0, clicks: 0 }
    );

    const showCtr = planHasFeature(shopRecord.plan, PlanFeature.ANALYTICS_CTR);
    const showChart = planHasFeature(shopRecord.plan, PlanFeature.ADVANCED_ANALYTICS);
    return json({
      success: true,
      scope,
      rangeDays,
      totals: {
        views: totals.views,
        clicks: totals.clicks,
        ctr: showCtr ? (totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0) : 0,
      },
      chart: showChart ? chart : [],
      skipRevalidate: true,
    });
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

function getAllowedAspectRatios(plan?: string): string[] {
  if (plan === "free") {
    return ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "auto"];
  }
  return ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"];
}

function getFormatFromName(value: string): string | null {
  if (!value) return null;
  const match = value.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
  if (!match) return null;
  const ext = match[1];
  if (ext === "jpeg") return "jpg";
  return ext;
}

function getAspectRatioFromDimensions(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function detectFormatFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "jpg";
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "gif";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

function getPngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getGifSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 10) return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function getJpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    const size = buffer.readUInt16BE(offset + 2);
    if (!size) break;
    offset += 2 + size;
  }
  return null;
}

function getWebpSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) return null;
  const chunkType = buffer.toString("ascii", 12, 16);
  const dataOffset = 20;
  if (chunkType === "VP8X") {
    const width =
      1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height =
      1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }
  if (chunkType === "VP8 ") {
    if (buffer.length < dataOffset + 10) return null;
    return {
      width: buffer.readUInt16LE(dataOffset + 6),
      height: buffer.readUInt16LE(dataOffset + 8),
    };
  }
  if (chunkType === "VP8L") {
    if (buffer.length < dataOffset + 5) return null;
    const b0 = buffer[dataOffset + 1];
    const b1 = buffer[dataOffset + 2];
    const b2 = buffer[dataOffset + 3];
    const b3 = buffer[dataOffset + 4];
    const width = 1 + (((b0 & 0x3f) << 8) | buffer[dataOffset]);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  return null;
}

async function fetchRemoteImageMeta(url: string, filename?: string): Promise<{
  width?: number;
  height?: number;
  format?: string;
}> {
  if (!url) return {};
  try {
    let response = await fetch(url, { headers: { Range: "bytes=0-65535" } });
    if (!response.ok) {
      response = await fetch(url);
    }
    if (!response.ok) {
      console.warn("[fetchRemoteImageMeta] Failed to fetch image metadata", {
        url,
        status: response.status,
      });
      return {};
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const format = getFormatFromName(filename || url) || detectFormatFromBuffer(buffer);
    let size: { width: number; height: number } | null = null;
    if (format === "png") size = getPngSize(buffer);
    else if (format === "gif") size = getGifSize(buffer);
    else if (format === "jpg" || format === "jpeg") size = getJpegSize(buffer);
    else if (format === "webp") size = getWebpSize(buffer);
    else {
      size =
        getPngSize(buffer) || getGifSize(buffer) || getJpegSize(buffer) || getWebpSize(buffer);
    }
    return {
      format: format || undefined,
      width: size?.width,
      height: size?.height,
    };
  } catch {
    console.warn("[fetchRemoteImageMeta] Error while reading image metadata", { url });
    return {};
  }
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

function parseVideoUrl(url: string): { provider: "youtube" | "vimeo"; id: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");

    if (host.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return { provider: "youtube", id };
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "");
      if (id) return { provider: "youtube", id };
    }

    if (host.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return { provider: "vimeo", id };
    }

    return null;
  } catch {
    return null;
  }
}

export default function BannerEdit() {
  const {
    shop,
    plan,
    banner,
    bannerItems,
    appImages,
    shopifyProducts,
    shopifyFiles,
    productLoadError,
    defaultCountdownTimezone,
  } = useLoaderData<typeof loader>();
  const location = useLocation();
  const editSearch = location.search || "";
  const themeEditorUrl = shop
    ? `https://${shop}/admin/themes/current/editor?template=index`
    : "";

  const updateFetcher = useFetcher();
  const itemUpdateFetcher = useFetcher();
  const generateFetcher = useFetcher();
  const pollFetcher = useFetcher();
  const uploadFetcher = useFetcher();
  const productFetcher = useFetcher();
  const filesFetcher = useFetcher();
  const characterUploadFetcher = useFetcher();
  const productUploadFetcher = useFetcher();
  const attachFetcher = useFetcher();
  const videoFetcher = useFetcher();
  const reorderFetcher = useFetcher();
  const removeItemFetcher = useFetcher();
  const analyticsFetcher = useFetcher();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalOption, setModalOption] = useState<
    "gallery" | "upload" | "video" | "generate" | null
  >(
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
  const [sliderShowArrows, setSliderShowArrows] = useState(banner.sliderShowArrows ?? true);
  const [sliderShowBullets, setSliderShowBullets] = useState(banner.sliderShowBullets ?? true);
  const [sliderAutoplay, setSliderAutoplay] = useState(banner.sliderAutoplay ?? false);
  const [sliderLoop, setSliderLoop] = useState(banner.sliderLoop ?? true);
  const [sliderPerView, setSliderPerView] = useState(
    String(banner.sliderPerView ?? 1)
  );
  const [sliderSpeed, setSliderSpeed] = useState(banner.sliderSpeed || "regular");
  const [sliderAutoplayDelay, setSliderAutoplayDelay] = useState(
    String(banner.sliderAutoplayDelay ?? 3500)
  );
  const [sliderCentered, setSliderCentered] = useState(banner.sliderCentered ?? false);
  const [sliderSpaceBetween, setSliderSpaceBetween] = useState(
    String(banner.sliderSpaceBetween ?? 16)
  );
  const [sliderPauseOnHover, setSliderPauseOnHover] = useState(
    banner.sliderPauseOnHover ?? true
  );
  const [announcementClosableValue, setAnnouncementClosableValue] = useState(
    banner.announcementClosable ?? false
  );
  const [announcementShowText, setAnnouncementShowText] = useState(
    banner.announcementShowText ?? true
  );
  const [announcementShowCta, setAnnouncementShowCta] = useState(
    banner.announcementShowCta ?? true
  );
  const [announcementShowCoupon, setAnnouncementShowCoupon] = useState(
    banner.announcementShowCoupon ?? false
  );
  const [announcementCouponCode, setAnnouncementCouponCode] = useState(
    banner.announcementCouponCode || ""
  );
  const normalizeAnnouncementOrder = (order?: string[]) => {
    const base = ["text", "coupon", "cta", "countdown"];
    if (!Array.isArray(order)) return base;
    const filtered = order.filter((key) => base.includes(key));
    base.forEach((key) => {
      if (!filtered.includes(key)) filtered.push(key);
    });
    return filtered;
  };

  const [announcementContentOrder, setAnnouncementContentOrder] = useState<string[]>(
    normalizeAnnouncementOrder(
      Array.isArray(banner.announcementContentOrder)
        ? (banner.announcementContentOrder as string[])
        : undefined
    )
  );
  const [announcementLayoutMode, setAnnouncementLayoutMode] = useState(
    banner.announcementLayout || "inline"
  );
  const [announcementContentSpacing, setAnnouncementContentSpacing] = useState(
    String(banner.announcementContentSpacing ?? 12)
  );
  const [announcementDragIndex, setAnnouncementDragIndex] = useState<number | null>(null);
  const [advancedValues, setAdvancedValues] = useState(() => ({
    bannerBackgroundColor: banner.bannerBackgroundColor || "",
    titleFontSize: banner.titleFontSize || "lg",
    descriptionFontSize: banner.descriptionFontSize || "md",
    titleColor: banner.titleColor || "",
    descriptionColor: banner.descriptionColor || "",
    ctaTextColor: banner.ctaTextColor || "",
    ctaBackgroundColor: banner.ctaBackgroundColor || "",
    ctaBorderColor: banner.ctaBorderColor || "",
    ctaBordered: banner.ctaBordered ?? false,
    ctaRounded: banner.ctaRounded ?? true,
    ctaShadow: banner.ctaShadow ?? false,
    ctaStyle: banner.ctaStyle || "button",
    ctaUnderline: banner.ctaUnderline ?? false,
    countdownTextColor: banner.countdownTextColor || "",
    countdownBackgroundColor: banner.countdownBackgroundColor || "",
    countdownStyle: banner.countdownStyle || "solid",
    countdownFontSize: banner.countdownFontSize || "md",
    announcementMarquee: banner.announcementMarquee ?? false,
    announcementAnimation: banner.announcementAnimation || "none",
    announcementCloseColor: banner.announcementCloseColor || "",
    announcementSeparatorEnabled: banner.announcementSeparatorEnabled ?? false,
    announcementSeparatorText: banner.announcementSeparatorText || "|",
    announcementContentSpacing: banner.announcementContentSpacing ?? 12,
    announcementCouponTextColor: banner.announcementCouponTextColor || "",
    announcementCouponBorderColor: banner.announcementCouponBorderColor || "",
    announcementCouponBackgroundColor: banner.announcementCouponBackgroundColor || "",
    sliderArrowStyle: banner.sliderArrowStyle || "chevron",
    sliderArrowColor: banner.sliderArrowColor || "",
    sliderBulletColor: banner.sliderBulletColor || "",
  }));
  const [advancedDraft, setAdvancedDraft] = useState(advancedValues);
  const [announcementText, setAnnouncementText] = useState(banner.announcementText || "");
  const [announcementCtaText, setAnnouncementCtaText] = useState(
    banner.announcementCtaText || ""
  );
  const [announcementCtaUrl, setAnnouncementCtaUrl] = useState(
    banner.announcementCtaUrl || ""
  );
  const [announcementCtaTarget, setAnnouncementCtaTarget] = useState(
    banner.announcementCtaTarget || "_self"
  );
  const [announcementShowCountdown, setAnnouncementShowCountdown] = useState(
    Boolean(banner.announcementShowCountdown)
  );
  const [announcementCountdownMode, setAnnouncementCountdownMode] = useState(
    banner.announcementCountdownMode || "fixed"
  );
  const [announcementCountdownEndAt, setAnnouncementCountdownEndAt] = useState(
    banner.announcementCountdownEndAt || ""
  );
  const [announcementCountdownTimezone] = useState(
    banner.announcementCountdownTimezone || defaultCountdownTimezone || "UTC"
  );
  const [announcementCountdownDurationHours, setAnnouncementCountdownDurationHours] = useState(
    banner.announcementCountdownDurationHours || "1"
  );
  const [announcementCountdownShowLabels, setAnnouncementCountdownShowLabels] = useState(
    Boolean(banner.announcementCountdownShowLabels)
  );
  const [statusValue, setStatusValue] = useState(
    banner.status === "scheduled" ? "draft" : banner.status
  );
  const [bannerScheduledEnabled, setBannerScheduledEnabled] = useState(
    Boolean(banner.scheduledStartAt || banner.scheduledEndAt)
  );
  const [bannerScheduledStartAt, setBannerScheduledStartAt] = useState(
    banner.scheduledStartAt || ""
  );
  const [bannerScheduledEndAt, setBannerScheduledEndAt] = useState(
    banner.scheduledEndAt || ""
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
  const [videoUrl, setVideoUrl] = useState("");
  const [videoAutoplay, setVideoAutoplay] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoLoop, setVideoLoop] = useState(false);
  const [videoHideControls, setVideoHideControls] = useState(false);
  const [previewItem, setPreviewItem] = useState<{
    url: string;
    title: string;
    sizeInMB: number;
    sourceType: string;
  } | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [itemEditor, setItemEditor] = useState<any | null>(null);
  const [itemEditorTab, setItemEditorTab] = useState(0);
  const [itemScheduledEnabled, setItemScheduledEnabled] = useState(false);
  const [itemScheduledStartAt, setItemScheduledStartAt] = useState("");
  const [itemScheduledEndAt, setItemScheduledEndAt] = useState("");
  const nowTimestamp = Date.now();
  const isWithinSchedule = (start?: string, end?: string) => {
    const startTime = start ? new Date(start).getTime() : null;
    const endTime = end ? new Date(end).getTime() : null;
    if (startTime && nowTimestamp < startTime) return false;
    if (endTime && nowTimestamp > endTime) return false;
    return true;
  };
  const [itemTagsDraft, setItemTagsDraft] = useState<Record<string, any>>({});
  const [contentDragIndex, setContentDragIndex] = useState<number | null>(null);
  const [copiedEmbedHtml, setCopiedEmbedHtml] = useState(false);
  const [bannerAnalyticsOpen, setBannerAnalyticsOpen] = useState(false);
  const [itemAnalyticsOpen, setItemAnalyticsOpen] = useState(false);
  const maxAnalyticsRange = plan === "ultra" ? 90 : plan === "pro" ? 30 : 7;
  const analyticsOptions =
    plan === "ultra"
      ? [
          { label: "Last 7 days", value: "7" },
          { label: "Last 30 days", value: "30" },
          { label: "Last 90 days", value: "90" },
        ]
      : plan === "pro"
      ? [
          { label: "Last 7 days", value: "7" },
          { label: "Last 30 days", value: "30" },
        ]
      : [{ label: "Last 7 days", value: "7" }];
  const [analyticsRange, setAnalyticsRange] = useState(String(maxAnalyticsRange));
  const [bannerAnalytics, setBannerAnalytics] = useState<any | null>(null);
  const [itemAnalytics, setItemAnalytics] = useState<any | null>(null);
  const [selectedAnalyticsItemId, setSelectedAnalyticsItemId] = useState<string | null>(null);
  const [bannerSaveError, setBannerSaveError] = useState<string | null>(null);
  const isVideoSubmitting = videoFetcher.state !== "idle";
  const [shopifyProductsState, setShopifyProductsState] = useState(shopifyProducts);
  const [shopifyFilesState, setShopifyFilesState] = useState(shopifyFiles);
  const [productLoadErrorState, setProductLoadErrorState] = useState(productLoadError);
  const canSchedule = planHasFeature(plan, PlanFeature.SCHEDULING);

  const attachedImageIds = useMemo(() => {
    return new Set(orderedItems.map((item) => item.imageId).filter(Boolean) as string[]);
  }, [orderedItems]);
  const attachedExternalUrls = useMemo(() => {
    return new Set(
      orderedItems.map((item) => item.externalImageUrl).filter(Boolean) as string[]
    );
  }, [orderedItems]);
  const sliderLimitReached =
    plan === "free" && layoutValue === "slider" && orderedItems.length >= 5;

  useEffect(() => {
    const data = updateFetcher.data as { success?: boolean; error?: string } | undefined;
    if (!data) return;
    if (data.error) {
      setBannerSaveError(data.error);
      if (data.error.includes("active banners")) {
        setStatusValue("draft");
      }
    } else if (data.success) {
      setBannerSaveError(null);
    }
  }, [updateFetcher.data, setStatusValue]);

  const titleError =
    titleValue.trim().length === 0 ? "Title is required" : undefined;

  const saveBanner = useCallback(
    (next?: {
      title?: string;
      descriptionInternal?: string;
      layout?: string;
      sliderType?: string;
      sliderShowArrows?: boolean;
      sliderShowBullets?: boolean;
      sliderAutoplay?: boolean;
      sliderLoop?: boolean;
      sliderPerView?: string;
      sliderSpeed?: string;
      sliderAutoplayDelay?: string;
      sliderCentered?: boolean;
      sliderSpaceBetween?: string;
      sliderPauseOnHover?: boolean;
      sliderArrowStyle?: string;
      sliderArrowColor?: string;
      sliderBulletColor?: string;
      status?: string;
      announcementText?: string;
      announcementCtaText?: string;
      announcementCtaUrl?: string;
      announcementCtaTarget?: string;
      announcementClosable?: boolean;
      announcementShowText?: boolean;
      announcementShowCta?: boolean;
      announcementShowCoupon?: boolean;
      announcementCouponCode?: string;
      announcementContentOrder?: string[];
      announcementLayout?: string;
      announcementContentSpacing?: string;
      announcementCloseColor?: string;
      announcementMarquee?: boolean;
      announcementAnimation?: string;
      announcementSeparatorEnabled?: boolean;
      announcementSeparatorText?: string;
      announcementCouponTextColor?: string;
      announcementCouponBorderColor?: string;
      announcementCouponBackgroundColor?: string;
      announcementShowCountdown?: boolean;
      announcementCountdownMode?: string;
      announcementCountdownEndAt?: string;
      announcementCountdownTimezone?: string;
      announcementCountdownDurationHours?: string;
      announcementCountdownShowLabels?: boolean;
      bannerBackgroundColor?: string;
      titleFontSize?: string;
      descriptionFontSize?: string;
      titleColor?: string;
      descriptionColor?: string;
      ctaTextColor?: string;
      ctaBackgroundColor?: string;
      ctaBorderColor?: string;
      ctaBordered?: boolean;
      ctaRounded?: boolean;
      ctaShadow?: boolean;
      ctaStyle?: string;
      ctaUnderline?: boolean;
      countdownTextColor?: string;
      countdownBackgroundColor?: string;
      countdownStyle?: string;
      countdownFontSize?: string;
      customCss?: string;
      scheduledStartAt?: string;
      scheduledEndAt?: string;
    }) => {
      const formData = new FormData();
      formData.set("action", "update-banner");
      formData.set("title", next?.title ?? titleValue);
      formData.set("descriptionInternal", next?.descriptionInternal ?? descriptionValue);
      formData.set("layout", next?.layout ?? layoutValue);
      formData.set("sliderType", next?.sliderType ?? sliderTypeValue);
      formData.set(
        "sliderShowArrows",
        String(next?.sliderShowArrows ?? sliderShowArrows)
      );
      formData.set(
        "sliderShowBullets",
        String(next?.sliderShowBullets ?? sliderShowBullets)
      );
      formData.set("sliderAutoplay", String(next?.sliderAutoplay ?? sliderAutoplay));
      formData.set("sliderLoop", String(next?.sliderLoop ?? sliderLoop));
      formData.set("sliderPerView", next?.sliderPerView ?? sliderPerView);
      formData.set("sliderSpeed", next?.sliderSpeed ?? sliderSpeed);
      formData.set("sliderAutoplayDelay", next?.sliderAutoplayDelay ?? sliderAutoplayDelay);
      formData.set("sliderCentered", String(next?.sliderCentered ?? sliderCentered));
      formData.set("sliderSpaceBetween", next?.sliderSpaceBetween ?? sliderSpaceBetween);
      formData.set("sliderPauseOnHover", String(next?.sliderPauseOnHover ?? sliderPauseOnHover));
      formData.set(
        "sliderArrowStyle",
        next?.sliderArrowStyle ?? advancedValues.sliderArrowStyle
      );
      formData.set(
        "sliderArrowColor",
        next?.sliderArrowColor ?? advancedValues.sliderArrowColor
      );
      formData.set(
        "sliderBulletColor",
        next?.sliderBulletColor ?? advancedValues.sliderBulletColor
      );
      formData.set("status", next?.status ?? statusValue);
      formData.set("announcementText", next?.announcementText ?? announcementText);
      formData.set("announcementCtaText", next?.announcementCtaText ?? announcementCtaText);
      formData.set("announcementCtaUrl", next?.announcementCtaUrl ?? announcementCtaUrl);
      formData.set(
        "announcementCtaTarget",
        next?.announcementCtaTarget ?? announcementCtaTarget
      );
      formData.set(
        "announcementClosable",
        String(next?.announcementClosable ?? announcementClosableValue)
      );
      formData.set(
        "announcementShowText",
        String(next?.announcementShowText ?? announcementShowText)
      );
      formData.set(
        "announcementShowCta",
        String(next?.announcementShowCta ?? announcementShowCta)
      );
      formData.set(
        "announcementShowCoupon",
        String(next?.announcementShowCoupon ?? announcementShowCoupon)
      );
      formData.set(
        "announcementCouponCode",
        next?.announcementCouponCode ?? announcementCouponCode
      );
      formData.set(
        "announcementContentOrder",
        JSON.stringify(next?.announcementContentOrder ?? announcementContentOrder)
      );
      formData.set(
        "announcementLayout",
        next?.announcementLayout ?? announcementLayoutMode
      );
      formData.set(
        "announcementContentSpacing",
        next?.announcementContentSpacing ?? announcementContentSpacing
      );
      formData.set(
        "announcementCloseColor",
        next?.announcementCloseColor ?? advancedValues.announcementCloseColor
      );
      formData.set(
        "announcementMarquee",
        String(next?.announcementMarquee ?? advancedValues.announcementMarquee)
      );
      formData.set(
        "announcementAnimation",
        next?.announcementAnimation ?? advancedValues.announcementAnimation
      );
      formData.set(
        "announcementSeparatorEnabled",
        String(next?.announcementSeparatorEnabled ?? advancedValues.announcementSeparatorEnabled)
      );
      formData.set(
        "announcementSeparatorText",
        next?.announcementSeparatorText ?? advancedValues.announcementSeparatorText
      );
      formData.set(
        "announcementCouponTextColor",
        next?.announcementCouponTextColor ?? advancedValues.announcementCouponTextColor
      );
      formData.set(
        "announcementCouponBorderColor",
        next?.announcementCouponBorderColor ?? advancedValues.announcementCouponBorderColor
      );
      formData.set(
        "announcementCouponBackgroundColor",
        next?.announcementCouponBackgroundColor ?? advancedValues.announcementCouponBackgroundColor
      );
      formData.set(
        "announcementShowCountdown",
        String(next?.announcementShowCountdown ?? announcementShowCountdown)
      );
      formData.set(
        "announcementCountdownMode",
        next?.announcementCountdownMode ?? announcementCountdownMode
      );
      formData.set(
        "announcementCountdownEndAt",
        next?.announcementCountdownEndAt ?? announcementCountdownEndAt
      );
      formData.set(
        "announcementCountdownTimezone",
        next?.announcementCountdownTimezone ?? announcementCountdownTimezone
      );
      formData.set(
        "announcementCountdownDurationHours",
        next?.announcementCountdownDurationHours ?? announcementCountdownDurationHours
      );
      formData.set(
        "announcementCountdownShowLabels",
        String(next?.announcementCountdownShowLabels ?? announcementCountdownShowLabels)
      );
      formData.set(
        "bannerBackgroundColor",
        next?.bannerBackgroundColor ?? advancedValues.bannerBackgroundColor
      );
      formData.set("titleFontSize", next?.titleFontSize ?? advancedValues.titleFontSize);
      formData.set(
        "descriptionFontSize",
        next?.descriptionFontSize ?? advancedValues.descriptionFontSize
      );
      formData.set("titleColor", next?.titleColor ?? advancedValues.titleColor);
      formData.set(
        "descriptionColor",
        next?.descriptionColor ?? advancedValues.descriptionColor
      );
      formData.set("ctaTextColor", next?.ctaTextColor ?? advancedValues.ctaTextColor);
      formData.set(
        "ctaBackgroundColor",
        next?.ctaBackgroundColor ?? advancedValues.ctaBackgroundColor
      );
      formData.set("ctaBorderColor", next?.ctaBorderColor ?? advancedValues.ctaBorderColor);
      formData.set("ctaBordered", String(next?.ctaBordered ?? advancedValues.ctaBordered));
      formData.set("ctaRounded", String(next?.ctaRounded ?? advancedValues.ctaRounded));
      formData.set("ctaShadow", String(next?.ctaShadow ?? advancedValues.ctaShadow));
      formData.set("ctaStyle", next?.ctaStyle ?? advancedValues.ctaStyle);
      formData.set(
        "ctaUnderline",
        String(next?.ctaUnderline ?? advancedValues.ctaUnderline)
      );
      formData.set(
        "countdownTextColor",
        next?.countdownTextColor ?? advancedValues.countdownTextColor
      );
      formData.set(
        "countdownBackgroundColor",
        next?.countdownBackgroundColor ?? advancedValues.countdownBackgroundColor
      );
      formData.set(
        "countdownStyle",
        next?.countdownStyle ?? advancedValues.countdownStyle
      );
      formData.set(
        "countdownFontSize",
        next?.countdownFontSize ?? advancedValues.countdownFontSize
      );
      formData.set("customCss", next?.customCss ?? customCssValue);
      formData.set("scheduledStartAt", next?.scheduledStartAt ?? bannerScheduledStartAt);
      formData.set("scheduledEndAt", next?.scheduledEndAt ?? bannerScheduledEndAt);
      updateFetcher.submit(formData, { method: "post" });
    },
    [
      announcementCtaText,
      announcementCtaUrl,
      announcementCtaTarget,
      announcementCountdownDurationHours,
      announcementCountdownEndAt,
      announcementCountdownMode,
      announcementCountdownTimezone,
      announcementCountdownShowLabels,
      announcementShowCountdown,
      announcementText,
      announcementShowText,
      announcementShowCta,
      announcementShowCoupon,
      announcementCouponCode,
      announcementContentOrder,
      announcementLayoutMode,
      announcementContentSpacing,
      customCssValue,
      bannerScheduledStartAt,
      bannerScheduledEndAt,
      descriptionValue,
      layoutValue,
      sliderTypeValue,
      sliderShowArrows,
      sliderShowBullets,
      sliderAutoplay,
      sliderLoop,
      sliderPerView,
      sliderSpeed,
      sliderAutoplayDelay,
      sliderCentered,
      sliderSpaceBetween,
      sliderPauseOnHover,
      advancedValues,
      statusValue,
      titleValue,
      announcementClosableValue,
      updateFetcher,
    ]
  );

  const selectedProduct = useMemo(() => {
    if (!selectedShopifyProductId) return null;
    return (
      shopifyProductsState.find((product) => product.id === selectedShopifyProductId) || null
    );
  }, [selectedShopifyProductId, shopifyProductsState]);

  const pendingProduct = useMemo(() => {
    if (!pendingProductId) return null;
    return shopifyProductsState.find((product) => product.id === pendingProductId) || null;
  }, [pendingProductId, shopifyProductsState]);

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

  const aspectRatioOptions = getAllowedAspectRatios(plan);

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
    setVideoUrl("");
    setVideoAutoplay(false);
    setVideoMuted(false);
    setVideoLoop(false);
    setVideoHideControls(false);
  }, []);

  useEffect(() => {
    if (!itemEditorOpen || !itemEditor) return;
    const defaultTags = {
      showOverlay: false,
      showTextOverlay: false,
      textTitle: "",
      textDescription: "",
      textPosition: "bottom_left",
      showCta: false,
      ctaText: "",
      ctaUrl: "",
      ctaTarget: "_self",
      ctaMode: "button",
      showCountdown: false,
      countdownMode: "fixed",
      countdownEndAt: "",
      countdownTimezone: defaultCountdownTimezone || "UTC",
      countdownDurationHours: "1",
      contentOrder: ["title", "description", "cta", "countdown"],
      showControls: true,
    };
    setItemTagsDraft({
      ...defaultTags,
      ...(itemEditor.tags || {}),
    });
  }, [itemEditorOpen, itemEditor, defaultCountdownTimezone]);

  useEffect(() => {
    setShopifyProductsState(shopifyProducts);
    setProductLoadErrorState(productLoadError);
  }, [shopifyProducts, productLoadError]);

  useEffect(() => {
    setShopifyFilesState(shopifyFiles);
  }, [shopifyFiles]);

  useEffect(() => {
    if (!modalOpen || modalOption !== "gallery") return;
    if (galleryTab !== "shopify") return;
    if (shopifyFilesState.length > 0) return;
    if (filesFetcher.state !== "idle") return;
    const formData = new FormData();
    formData.set("action", "load-shopify-files");
    filesFetcher.submit(formData, { method: "post" });
  }, [modalOpen, modalOption, galleryTab, shopifyFilesState.length, filesFetcher]);

  useEffect(() => {
    if (!productModalOpen) return;
    if (shopifyProductsState.length > 0) return;
    if (productFetcher.state !== "idle") return;
    const formData = new FormData();
    formData.set("action", "load-shopify-products");
    productFetcher.submit(formData, { method: "post" });
  }, [productModalOpen, shopifyProductsState.length, productFetcher]);

  useEffect(() => {
    const data = productFetcher.data as any;
    if (!data) return;
    if (Array.isArray(data.shopifyProducts)) {
      setShopifyProductsState(data.shopifyProducts);
    }
    if (data.productLoadError !== undefined) {
      setProductLoadErrorState(data.productLoadError);
    }
  }, [productFetcher.data]);

  useEffect(() => {
    const data = filesFetcher.data as any;
    if (!data) return;
    if (Array.isArray(data.shopifyFiles)) {
      setShopifyFilesState(data.shopifyFiles);
    }
  }, [filesFetcher.data]);

  useEffect(() => {
    if (attachFetcher.data && "success" in attachFetcher.data && attachFetcher.data.success) {
      handleModalClose();
    }
  }, [attachFetcher.data, handleModalClose]);

  useEffect(() => {
    if (videoFetcher.data && "success" in videoFetcher.data && videoFetcher.data.success) {
      handleModalClose();
      setVideoUrl("");
      setVideoAutoplay(false);
      setVideoMuted(false);
      setVideoLoop(false);
      setVideoHideControls(false);
    }
  }, [videoFetcher.data, handleModalClose]);

  useEffect(() => {
    const data = attachFetcher.data as any;
    if (!data?.item) return;
    setOrderedItems((prev) =>
      layoutValue === "hero" ? [data.item] : [...prev, data.item]
    );
  }, [attachFetcher.data, layoutValue]);

  useEffect(() => {
    const data = videoFetcher.data as any;
    if (!data?.item) return;
    setOrderedItems((prev) =>
      layoutValue === "hero" ? [data.item] : [...prev, data.item]
    );
  }, [videoFetcher.data, layoutValue]);

  useEffect(() => {
    const data = removeItemFetcher.data as any;
    if (!data?.removedItemId) return;
    setOrderedItems((prev) => prev.filter((item) => item.id !== data.removedItemId));
  }, [removeItemFetcher.data]);

  useEffect(() => {
    if (!previewOpen) return;
    fetch(`/app/banners/${banner.id}/preview${editSearch}`)
      .then((res) => res.text())
      .then((html) => setPreviewHtml(html))
      .catch(() => setPreviewHtml("<p>Unable to load preview.</p>"));
  }, [previewOpen, banner.id, editSearch]);

  useEffect(() => {
    if (previewOpen) return;
    setPreviewHtml("");
  }, [previewOpen]);

  useEffect(() => {
    if (!bannerAnalyticsOpen) return;
    if (analyticsFetcher.state !== "idle") return;
    if (
      bannerAnalytics &&
      String(bannerAnalytics.rangeDays) === String(analyticsRange)
    ) {
      return;
    }
    const formData = new FormData();
    formData.set("action", "get-analytics");
    formData.set("scope", "banner");
    formData.set("range", analyticsRange);
    analyticsFetcher.submit(formData, { method: "post" });
  }, [bannerAnalyticsOpen, analyticsRange, analyticsFetcher, bannerAnalytics]);

  useEffect(() => {
    if (!itemAnalyticsOpen || !selectedAnalyticsItemId) return;
    if (analyticsFetcher.state !== "idle") return;
    if (
      itemAnalytics &&
      itemAnalytics.itemId === selectedAnalyticsItemId &&
      String(itemAnalytics.rangeDays) === String(analyticsRange)
    ) {
      return;
    }
    const formData = new FormData();
    formData.set("action", "get-analytics");
    formData.set("scope", "item");
    formData.set("itemId", selectedAnalyticsItemId);
    formData.set("range", analyticsRange);
    analyticsFetcher.submit(formData, { method: "post" });
  }, [
    itemAnalyticsOpen,
    analyticsRange,
    analyticsFetcher,
    selectedAnalyticsItemId,
    itemAnalytics,
  ]);

  useEffect(() => {
    if (!analyticsFetcher.data || typeof analyticsFetcher.data !== "object") return;
    const data = analyticsFetcher.data as any;
    if (data.scope === "banner") {
      setBannerAnalytics(data);
    }
    if (data.scope === "item") {
      setItemAnalytics(data);
    }
  }, [analyticsFetcher.data]);

  useEffect(() => {
    if (!advancedOpen) return;
    setAdvancedDraft(advancedValues);
  }, [advancedOpen, advancedValues]);

  const updateItemTagsDraft = useCallback(
    (updates: Record<string, any>) => {
      setItemTagsDraft((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const updateAdvancedDraft = useCallback(
    (updates: Record<string, any>) => {
      setAdvancedDraft((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const renderColorField = useCallback(
    (label: string, value: string, onChange: (next: string) => void) => (
      <div className="bainners-color-field">
        <Text as="p" variant="bodySm">
          {label}
        </Text>
        <input
          type="color"
          value={value || "#000000"}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    ),
    []
  );
  const handleContentDragOver = useCallback((targetIndex: number) => {
    setItemTagsDraft((prev) => {
      const order = Array.isArray(prev.contentOrder)
        ? [...prev.contentOrder]
        : ["title", "description", "cta", "countdown"];
      if (contentDragIndex === null || contentDragIndex === targetIndex) {
        return prev;
      }
      const next = [...order];
      const [moved] = next.splice(contentDragIndex, 1);
      next.splice(targetIndex, 0, moved);
      setContentDragIndex(targetIndex);
      return { ...prev, contentOrder: next };
    });
  }, [contentDragIndex]);

  const handleAnnouncementDragOver = useCallback(
    (targetIndex: number) => {
      setAnnouncementContentOrder((prev) => {
        const order = Array.isArray(prev) ? [...prev] : ["text", "cta", "countdown"];
        if (announcementDragIndex === null || announcementDragIndex === targetIndex) {
          return prev;
        }
        const next = [...order];
        const [moved] = next.splice(announcementDragIndex, 1);
        next.splice(targetIndex, 0, moved);
        setAnnouncementDragIndex(targetIndex);
        return next;
      });
    },
    [announcementDragIndex]
  );

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
                <Button variant="secondary" onClick={() => setBannerAnalyticsOpen(true)}>
                  Analytics
                </Button>
                <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                  Preview
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setEmbedOpen(true)}
                  disabled={statusValue !== "active"}
                >
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
              {bannerSaveError ? (
                <PolarisBanner tone="warning">
                  <p>{bannerSaveError}</p>
                </PolarisBanner>
              ) : null}
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Configuration
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <label className="bainners-switch">
                      <input
                        type="checkbox"
                        checked={statusValue === "active"}
                        onChange={(event) => {
                          const nextStatus = event.currentTarget.checked ? "active" : "draft";
                          setStatusValue(nextStatus);
                          saveBanner({ status: nextStatus });
                        }}
                      />
                      <span className="bainners-switch-track">
                        <span className="bainners-switch-thumb" />
                      </span>
                    </label>
                    <Text as="span" variant="bodySm">
                      {statusValue === "active" ? "Published" : "Draft"}
                    </Text>
                    {canSchedule &&
                    statusValue === "active" &&
                    bannerScheduledEnabled &&
                    !isWithinSchedule(bannerScheduledStartAt, bannerScheduledEndAt) ? (
                      <Badge tone="critical">Scheduled (hidden)</Badge>
                    ) : null}
                  </InlineStack>
                </InlineStack>
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
                <BlockStack gap="200">
                  {canSchedule ? (
                    <>
                      <Checkbox
                        label="Scheduled"
                        checked={bannerScheduledEnabled}
                        onChange={(value) => {
                          setBannerScheduledEnabled(value);
                          if (!value) {
                            setBannerScheduledStartAt("");
                            setBannerScheduledEndAt("");
                            saveBanner({ scheduledStartAt: "", scheduledEndAt: "" });
                          }
                        }}
                      />
                      {bannerScheduledEnabled ? (
                        <InlineStack gap="300" align="start">
                          <TextField
                            label="Start date"
                            type="datetime-local"
                            value={bannerScheduledStartAt}
                            onChange={(value) => {
                              setBannerScheduledStartAt(value);
                              saveBanner({ scheduledStartAt: value });
                            }}
                          />
                          <TextField
                            label="End date"
                            type="datetime-local"
                            value={bannerScheduledEndAt}
                            onChange={(value) => {
                              setBannerScheduledEndAt(value);
                              saveBanner({ scheduledEndAt: value });
                            }}
                          />
                        </InlineStack>
                      ) : null}
                    </>
                  ) : (
                    <PolarisBanner tone="warning">
                      <p>Scheduling is available on the Pro and Ultra plans.</p>
                    </PolarisBanner>
                  )}
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    Layout
                  </Text>
                  <div className="bainners-layout-grid">
                    <button
                      type="button"
                      className={`bainners-option-card${
                        layoutValue === "announcement" ? " bainners-option-card--selected" : ""
                      }`}
                      onClick={() => {
                        setLayoutValue("announcement");
                        saveBanner({ layout: "announcement" });
                      }}
                    >
                      <div className="bainners-option-card__icon">
                        <Icon source={MegaphoneIcon} />
                      </div>
                      <Text as="p" variant="headingMd">
                        Announcement
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Single line + CTA + countdown
                      </Text>
                    </button>
                    <button
                      type="button"
                      className={`bainners-option-card${
                        layoutValue === "hero" ? " bainners-option-card--selected" : ""
                      }`}
                      onClick={() => {
                        setLayoutValue("hero");
                        saveBanner({ layout: "hero" });
                      }}
                    >
                      <div className="bainners-option-card__icon">
                        <Icon source={ImageIcon} />
                      </div>
                      <Text as="p" variant="headingMd">
                        Hero
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Single image or video
                      </Text>
                    </button>
                    <button
                      type="button"
                      className={`bainners-option-card${
                        layoutValue === "slider" ? " bainners-option-card--selected" : ""
                      }`}
                      onClick={() => {
                        setLayoutValue("slider");
                        saveBanner({ layout: "slider" });
                      }}
                    >
                      <div className="bainners-option-card__icon">
                        <Icon source={SlideshowIcon} />
                      </div>
                      <Text as="p" variant="headingMd">
                        Slider
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Multiple items with transitions
                      </Text>
                    </button>
                  </div>
                </BlockStack>
                {layoutValue === "slider" ? (
                  <BlockStack gap="200">
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
                    <InlineStack gap="300" align="start">
                      <Checkbox
                        label="Show arrows"
                        checked={sliderShowArrows}
                        onChange={(value) => {
                          setSliderShowArrows(value);
                          saveBanner({ sliderShowArrows: value });
                        }}
                      />
                      <Checkbox
                        label="Show bullets"
                        checked={sliderShowBullets}
                        onChange={(value) => {
                          setSliderShowBullets(value);
                          saveBanner({ sliderShowBullets: value });
                        }}
                      />
                      <Checkbox
                        label="Centered slides"
                        checked={sliderCentered}
                        onChange={(value) => {
                          setSliderCentered(value);
                          saveBanner({ sliderCentered: value });
                        }}
                      />
                    </InlineStack>
                    <InlineStack gap="300" align="start">
                      <Checkbox
                        label="Autoplay"
                        checked={sliderAutoplay}
                        onChange={(value) => {
                          setSliderAutoplay(value);
                          saveBanner({ sliderAutoplay: value });
                        }}
                      />
                      <Checkbox
                        label="Loop"
                        checked={sliderLoop}
                        onChange={(value) => {
                          setSliderLoop(value);
                          saveBanner({ sliderLoop: value });
                        }}
                      />
                      <Checkbox
                        label="Pause on hover"
                        checked={sliderPauseOnHover}
                        onChange={(value) => {
                          setSliderPauseOnHover(value);
                          saveBanner({ sliderPauseOnHover: value });
                        }}
                      />
                    </InlineStack>
                    <InlineStack gap="300" align="start" className="bainners-slider-row">
                      <div className="bainners-slider-field">
                        <Select
                          label="Transition speed"
                          options={[
                            { label: "Regular", value: "regular" },
                            { label: "Slow", value: "slow" },
                            { label: "Fast", value: "fast" },
                          ]}
                          value={sliderSpeed}
                          onChange={(value) => {
                            setSliderSpeed(value);
                            saveBanner({ sliderSpeed: value });
                          }}
                        />
                      </div>
                      <div className="bainners-slider-field">
                        <TextField
                          label="Items per view"
                          type="number"
                          value={sliderPerView}
                          onChange={(value) => {
                            const sanitized = value === "" ? "1" : value;
                            setSliderPerView(sanitized);
                            saveBanner({ sliderPerView: sanitized });
                          }}
                          min={1}
                          step={0.1}
                        />
                      </div>
                      {sliderAutoplay ? (
                        <div className="bainners-slider-field">
                          <TextField
                            label="Autoplay delay (ms)"
                            type="number"
                            value={sliderAutoplayDelay}
                            onChange={(value) => {
                              const sanitized = value === "" ? "3500" : value;
                              setSliderAutoplayDelay(sanitized);
                              saveBanner({ sliderAutoplayDelay: sanitized });
                            }}
                            min={500}
                            step={500}
                          />
                        </div>
                      ) : null}
                    </InlineStack>
                    {Number(sliderPerView) > 1 ? (
                      <TextField
                        label="Space between (px)"
                        type="number"
                        value={sliderSpaceBetween}
                        onChange={(value) => {
                          const sanitized = value === "" ? "16" : value;
                          setSliderSpaceBetween(sanitized);
                          saveBanner({ sliderSpaceBetween: sanitized });
                        }}
                        min={0}
                        step={1}
                      />
                    ) : null}
                  </BlockStack>
                ) : null}
                {layoutValue === "announcement" ? (
                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm">
                      Reorder and toggle what appears on this banner.
                    </Text>
                    {announcementContentOrder.map((key, index) => (
                      <div
                        key={key}
                        draggable
                        onDragStart={() => setAnnouncementDragIndex(index)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          handleAnnouncementDragOver(index);
                        }}
                        onDragEnd={() => {
                          setAnnouncementDragIndex(null);
                          saveBanner({ announcementContentOrder });
                        }}
                        className="bainners-content-card"
                      >
                        <Card padding="300">
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="p" variant="headingSm">
                                {key === "text"
                                  ? "Announcement text"
                                  : key === "cta"
                                  ? "CTA"
                                  : key === "coupon"
                                  ? "Coupon"
                                  : "Countdown"}
                              </Text>
                            </InlineStack>

                            {key === "text" ? (
                              <BlockStack gap="200">
                                <Checkbox
                                  label="Show text"
                                  checked={announcementShowText}
                                  onChange={(value) => {
                                    setAnnouncementShowText(value);
                                    saveBanner({ announcementShowText: value });
                                  }}
                                />
                                {announcementShowText ? (
                                  <TextField
                                    label="Announcement text"
                                    value={announcementText}
                                    onChange={(value) => {
                                      setAnnouncementText(value);
                                      saveBanner({ announcementText: value });
                                    }}
                                    placeholder="Your announcement text"
                                    helpText="Emojis supported."
                                    multiline={2}
                                  />
                                ) : null}
                              </BlockStack>
                            ) : null}

                            {key === "cta" ? (
                              <BlockStack gap="200">
                                <Checkbox
                                  label="Show CTA"
                                  checked={announcementShowCta}
                                  onChange={(value) => {
                                    setAnnouncementShowCta(value);
                                    saveBanner({ announcementShowCta: value });
                                  }}
                                />
                                {announcementShowCta ? (
                                  <BlockStack gap="200">
                                    <TextField
                                      label="CTA text"
                                      value={announcementCtaText}
                                      onChange={(value) => {
                                        setAnnouncementCtaText(value);
                                        saveBanner({ announcementCtaText: value });
                                      }}
                                      placeholder="Learn more"
                                    />
                                    <TextField
                                      label="CTA URL"
                                      value={announcementCtaUrl}
                                      onChange={(value) => {
                                        setAnnouncementCtaUrl(value);
                                        saveBanner({ announcementCtaUrl: value });
                                      }}
                                      placeholder="https://"
                                    />
                                    <Select
                                      label="CTA target"
                                      options={[
                                        { label: "Same tab", value: "_self" },
                                        { label: "New tab", value: "_blank" },
                                        { label: "Parent frame", value: "_parent" },
                                        { label: "Top frame", value: "_top" },
                                      ]}
                                      value={announcementCtaTarget}
                                      onChange={(value) => {
                                        setAnnouncementCtaTarget(value);
                                        saveBanner({ announcementCtaTarget: value });
                                      }}
                                    />
                                  </BlockStack>
                                ) : null}
                              </BlockStack>
                            ) : null}

                            {key === "coupon" ? (
                              <BlockStack gap="200">
                                <Checkbox
                                  label="Show coupon"
                                  checked={announcementShowCoupon}
                                  onChange={(value) => {
                                    setAnnouncementShowCoupon(value);
                                    saveBanner({ announcementShowCoupon: value });
                                  }}
                                />
                                {announcementShowCoupon ? (
                                  <TextField
                                    label="Coupon code"
                                    value={announcementCouponCode}
                                    onChange={(value) => {
                                      setAnnouncementCouponCode(value);
                                      saveBanner({ announcementCouponCode: value });
                                    }}
                                    placeholder="SAVE10"
                                  />
                                ) : null}
                              </BlockStack>
                            ) : null}

                            {key === "countdown" ? (
                              <BlockStack gap="200">
                                <Checkbox
                                  label="Show countdown"
                                  checked={announcementShowCountdown}
                                  onChange={(value) => {
                                    setAnnouncementShowCountdown(value);
                                    saveBanner({ announcementShowCountdown: value });
                                  }}
                                />
                                {announcementShowCountdown ? (
                                  <BlockStack gap="200">
                                    <Checkbox
                                      label="Show labels"
                                      checked={announcementCountdownShowLabels}
                                      onChange={(value) => {
                                        setAnnouncementCountdownShowLabels(value);
                                        saveBanner({ announcementCountdownShowLabels: value });
                                      }}
                                    />
                                    <Select
                                      label="Mode"
                                      options={[
                                        { label: "Fixed end time", value: "fixed" },
                                        { label: "Evergreen (relative)", value: "evergreen" },
                                      ]}
                                      value={announcementCountdownMode}
                                      onChange={(value) => {
                                        setAnnouncementCountdownMode(value);
                                        saveBanner({ announcementCountdownMode: value });
                                      }}
                                    />
                                    {announcementCountdownMode === "evergreen" ? (
                                      <TextField
                                        label="Duration (hours)"
                                        type="number"
                                        value={announcementCountdownDurationHours}
                                        onChange={(value) => {
                                          setAnnouncementCountdownDurationHours(value);
                                          saveBanner({ announcementCountdownDurationHours: value });
                                        }}
                                      />
                                    ) : (
                                      <TextField
                                        label="End date"
                                        type="datetime-local"
                                        value={announcementCountdownEndAt}
                                        onChange={(value) => {
                                          setAnnouncementCountdownEndAt(value);
                                          saveBanner({ announcementCountdownEndAt: value });
                                        }}
                                      />
                                    )}
                                  </BlockStack>
                                ) : null}
                              </BlockStack>
                            ) : null}
                          </BlockStack>
                        </Card>
                      </div>
                    ))}

                    <InlineStack gap="300" align="start">
                      <Select
                        label="Content layout"
                        options={[
                          { label: "Inline", value: "inline" },
                          { label: "Stacked", value: "stacked" },
                        ]}
                        value={announcementLayoutMode}
                        onChange={(value) => {
                          setAnnouncementLayoutMode(value);
                          if (value === "stacked") {
                            setAdvancedValues((prev) => ({ ...prev, announcementMarquee: false }));
                            setAdvancedDraft((prev) => ({ ...prev, announcementMarquee: false }));
                            saveBanner({ announcementLayout: value, announcementMarquee: false });
                          } else {
                            saveBanner({ announcementLayout: value });
                          }
                        }}
                      />
                    </InlineStack>

                    <Checkbox
                      label="Show close button"
                      checked={announcementClosableValue}
                      onChange={(value) => {
                        setAnnouncementClosableValue(value);
                        saveBanner({ announcementClosable: value });
                      }}
                    />
                  </BlockStack>
                ) : null}
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        {layoutValue !== "announcement" ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Banner Items
                  </Text>
                  {orderedItems.length > 0 && layoutValue !== "hero" ? (
                    <Button
                      onClick={() => setModalOpen(true)}
                      variant="primary"
                      disabled={
                        (layoutValue === "hero" && orderedItems.length >= 1) || sliderLimitReached
                      }
                    >
                      Add item
                    </Button>
                  ) : null}
                </InlineStack>
                {sliderLimitReached ? (
                  <PolarisBanner tone="warning">
                    <p>Free plan allows up to 5 slider items. Upgrade to add more.</p>
                  </PolarisBanner>
                ) : null}
                {orderedItems.length === 0 ? (
                  <EmptyState
                    heading="No items yet"
                    action={{
                      content: "Add item",
                      onAction: () => setModalOpen(true),
                      primary: true,
                      disabled: sliderLimitReached,
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Add an item to start building this banner.</p>
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
                              {item.tags?.mediaType === "video" ? (
                                <button
                                  type="button"
                                  className="bainners-video-thumb bainners-image-thumb--large"
                                  onClick={() => {
                                    if (item.tags?.videoUrl) {
                                      window.open(item.tags.videoUrl, "_blank", "noopener");
                                    }
                                  }}
                                >
                                  {item.tags?.videoThumbnailUrl ? (
                                    <img src={item.tags.videoThumbnailUrl} alt="Video thumbnail" />
                                  ) : (
                                    <Icon source={ImageIcon} />
                                  )}
                                  <span className="bainners-image-overlay">
                                    <Icon source={ViewIcon} tone="base" />
                                  </span>
                                  <div className="bainners-banner-tags">
                                    <Badge tone="info">Video</Badge>
                                  </div>
                                </button>
                              ) : (
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
                                    <Badge tone="info">{item.sourceType}</Badge>
                                  </div>
                                </button>
                              )}
                              <BlockStack gap="200">
                                <div className="bainners-item-edit">
                                  <Button
                                    size="slim"
                                    onClick={() => {
                                      setItemEditor({ ...item });
                                      const hasSchedule =
                                        Boolean(item.scheduledStartAt) || Boolean(item.scheduledEndAt);
                                      setItemScheduledEnabled(hasSchedule);
                                      setItemScheduledStartAt(item.scheduledStartAt || "");
                                      setItemScheduledEndAt(item.scheduledEndAt || "");
                                      setItemEditorOpen(true);
                                    }}
                                  >
                                    Edit info
                                  </Button>
                                  <Button
                                    size="slim"
                                    variant="secondary"
                                    onClick={() => {
                                      setSelectedAnalyticsItemId(item.id);
                                      setItemAnalyticsOpen(true);
                                    }}
                                  >
                                    Analytics
                                  </Button>
                                </div>
                                {canSchedule && (item.scheduledStartAt || item.scheduledEndAt) && (
                                  <InlineStack gap="200" blockAlign="center">
                                    <Text as="p" variant="bodySm">
                                      Scheduled:{" "}
                                      {item.scheduledStartAt || "—"} - {item.scheduledEndAt || "—"}
                                    </Text>
                                    {!isWithinSchedule(
                                      item.scheduledStartAt,
                                      item.scheduledEndAt
                                    ) ? (
                                      <Badge tone="critical">Scheduled (hidden)</Badge>
                                    ) : null}
                                  </InlineStack>
                                )}
                                {(Array.isArray(item.tags?.contentOrder)
                                  ? item.tags.contentOrder
                                  : ["title", "description", "cta", "countdown"]
                                ).map((key: string) => {
                                  if (key === "title" && item.tags?.textTitle) {
                                    return (
                                      <Text key={key} as="p" variant="bodySm">
                                        Title: {item.tags.textTitle}
                                      </Text>
                                    );
                                  }
                                  if (key === "description" && item.tags?.textDescription) {
                                    return (
                                      <Text key={key} as="p" variant="bodySm">
                                        Description: {item.tags.textDescription}
                                      </Text>
                                    );
                                  }
                                  if (key === "cta" && item.tags?.showCta) {
                                    const ctaMode = item.tags?.ctaMode || "button";
                                    const ctaLabel =
                                      ctaMode === "item"
                                        ? "Entire item"
                                        : item.tags?.ctaText || "Button";
                                    return (
                                      <Text key={key} as="p" variant="bodySm">
                                        CTA: {ctaLabel}
                                      </Text>
                                    );
                                  }
                                  if (key === "countdown" && item.tags?.showCountdown) {
                                    return (
                                      <Text key={key} as="p" variant="bodySm">
                                        Countdown:{" "}
                                        {item.tags?.countdownMode === "evergreen"
                                          ? `Evergreen (${item.tags?.countdownDurationHours || "1"}h)`
                                          : item.tags?.countdownEndAt
                                          ? `Fixed (${item.tags.countdownEndAt})`
                                          : "Fixed"}
                                      </Text>
                                    );
                                  }
                                  return null;
                                })}
                                <div className="bainners-banner-item-actions">
                                  <Button
                                    size="slim"
                                    tone="critical"
                                    onClick={() => {
                                      if (!confirm("Remove this item from the banner?")) return;
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
        ) : null}

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
                  : modalOption === "video"
                  ? "Add video"
                  : "Generate with AI"}
              </Text>
            </InlineStack>
          ) : (
            "Add item"
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
                  Choose how you want to add an item.
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
                    onClick={() => setModalOption("video")}
                  >
                    <div className="bainners-option-card__icon">
                      <Icon source={PlayCircleIcon} />
                    </div>
                    <Text as="p" variant="headingMd">
                      Video
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Add a YouTube or Vimeo URL
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

                {galleryTab === "shopify" && shopifyFilesState.length === 0 && (
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

                {((galleryTab === "shopify" && shopifyFilesState.length > 0) ||
                  (galleryTab === "app" && appImageOptions.length > 0)) && (
                  <div className="bainners-image-grid">
                    {(galleryTab === "shopify" ? shopifyFilesState : appImageOptions).map((image) => {
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
                    <img src={uploadedImage.url} alt="Uploaded preview" />
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

            {modalOption === "video" && (
              <BlockStack gap="300">
                <BlockStack gap="200">
                  <TextField
                    label="Video URL"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={setVideoUrl}
                  />
                  <InlineStack gap="300">
                    <Checkbox
                      label="Autoplay"
                      checked={videoAutoplay}
                      onChange={setVideoAutoplay}
                    />
                    <Checkbox
                      label="Muted"
                      checked={videoMuted}
                      onChange={setVideoMuted}
                    />
                    <Checkbox
                      label="Loop"
                      checked={videoLoop}
                      onChange={setVideoLoop}
                    />
                    <Checkbox
                      label="Hide controls"
                      checked={videoHideControls}
                      onChange={setVideoHideControls}
                    />
                  </InlineStack>
                  {videoFetcher.data && "error" in videoFetcher.data ? (
                    <PolarisBanner tone="critical" title="Video error">
                      <p>{videoFetcher.data.error as string}</p>
                    </PolarisBanner>
                  ) : null}
                  <InlineStack align="end">
                    <Button
                      primary
                      disabled={!videoUrl || isVideoSubmitting}
                      loading={isVideoSubmitting}
                      onClick={() => {
                        const formData = new FormData();
                        formData.set("action", "add-video");
                        formData.set("videoUrl", videoUrl);
                        formData.set("autoplay", String(videoAutoplay));
                        formData.set("muted", String(videoMuted));
                        formData.set("loop", String(videoLoop));
                        formData.set("showControls", String(!videoHideControls));
                        videoFetcher.submit(formData, { method: "post" });
                      }}
                    >
                      Add video
                    </Button>
                  </InlineStack>
                </BlockStack>
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
                      <img src={generatedImage.url} alt="Generated preview" />
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
                Add the Bainners Banner block in the Theme Editor and select a published banner.
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap={false}>
                <Button
                  variant="primary"
                  disabled={!themeEditorUrl}
                  onClick={() => {
                    if (!themeEditorUrl) return;
                    window.open(themeEditorUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open Theme Editor
                </Button>
                <Button
                  icon={QuestionCircleIcon}
                  variant="tertiary"
                  url={`/app/setup-guide${editSearch}`}
                  accessibilityLabel="Setup guide"
                />
              </InlineStack>
              <div className="bainners-embed-media">
                <Text as="p" variant="bodySm" tone="subdued">
                  Add the block, then pick a published banner from the dropdown.
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
        .then(function (html) {
          var wrapper = document.createElement('div');
          wrapper.innerHTML = html;
          el.innerHTML = '';
          while (wrapper.firstChild) {
            var node = wrapper.firstChild;
            if (node.nodeName === 'SCRIPT') {
              var script = document.createElement('script');
              Array.prototype.slice.call(node.attributes).forEach(function (attr) {
                script.setAttribute(attr.name, attr.value);
              });
              script.text = node.text || node.textContent || '';
              wrapper.removeChild(node);
              el.appendChild(script);
            } else {
              el.appendChild(node);
            }
          }
        })
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
                        `<bainners-banner data-banner-id="${banner.id}"></bainners-banner>\n<script>\n  (function () {\n    var banners = document.querySelectorAll('bainners-banner[data-banner-id]');\n    banners.forEach(function (el) {\n      var id = el.getAttribute('data-banner-id');\n      fetch('/apps/bainners/banner?banner_id=' + encodeURIComponent(id))\n        .then(function (res) { return res.text(); })\n        .then(function (html) {\n          var wrapper = document.createElement('div');\n          wrapper.innerHTML = html;\n          el.innerHTML = '';\n          while (wrapper.firstChild) {\n            var node = wrapper.firstChild;\n            if (node.nodeName === 'SCRIPT') {\n              var script = document.createElement('script');\n              Array.prototype.slice.call(node.attributes).forEach(function (attr) {\n                script.setAttribute(attr.name, attr.value);\n              });\n              script.text = node.text || node.textContent || '';\n              wrapper.removeChild(node);\n              el.appendChild(script);\n            } else {\n              el.appendChild(node);\n            }\n          }\n        })\n        .catch(function () { el.innerHTML = 'Unable to load banner.'; });\n    });\n  })();\n</script>`
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
        open={itemEditorOpen}
        onClose={() => setItemEditorOpen(false)}
        title="Edit item info"
        primaryAction={{
          content: "Save",
          onAction: () => {
            if (!itemEditor?.id) return;
            const nextTags = {
              ...itemTagsDraft,
              showTextOverlay:
                Boolean(itemTagsDraft.textTitle) || Boolean(itemTagsDraft.textDescription),
            };
            const formData = new FormData();
            formData.set("action", "update-banner-item");
            formData.set("itemId", itemEditor.id);
            formData.set("tagsJson", JSON.stringify(nextTags));
            formData.set(
              "scheduledStartAt",
              itemScheduledEnabled ? itemScheduledStartAt : ""
            );
            formData.set("scheduledEndAt", itemScheduledEnabled ? itemScheduledEndAt : "");
            itemUpdateFetcher.submit(formData, { method: "post" });
            setOrderedItems((prev) =>
              prev.map((item) =>
                item.id === itemEditor.id
                  ? {
                      ...item,
                      tags: nextTags,
                      scheduledStartAt: itemScheduledEnabled ? itemScheduledStartAt : "",
                      scheduledEndAt: itemScheduledEnabled ? itemScheduledEndAt : "",
                    }
                  : item
              )
            );
            setItemEditorOpen(false);
          },
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setItemEditorOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Tabs
            tabs={[
              { id: "content", content: "Content", panelID: "content-panel" },
              { id: "config", content: "Configuration", panelID: "config-panel" },
            ]}
            selected={itemEditorTab}
            onSelect={setItemEditorTab}
          />
          {itemEditorTab === 0 ? (
            <BlockStack gap="300" padding="300">
              <Text as="p" variant="bodySm">
                Reorder and toggle what appears on this item.
              </Text>
              {(Array.isArray(itemTagsDraft.contentOrder)
                ? itemTagsDraft.contentOrder
                : ["title", "description", "cta", "countdown"]
              ).map((key: string, index: number) => (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setContentDragIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    handleContentDragOver(index);
                  }}
                  onDragEnd={() => setContentDragIndex(null)}
                  className="bainners-content-card"
                >
                  <Card padding="300">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="headingSm">
                        {key === "title"
                          ? "Title"
                          : key === "description"
                          ? "Description"
                          : key === "cta"
                          ? "CTA"
                          : "Countdown"}
                      </Text>
                    </InlineStack>

                    {key === "title" && (
                      <BlockStack gap="200">
                        <Checkbox
                          label="Show title"
                          checked={Boolean(itemTagsDraft.textTitle)}
                          onChange={(value) =>
                            updateItemTagsDraft({ textTitle: value ? "Title" : "" })
                          }
                        />
                        {itemTagsDraft.textTitle ? (
                          <TextField
                            label="Title"
                            value={itemTagsDraft.textTitle || ""}
                            onChange={(value) => updateItemTagsDraft({ textTitle: value })}
                          />
                        ) : null}
                      </BlockStack>
                    )}

                    {key === "description" && (
                      <BlockStack gap="200">
                        <Checkbox
                          label="Show description"
                          checked={Boolean(itemTagsDraft.textDescription)}
                          onChange={(value) =>
                            updateItemTagsDraft({ textDescription: value ? "Description" : "" })
                          }
                        />
                        {itemTagsDraft.textDescription ? (
                          <TextField
                            label="Description"
                            value={itemTagsDraft.textDescription || ""}
                            onChange={(value) => updateItemTagsDraft({ textDescription: value })}
                            multiline={2}
                          />
                        ) : null}
                      </BlockStack>
                    )}

                    {key === "cta" && (
                      <BlockStack gap="200">
                        <Checkbox
                          label="Show CTA"
                          checked={Boolean(itemTagsDraft.showCta)}
                          onChange={(value) => updateItemTagsDraft({ showCta: value })}
                        />
                        {itemTagsDraft.showCta ? (
                          <BlockStack gap="200">
                            <Select
                              label="CTA type"
                              options={[
                                { label: "Button", value: "button" },
                                { label: "Entire item clickable", value: "item" },
                              ]}
                              value={itemTagsDraft.ctaMode || "button"}
                              onChange={(value) => updateItemTagsDraft({ ctaMode: value })}
                            />
                            <InlineStack gap="200" blockAlign="center">
                              {itemTagsDraft.ctaMode !== "item" ? (
                                <TextField
                                  label="CTA text"
                                  value={itemTagsDraft.ctaText || ""}
                                  onChange={(value) => updateItemTagsDraft({ ctaText: value })}
                                />
                              ) : null}
                              <TextField
                                label="CTA URL"
                                value={itemTagsDraft.ctaUrl || ""}
                                onChange={(value) => updateItemTagsDraft({ ctaUrl: value })}
                              />
                              <Select
                                label="CTA target"
                                options={[
                                  { label: "Same tab", value: "_self" },
                                  { label: "New tab", value: "_blank" },
                                  { label: "Parent frame", value: "_parent" },
                                  { label: "Top frame", value: "_top" },
                                ]}
                                value={itemTagsDraft.ctaTarget || "_self"}
                                onChange={(value) => updateItemTagsDraft({ ctaTarget: value })}
                              />
                            </InlineStack>
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    )}

                    {key === "countdown" && (
                      <BlockStack gap="200">
                        <Checkbox
                          label="Show countdown"
                          checked={Boolean(itemTagsDraft.showCountdown)}
                          onChange={(value) => updateItemTagsDraft({ showCountdown: value })}
                        />
                        {itemTagsDraft.showCountdown ? (
                          <BlockStack gap="200">
                            <Checkbox
                              label="Show labels"
                              checked={Boolean(itemTagsDraft.countdownShowLabels)}
                              onChange={(value) =>
                                updateItemTagsDraft({ countdownShowLabels: value })
                              }
                            />
                            <Select
                              label="Mode"
                              options={[
                                { label: "Fixed end time", value: "fixed" },
                                { label: "Evergreen (relative)", value: "evergreen" },
                              ]}
                              value={itemTagsDraft.countdownMode || "fixed"}
                              onChange={(value) => updateItemTagsDraft({ countdownMode: value })}
                            />
                            {itemTagsDraft.countdownMode === "evergreen" ? (
                              <TextField
                                label="Duration (hours)"
                                type="number"
                                value={itemTagsDraft.countdownDurationHours || "1"}
                                onChange={(value) =>
                                  updateItemTagsDraft({ countdownDurationHours: value })
                                }
                              />
                            ) : (
                              <TextField
                                label="End date"
                                type="datetime-local"
                                value={itemTagsDraft.countdownEndAt || ""}
                                onChange={(value) =>
                                  updateItemTagsDraft({ countdownEndAt: value })
                                }
                              />
                            )}
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    )}
                  </BlockStack>
                  </Card>
                </div>
              ))}
            </BlockStack>
          ) : (
            <BlockStack gap="300" padding="300">
              <BlockStack gap="200">
                {canSchedule ? (
                  <>
                    <Checkbox
                      label="Scheduled"
                      checked={itemScheduledEnabled}
                      onChange={(value) => {
                        setItemScheduledEnabled(value);
                        if (!value) {
                          setItemScheduledStartAt("");
                          setItemScheduledEndAt("");
                        }
                      }}
                    />
                    {itemScheduledEnabled ? (
                      <InlineStack gap="300" align="start">
                        <TextField
                          label="Start date"
                          type="datetime-local"
                          value={itemScheduledStartAt}
                          onChange={setItemScheduledStartAt}
                        />
                        <TextField
                          label="End date"
                          type="datetime-local"
                          value={itemScheduledEndAt}
                          onChange={setItemScheduledEndAt}
                        />
                      </InlineStack>
                    ) : null}
                  </>
                ) : (
                  <PolarisBanner tone="warning">
                    <p>Scheduling is available on the Pro and Ultra plans.</p>
                  </PolarisBanner>
                )}
              </BlockStack>
              <Checkbox
                label="Show overlay"
                checked={Boolean(itemTagsDraft.showOverlay)}
                onChange={(value) => updateItemTagsDraft({ showOverlay: value })}
              />
              {itemEditor?.tags?.mediaType === "video" ? (
                <BlockStack gap="200">
                  <Checkbox
                    label="Autoplay"
                    checked={Boolean(itemTagsDraft.autoplay)}
                    onChange={(value) => updateItemTagsDraft({ autoplay: value })}
                  />
                  <Checkbox
                    label="Muted"
                    checked={Boolean(itemTagsDraft.muted)}
                    onChange={(value) => updateItemTagsDraft({ muted: value })}
                  />
                  <Checkbox
                    label="Loop"
                    checked={Boolean(itemTagsDraft.loop)}
                    onChange={(value) => updateItemTagsDraft({ loop: value })}
                  />
                <Checkbox
                  label="Hide controls"
                  checked={!itemTagsDraft.showControls}
                  onChange={(value) => updateItemTagsDraft({ showControls: !value })}
                />
                </BlockStack>
              ) : null}
              <Select
                label="Text position"
                options={[
                  { label: "Top left", value: "top_left" },
                  { label: "Top center", value: "top_center" },
                  { label: "Top right", value: "top_right" },
                  { label: "Center left", value: "center_left" },
                  { label: "Center", value: "center_center" },
                  { label: "Center right", value: "center_right" },
                  { label: "Bottom left", value: "bottom_left" },
                  { label: "Bottom center", value: "bottom_center" },
                  { label: "Bottom right", value: "bottom_right" },
                ]}
                value={itemTagsDraft.textPosition || "bottom_left"}
                onChange={(value) => updateItemTagsDraft({ textPosition: value })}
              />
            </BlockStack>
          )}
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
              srcDoc={previewHtml}
            />
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={bannerAnalyticsOpen}
        onClose={() => setBannerAnalyticsOpen(false)}
        title="Banner analytics"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Overview
              </Text>
              <Select
                label="Date range"
                labelHidden
                options={analyticsOptions}
                value={analyticsRange}
                onChange={(value) => setAnalyticsRange(value)}
              />
            </InlineStack>
            <InlineStack gap="300">
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Views
                  </Text>
                  <Text as="p" variant="headingMd">
                    {bannerAnalytics?.totals?.views ?? 0}
                  </Text>
                </BlockStack>
              </Card>
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Clicks
                  </Text>
                  <Text as="p" variant="headingMd">
                    {bannerAnalytics?.totals?.clicks ?? 0}
                  </Text>
                </BlockStack>
              </Card>
              {plan !== "free" ? (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      CTR
                    </Text>
                    <Text as="p" variant="headingMd">
                      {(bannerAnalytics?.totals?.ctr ?? 0).toFixed(2)}%
                    </Text>
                  </BlockStack>
                </Card>
              ) : null}
            </InlineStack>
            {plan !== "free" ? (
              <AnalyticsLineChart data={bannerAnalytics?.chart || []} />
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={itemAnalyticsOpen}
        onClose={() => setItemAnalyticsOpen(false)}
        title="Item analytics"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Overview
              </Text>
              <Select
                label="Date range"
                labelHidden
                options={analyticsOptions}
                value={analyticsRange}
                onChange={(value) => setAnalyticsRange(value)}
              />
            </InlineStack>
            <InlineStack gap="300">
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Views
                  </Text>
                  <Text as="p" variant="headingMd">
                    {itemAnalytics?.totals?.views ?? 0}
                  </Text>
                </BlockStack>
              </Card>
              <Card background="bg-surface-secondary">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Clicks
                  </Text>
                  <Text as="p" variant="headingMd">
                    {itemAnalytics?.totals?.clicks ?? 0}
                  </Text>
                </BlockStack>
              </Card>
              {plan !== "free" ? (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      CTR
                    </Text>
                    <Text as="p" variant="headingMd">
                      {(itemAnalytics?.totals?.ctr ?? 0).toFixed(2)}%
                    </Text>
                  </BlockStack>
                </Card>
              ) : null}
            </InlineStack>
            {plan !== "free" ? (
              <AnalyticsLineChart data={itemAnalytics?.chart || []} />
            ) : null}
          </BlockStack>
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
            setAdvancedValues(advancedDraft);
            if (layoutValue === "announcement") {
              setAnnouncementContentSpacing(String(advancedDraft.announcementContentSpacing ?? 12));
            }
            saveBanner({
              ...advancedDraft,
              customCss: customCssDraft,
              announcementContentSpacing:
                layoutValue === "announcement"
                  ? String(advancedDraft.announcementContentSpacing ?? 12)
                  : undefined,
            });
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
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Banner styles
              </Text>
              {renderColorField(
                "Background color",
                advancedDraft.bannerBackgroundColor,
                (value) => updateAdvancedDraft({ bannerBackgroundColor: value })
              )}
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Typography
              </Text>
              <InlineStack gap="300" align="start">
                <Select
                  label={layoutValue === "announcement" ? "Text size" : "Title size"}
                  options={[
                    { label: "Small", value: "sm" },
                    { label: "Medium", value: "md" },
                    { label: "Large", value: "lg" },
                    { label: "Extra large", value: "xl" },
                  ]}
                  value={advancedDraft.titleFontSize}
                  onChange={(value) => updateAdvancedDraft({ titleFontSize: value })}
                />
                {renderColorField(
                  layoutValue === "announcement" ? "Text color" : "Title color",
                  advancedDraft.titleColor,
                  (value) => updateAdvancedDraft({ titleColor: value })
                )}
              </InlineStack>
              {layoutValue !== "announcement" ? (
                <InlineStack gap="300" align="start">
                  <Select
                    label="Description size"
                    options={[
                      { label: "Small", value: "sm" },
                      { label: "Medium", value: "md" },
                      { label: "Large", value: "lg" },
                      { label: "Extra large", value: "xl" },
                    ]}
                    value={advancedDraft.descriptionFontSize}
                    onChange={(value) => updateAdvancedDraft({ descriptionFontSize: value })}
                  />
                  {renderColorField("Description color", advancedDraft.descriptionColor, (value) =>
                    updateAdvancedDraft({ descriptionColor: value })
                  )}
                </InlineStack>
              ) : null}
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                CTA styles
              </Text>
              <Select
                label="CTA style"
                options={[
                  { label: "Button", value: "button" },
                  { label: "Link", value: "link" },
                ]}
                value={advancedDraft.ctaStyle || "button"}
                onChange={(value) => updateAdvancedDraft({ ctaStyle: value })}
              />
              <InlineStack gap="300" align="start">
                {renderColorField("CTA text color", advancedDraft.ctaTextColor, (value) =>
                  updateAdvancedDraft({ ctaTextColor: value })
                )}
                {advancedDraft.ctaStyle !== "link" ? (
                  <>
                    {renderColorField("CTA background", advancedDraft.ctaBackgroundColor, (value) =>
                      updateAdvancedDraft({ ctaBackgroundColor: value })
                    )}
                    {renderColorField("CTA border", advancedDraft.ctaBorderColor, (value) =>
                      updateAdvancedDraft({ ctaBorderColor: value })
                    )}
                  </>
                ) : null}
              </InlineStack>
              <InlineStack gap="300" align="start">
                {advancedDraft.ctaStyle !== "link" ? (
                  <>
                    <Checkbox
                      label="Bordered"
                      checked={advancedDraft.ctaBordered}
                      onChange={(value) => updateAdvancedDraft({ ctaBordered: value })}
                    />
                    <Checkbox
                      label="Rounded"
                      checked={advancedDraft.ctaRounded}
                      onChange={(value) => updateAdvancedDraft({ ctaRounded: value })}
                    />
                    <Checkbox
                      label="Shadow"
                      checked={advancedDraft.ctaShadow}
                      onChange={(value) => updateAdvancedDraft({ ctaShadow: value })}
                    />
                  </>
                ) : (
                  <Checkbox
                    label="Underline"
                    checked={advancedDraft.ctaUnderline}
                    onChange={(value) => updateAdvancedDraft({ ctaUnderline: value })}
                  />
                )}
              </InlineStack>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Countdown styles
              </Text>
              <InlineStack gap="300" align="start">
                <Select
                  label="Countdown style"
                  options={[
                    { label: "Solid", value: "solid" },
                    { label: "Text only", value: "text" },
                    { label: "Segments", value: "segments" },
                    { label: "Pill", value: "pill" },
                  ]}
                  value={advancedDraft.countdownStyle}
                  onChange={(value) => updateAdvancedDraft({ countdownStyle: value })}
                />
                <Select
                  label="Countdown size"
                  options={[
                    { label: "Small", value: "sm" },
                    { label: "Medium", value: "md" },
                    { label: "Large", value: "lg" },
                    { label: "Extra large", value: "xl" },
                  ]}
                  value={advancedDraft.countdownFontSize || "md"}
                  onChange={(value) => updateAdvancedDraft({ countdownFontSize: value })}
                />
                {renderColorField(
                  "Countdown text color",
                  advancedDraft.countdownTextColor,
                  (value) => updateAdvancedDraft({ countdownTextColor: value })
                )}
                {renderColorField(
                  "Countdown background",
                  advancedDraft.countdownBackgroundColor,
                  (value) => updateAdvancedDraft({ countdownBackgroundColor: value })
                )}
              </InlineStack>
            </BlockStack>

            {layoutValue === "slider" ? (
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Slider arrows & bullets
                </Text>
                <InlineStack gap="300" align="start" wrap={false}>
                  {[
                    { id: "chevron", label: "Chevron" },
                    { id: "arrow", label: "Arrow" },
                    { id: "minimal", label: "Minimal" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`bainners-arrow-style${
                        advancedDraft.sliderArrowStyle === option.id
                          ? " bainners-arrow-style--selected"
                          : ""
                      }`}
                      onClick={() => updateAdvancedDraft({ sliderArrowStyle: option.id })}
                    >
                      <span className={`bainners-arrow-preview bainners-arrow-preview--${option.id}`}>
                        {option.id === "arrow" ? "← →" : option.id === "minimal" ? "‹ ›" : "❮ ❯"}
                      </span>
                      <span className="bainners-arrow-label">{option.label}</span>
                    </button>
                  ))}
                </InlineStack>
                <InlineStack gap="300" align="start">
                  {renderColorField("Arrow color", advancedDraft.sliderArrowColor, (value) =>
                    updateAdvancedDraft({ sliderArrowColor: value })
                  )}
                  {renderColorField("Bullet color", advancedDraft.sliderBulletColor, (value) =>
                    updateAdvancedDraft({ sliderBulletColor: value })
                  )}
                </InlineStack>
              </BlockStack>
            ) : null}

                {layoutValue === "announcement" ? (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Announcement motion
                    </Text>
                <InlineStack gap="300" align="start">
                  {announcementLayoutMode === "inline" ? (
                    <Checkbox
                      label="Marquee"
                      checked={advancedDraft.announcementMarquee}
                      onChange={(value) => {
                        updateAdvancedDraft({
                          announcementMarquee: value,
                          announcementSeparatorEnabled: value
                            ? false
                            : advancedDraft.announcementSeparatorEnabled,
                        });
                      }}
                    />
                  ) : null}
                  <Select
                    label="Animation"
                    options={[
                      { label: "None", value: "none" },
                      { label: "Shake", value: "shake" },
                      { label: "Pulse", value: "pulse" },
                      { label: "Bounce", value: "bounce" },
                    ]}
                    value={advancedDraft.announcementAnimation}
                    onChange={(value) => updateAdvancedDraft({ announcementAnimation: value })}
                  />
                  {renderColorField(
                    "Close icon color",
                    advancedDraft.announcementCloseColor,
                    (value) => updateAdvancedDraft({ announcementCloseColor: value })
                  )}
                </InlineStack>
                {announcementLayoutMode === "inline" && !advancedDraft.announcementMarquee ? (
                  <InlineStack gap="300" align="start">
                    <Checkbox
                      label="Show separator"
                      checked={advancedDraft.announcementSeparatorEnabled}
                      onChange={(value) =>
                        updateAdvancedDraft({ announcementSeparatorEnabled: value })
                      }
                    />
                    {advancedDraft.announcementSeparatorEnabled ? (
                      <TextField
                        label="Separator"
                        value={advancedDraft.announcementSeparatorText || "|"}
                        onChange={(value) =>
                          updateAdvancedDraft({ announcementSeparatorText: value })
                        }
                      />
                    ) : null}
                  </InlineStack>
                ) : null}
                    {announcementLayoutMode === "stacked" ? (
                      <TextField
                        label="Content spacing (px)"
                        type="number"
                        value={String(advancedDraft.announcementContentSpacing ?? 12)}
                        onChange={(value) =>
                          updateAdvancedDraft({ announcementContentSpacing: Number(value || 12) })
                        }
                        min={0}
                        step={1}
                      />
                    ) : null}
                    <InlineStack gap="300" align="start">
                      {renderColorField(
                        "Coupon text color",
                        advancedDraft.announcementCouponTextColor,
                        (value) => updateAdvancedDraft({ announcementCouponTextColor: value })
                      )}
                      {renderColorField(
                        "Coupon border",
                        advancedDraft.announcementCouponBorderColor,
                        (value) => updateAdvancedDraft({ announcementCouponBorderColor: value })
                      )}
                      {renderColorField(
                        "Coupon background",
                        advancedDraft.announcementCouponBackgroundColor,
                        (value) => updateAdvancedDraft({ announcementCouponBackgroundColor: value })
                      )}
                    </InlineStack>
                  </BlockStack>
                ) : null}

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Additional CSS (optional)
              </Text>
              {plan === "free" ? (
                <PolarisBanner tone="warning">
                  <p>Additional CSS is available on the Pro and Ultra plans.</p>
                </PolarisBanner>
              ) : null}
              <TextField
                label="Custom CSS"
                labelHidden
                multiline={8}
                placeholder=".hero-banner { }"
                value={customCssDraft}
                onChange={setCustomCssDraft}
                monospaced
                disabled={plan === "free"}
              />
            </BlockStack>
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
            {productLoadErrorState ? (
              <PolarisBanner tone="critical" title="Failed to load products">
                <p>{productLoadErrorState}</p>
              </PolarisBanner>
            ) : shopifyProductsState.length === 0 ? (
              <PolarisBanner tone="info">
                <p>No Shopify products found.</p>
              </PolarisBanner>
            ) : (
              <>
                <Select
                  label="Select product"
                  options={[
                    { label: "Select a product...", value: "", disabled: true },
                    ...shopifyProductsState.map((product) => ({
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
