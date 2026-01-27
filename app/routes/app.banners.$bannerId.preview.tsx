import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { planHasFeature, PlanFeature } from "../lib/plans";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TITLE_SIZE_MAP: Record<string, string> = {
  sm: "20px",
  md: "24px",
  lg: "30px",
  xl: "38px",
};

const DESCRIPTION_SIZE_MAP: Record<string, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "20px",
};
const COUNTDOWN_SIZE_MAP: Record<string, string> = {
  sm: "12px",
  md: "14px",
  lg: "16px",
  xl: "18px",
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const bannerId = params.bannerId;
  const shop = session?.shop;

  if (!bannerId || !shop) {
    return new Response("Missing bannerId or shop", { status: 400 });
  }

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return new Response("Shop not found", { status: 404 });
  }

  const banner = await db.banner.findFirst({
    where: { id: bannerId, shopId: shopRecord.id },
    include: {
      bannerItems: {
        orderBy: { displayOrder: "asc" },
        include: { image: true },
      },
    },
  });

  if (!banner) {
    return new Response("Banner not found", { status: 404 });
  }

  const translations = {
    couponCopied: shopRecord.defaultTranslationCouponCopied || "Coupon copied",
    days: shopRecord.defaultTranslationDays || "Days",
    hours: shopRecord.defaultTranslationHours || "Hours",
    minutes: shopRecord.defaultTranslationMinutes || "Minutes",
    seconds: shopRecord.defaultTranslationSeconds || "Seconds",
  };

  const now = Date.now();
  const isWithinSchedule = (start?: Date | string | null, end?: Date | string | null) => {
    const startTime = start ? new Date(start).getTime() : null;
    const endTime = end ? new Date(end).getTime() : null;
    if (startTime && now < startTime) return false;
    if (endTime && now > endTime) return false;
    return true;
  };

  const canSchedule = planHasFeature(shopRecord.plan, PlanFeature.SCHEDULING);
  if (canSchedule && !isWithinSchedule(banner.scheduledStartAt, banner.scheduledEndAt)) {
    return new Response("", { status: 200 });
  }

  const items = banner.bannerItems.filter((item) =>
    canSchedule ? isWithinSchedule(item.scheduledStartAt, item.scheduledEndAt) : true
  );
  const selectedItem = items.find((item) => item.isSelected) || items[0] || null;

  if (!selectedItem && banner.layout !== "announcement") {
    return new Response("No images yet.", { status: 200 });
  }

  const titleSize =
    TITLE_SIZE_MAP[banner.titleFontSize || "lg"] || TITLE_SIZE_MAP.lg;
  const descriptionSize =
    DESCRIPTION_SIZE_MAP[banner.descriptionFontSize || "md"] || DESCRIPTION_SIZE_MAP.md;
  const countdownSize =
    COUNTDOWN_SIZE_MAP[banner.countdownFontSize || "md"] || COUNTDOWN_SIZE_MAP.md;
  const bannerStyleVars = [
    `--bainners-title-size:${titleSize}`,
    `--bainners-desc-size:${descriptionSize}`,
    `--bainners-countdown-size:${countdownSize}`,
    banner.bannerBackgroundColor
      ? `--bainners-banner-bg:${banner.bannerBackgroundColor}`
      : "",
    banner.titleColor ? `--bainners-title-color:${banner.titleColor}` : "",
    banner.descriptionColor ? `--bainners-desc-color:${banner.descriptionColor}` : "",
    banner.ctaTextColor ? `--bainners-cta-color:${banner.ctaTextColor}` : "",
    banner.ctaBackgroundColor ? `--bainners-cta-bg:${banner.ctaBackgroundColor}` : "",
    banner.ctaBorderColor ? `--bainners-cta-border:${banner.ctaBorderColor}` : "",
    banner.countdownTextColor
      ? `--bainners-countdown-color:${banner.countdownTextColor}`
      : "",
    banner.countdownBackgroundColor
      ? `--bainners-countdown-bg:${banner.countdownBackgroundColor}`
      : "",
    banner.announcementCloseColor
      ? `--bainners-announcement-close-color:${banner.announcementCloseColor}`
      : "",
    banner.announcementCouponTextColor
      ? `--bainners-announcement-coupon-color:${banner.announcementCouponTextColor}`
      : "",
    banner.announcementCouponBorderColor
      ? `--bainners-announcement-coupon-border:${banner.announcementCouponBorderColor}`
      : "",
    banner.announcementCouponBackgroundColor
      ? `--bainners-announcement-coupon-bg:${banner.announcementCouponBackgroundColor}`
      : "",
    banner.announcementContentSpacing !== null && banner.announcementContentSpacing !== undefined
      ? `--bainners-announcement-gap:${banner.announcementContentSpacing}px`
      : "",
    banner.sliderArrowColor ? `--bainners-arrow-color:${banner.sliderArrowColor}` : "",
    banner.sliderBulletColor ? `--bainners-bullet-color:${banner.sliderBulletColor}` : "",
  ]
    .filter(Boolean)
    .join(";");

  const ctaClasses = [
    "bainners-banner-cta",
    banner.ctaStyle === "link" ? "bainners-cta--link" : "",
    banner.ctaUnderline ? "bainners-cta--underline" : "",
    banner.ctaBordered ? "bainners-cta--bordered" : "",
    banner.ctaRounded ? "bainners-cta--rounded" : "",
    banner.ctaShadow ? "bainners-cta--shadow" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const countdownClass = `bainners-countdown bainners-countdown--${
    banner.countdownStyle || "solid"
  }`;

  const announcementClasses = [
    "bainners-announcement",
    banner.announcementLayout !== "stacked" && banner.announcementMarquee
      ? "bainners-announcement--marquee"
      : "",
    banner.announcementAnimation && banner.announcementAnimation !== "none"
      ? `bainners-announcement--${banner.announcementAnimation}`
      : "",
    banner.announcementLayout === "stacked" ? "bainners-announcement--stacked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const renderItem = (item: typeof selectedItem) => {
    if (!item) return "";
    const imageUrl = item.image?.storageUrl || item.externalImageUrl || "";
    const title = item.title || banner.title || "";
    const tags = (item.tags as Record<string, any> | null) || {};
    const showOverlay = Boolean(tags.showOverlay);
    const showText = Boolean(tags.showTextOverlay);
    const showCta = Boolean(tags.showCta);
    const textTitle = tags.textTitle || "";
    const textDescription = tags.textDescription || "";
    const ctaText = tags.ctaText || "";
    const ctaUrl = tags.ctaUrl || "#";
    const ctaTarget = tags.ctaTarget || "_self";
    const ctaMode = tags.ctaMode || "button";
    const itemClickable = showCta && ctaMode === "item" && ctaUrl;
    const ctaRel = ctaTarget === "_blank" ? "noopener noreferrer" : "";

    const contentOrder = Array.isArray(tags.contentOrder)
      ? tags.contentOrder
      : ["title", "description", "cta", "countdown"];
    const showCountdown = Boolean(tags.showCountdown);
    const countdownMode = tags.countdownMode || "fixed";
    const countdownEndAt = tags.countdownEndAt || "";
    const countdownTimezone = tags.countdownTimezone || "UTC";
    const countdownDurationHours = tags.countdownDurationHours || "1";
    const countdownShowLabels = Boolean(tags.countdownShowLabels);

    const overlayItems = contentOrder
      .map((key) => {
        if (key === "title" && showText && textTitle) {
          return `<h3>${escapeHtml(textTitle)}</h3>`;
        }
        if (key === "description" && showText && textDescription) {
          return `<p>${escapeHtml(textDescription)}</p>`;
        }
        if (key === "cta" && showCta && ctaMode !== "item") {
          return `<a class="${ctaClasses}" href="${escapeHtml(
            ctaUrl
          )}" target="${escapeHtml(ctaTarget)}" rel="${escapeHtml(ctaRel)}">${escapeHtml(
            ctaText || "Learn more"
          )}</a>`;
        }
        if (key === "countdown" && showCountdown) {
          return `<div class="${countdownClass}" data-mode="${escapeHtml(
            countdownMode
          )}" data-end="${escapeHtml(countdownEndAt)}" data-tz="${escapeHtml(
            countdownTimezone
          )}" data-duration="${escapeHtml(countdownDurationHours)}" data-labels="${
            countdownShowLabels ? "1" : "0"
          }" data-label-days="${escapeHtml(translations.days)}" data-label-hours="${escapeHtml(
            translations.hours
          )}" data-label-minutes="${escapeHtml(translations.minutes)}" data-label-seconds="${escapeHtml(
            translations.seconds
          )}">
            <span class="bainners-countdown-value">00:00:00</span>
          </div>`;
        }
        return "";
      })
      .filter(Boolean)
      .join("");

    const overlayClass = tags.textPosition ? `bainners-overlay--${tags.textPosition}` : "";
    const overlayShadeClass = showOverlay ? "bainners-banner-overlay--shade" : "";
    const overlayClickClass = itemClickable ? "bainners-banner-overlay--pass-through" : "";

    if (tags.mediaType === "video") {
      const videoUrl = tags.videoUrl || "";
      const provider = tags.videoProvider || "";
      const videoId = tags.videoId || "";
      const autoplay = tags.autoplay ? "1" : "0";
      const muted = tags.muted ? "1" : "0";
      const loop = tags.loop ? "1" : "0";
      const controls = tags.showControls === false ? "0" : "1";
      const embedUrl =
        provider === "youtube"
          ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay}&mute=${muted}&loop=${loop}&playlist=${videoId}&controls=${controls}`
          : provider === "vimeo"
          ? `https://player.vimeo.com/video/${videoId}?autoplay=${autoplay}&muted=${muted}&loop=${loop}&controls=${controls}`
          : videoUrl;

      return `
        <div class="bainners-banner-item" data-item-id="${escapeHtml(item.id)}">
          <div class="bainners-video">
            <iframe src="${escapeHtml(
              embedUrl
            )}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
          </div>
          ${tags.showControls === false && !showOverlay ? `<div class="bainners-video-blocker"></div>` : ""}
          ${
            showOverlay || overlayItems
              ? `<div class="bainners-banner-overlay ${overlayClass} ${overlayShadeClass} ${overlayClickClass}">
                ${overlayItems}
              </div>`
            : ""
          }
          ${
            itemClickable
              ? `<a class="bainners-item-link" href="${escapeHtml(
                  ctaUrl
                )}" target="${escapeHtml(ctaTarget)}" rel="${escapeHtml(ctaRel)}" aria-label="${escapeHtml(
                  ctaText || "Open link"
                )}"></a>`
              : ""
          }
        </div>
      `;
    }

    return `
      <div class="bainners-banner-item" data-item-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />
        ${
          showOverlay || overlayItems
            ? `<div class="bainners-banner-overlay ${overlayClass} ${overlayShadeClass} ${overlayClickClass}">
                ${overlayItems}
              </div>`
            : ""
        }
        ${
          itemClickable
            ? `<a class="bainners-item-link" href="${escapeHtml(
                ctaUrl
              )}" target="${escapeHtml(ctaTarget)}" rel="${escapeHtml(ctaRel)}" aria-label="${escapeHtml(
                ctaText || "Open link"
              )}"></a>`
            : ""
        }
      </div>
    `;
  };

  const content =
    banner.layout === "slider"
      ? `<div class="bainners-swiper swiper bainners-arrow--${escapeHtml(
          banner.sliderArrowStyle || "chevron"
        )}" data-effect="${escapeHtml(
          banner.sliderType || "slide"
        )}" data-arrows="${banner.sliderShowArrows ? "1" : "0"}" data-bullets="${
          banner.sliderShowBullets ? "1" : "0"
        }" data-autoplay="${banner.sliderAutoplay ? "1" : "0"}" data-loop="${
          banner.sliderLoop ? "1" : "0"
        }" data-per-view="${banner.sliderPerView || 1}" data-speed="${escapeHtml(
          banner.sliderSpeed || "regular"
        )}" data-delay="${banner.sliderAutoplayDelay || 3500}" data-centered="${
          banner.sliderCentered ? "1" : "0"
        }" data-space="${banner.sliderSpaceBetween ?? 16}" data-hover="${
          banner.sliderPauseOnHover ? "1" : "0"
        }">
          <div class="swiper-wrapper">
            ${items.map((item) => `<div class="swiper-slide">${renderItem(item)}</div>`).join("")}
          </div>
          ${banner.sliderShowBullets ? `<div class="swiper-pagination"></div>` : ""}
          ${
            banner.sliderShowArrows
              ? `<div class="swiper-button-prev"></div><div class="swiper-button-next"></div>`
              : ""
          }
        </div>`
      : banner.layout === "announcement"
      ? (() => {
          const announcementOrder = Array.isArray(banner.announcementContentOrder)
            ? banner.announcementContentOrder
            : ["text", "cta", "countdown"];
          const showAnnouncementText = banner.announcementShowText !== false;
          const showAnnouncementCta = banner.announcementShowCta !== false;
          const useMarquee =
            banner.announcementLayout !== "stacked" && banner.announcementMarquee;
          const baseAnnouncementText = escapeHtml(banner.announcementText || "");
          const repeatedAnnouncementText = baseAnnouncementText
            ? Array(12).fill(baseAnnouncementText).join("&nbsp;&nbsp;&nbsp;&nbsp;")
            : "";
          const announcementParts = announcementOrder
            .map((key) => {
              if (key === "text" && showAnnouncementText && banner.announcementText) {
                return useMarquee
                  ? `<span class="bainners-announcement-text bainners-announcement-text--marquee"><span class="bainners-marquee-track"><span class="bainners-marquee-group">${repeatedAnnouncementText}</span><span class="bainners-marquee-group">${repeatedAnnouncementText}</span></span></span>`
                  : `<span class="bainners-announcement-text">${baseAnnouncementText}</span>`;
              }
              if (key === "cta" && showAnnouncementCta && banner.announcementCtaText) {
                return `<a class="${ctaClasses}" href="${escapeHtml(
                  banner.announcementCtaUrl || "#"
                )}" target="${escapeHtml(
                  banner.announcementCtaTarget || "_self"
                )}" rel="${
                  banner.announcementCtaTarget === "_blank" ? "noopener noreferrer" : ""
                }">${escapeHtml(banner.announcementCtaText)}</a>`;
              }
              if (key === "coupon" && banner.announcementShowCoupon && banner.announcementCouponCode) {
                return `<button type="button" class="bainners-announcement-coupon" data-coupon="${escapeHtml(
                  banner.announcementCouponCode
                )}">${escapeHtml(banner.announcementCouponCode)}</button>`;
              }
              if (key === "countdown" && banner.announcementShowCountdown) {
                return `<div class="${countdownClass}" data-mode="${escapeHtml(
                  banner.announcementCountdownMode || "fixed"
                )}" data-end="${escapeHtml(
                  banner.announcementCountdownEndAt
                    ? new Date(banner.announcementCountdownEndAt).toISOString()
                    : ""
                )}" data-tz="${escapeHtml(
                  banner.announcementCountdownTimezone || "UTC"
                )}" data-duration="${escapeHtml(
                  banner.announcementCountdownDurationHours || "1"
                )}" data-labels="${banner.announcementCountdownShowLabels ? "1" : "0"}" data-label-days="${escapeHtml(
                  translations.days
                )}" data-label-hours="${escapeHtml(translations.hours)}" data-label-minutes="${escapeHtml(
                  translations.minutes
                )}" data-label-seconds="${escapeHtml(translations.seconds)}">
                  <span class="bainners-countdown-value">00:00:00</span>
                </div>`;
              }
              return "";
            })
            .filter(Boolean)
            ;
          const separator =
            banner.announcementLayout !== "stacked" &&
            !banner.announcementMarquee &&
            banner.announcementSeparatorEnabled
              ? `<span class="bainners-announcement-separator">${escapeHtml(
                  banner.announcementSeparatorText || "|"
                )}</span>`
              : "";
          const announcementHtml = separator
            ? announcementParts.join(separator)
            : announcementParts.join("");

          return `<div class="${announcementClasses}">
              ${announcementHtml}
              ${
                banner.announcementClosable
                  ? `<button class="bainners-announcement-close" type="button" aria-label="Close banner">×</button>`
                  : ""
              }
            </div>`;
        })()
      : renderItem(selectedItem);

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
        <style>
          body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; }
          .bainners-banner { position: relative; width: 100%; background: var(--bainners-banner-bg, transparent); }
          .bainners-banner-item { position: relative; width: 100%; }
          .bainners-banner-item img { width: 100%; height: auto; display: block; }
          .bainners-banner-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            gap: 8px;
            padding: 24px;
            color: var(--bainners-title-color, #ffffff);
            z-index: 2;
          }
          .bainners-overlay--top_left { justify-content: flex-start; align-items: flex-start; text-align: left; }
          .bainners-overlay--top_center { justify-content: flex-start; align-items: center; text-align: center; }
          .bainners-overlay--top_right { justify-content: flex-start; align-items: flex-end; text-align: right; }
          .bainners-overlay--center_left { justify-content: center; align-items: flex-start; text-align: left; }
          .bainners-overlay--center_center { justify-content: center; align-items: center; text-align: center; }
          .bainners-overlay--center_right { justify-content: center; align-items: flex-end; text-align: right; }
          .bainners-overlay--bottom_left { justify-content: flex-end; align-items: flex-start; text-align: left; }
          .bainners-overlay--bottom_center { justify-content: flex-end; align-items: center; text-align: center; }
          .bainners-overlay--bottom_right { justify-content: flex-end; align-items: flex-end; text-align: right; }
          .bainners-banner-overlay--shade {
            background: rgba(0, 0, 0, 0.5);
          }
          .bainners-banner-overlay--pass-through {
            pointer-events: none;
          }
          .bainners-banner-overlay > * { position: relative; z-index: 1; }
          .bainners-item-link {
            position: absolute;
            inset: 0;
            z-index: 1;
            text-decoration: none;
          }
          .bainners-banner-overlay h3 { margin: 0 0 4px 0; font-size: var(--bainners-title-size, 28px); font-weight: 700; color: var(--bainners-title-color, #ffffff); }
          .bainners-banner-overlay p { margin: 0; font-size: var(--bainners-desc-size, 16px); color: var(--bainners-desc-color, #ffffff); }
          .bainners-banner-cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: fit-content;
            padding: 10px 18px;
            border-radius: 6px;
            background: var(--bainners-cta-bg, #ffffff);
            color: var(--bainners-cta-color, #000000);
            border: 1px solid var(--bainners-cta-border, transparent);
            text-decoration: none;
            font-weight: 600;
          }
          .bainners-cta--link {
            background: transparent;
            border: 0;
            padding: 0;
            box-shadow: none;
          }
          .bainners-cta--underline { text-decoration: underline; }
          .bainners-cta--bordered { border-color: var(--bainners-cta-border, currentColor); }
          .bainners-cta--rounded { border-radius: 999px; }
          .bainners-cta--shadow { box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
          .swiper-button-prev,
          .swiper-button-next { color: var(--bainners-arrow-color, #111111); }
          .bainners-arrow--chevron .swiper-button-prev::after { content: "‹"; font-size: 28px; }
          .bainners-arrow--chevron .swiper-button-next::after { content: "›"; font-size: 28px; }
          .bainners-arrow--arrow .swiper-button-prev::after { content: "←"; font-size: 24px; }
          .bainners-arrow--arrow .swiper-button-next::after { content: "→"; font-size: 24px; }
          .bainners-arrow--minimal .swiper-button-prev::after { content: "❮"; font-size: 22px; }
          .bainners-arrow--minimal .swiper-button-next::after { content: "❯"; font-size: 22px; }
          .swiper-pagination-bullet { background: var(--bainners-bullet-color, #111111); opacity: 0.4; }
          .swiper-pagination-bullet-active { opacity: 1; }
          .bainners-video { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; }
          .bainners-video iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; display: block; }
          .bainners-video-blocker { position: absolute; inset: 0; background: rgba(0,0,0,0); z-index: 2; }
          .bainners-announcement { position: relative; display: flex; align-items: center; justify-content: center; text-align: center; gap: var(--bainners-announcement-gap, 16px); padding: 16px 48px 16px 24px; background: var(--bainners-banner-bg, #f6f6f7); color: var(--bainners-title-color, #111111); flex-wrap: wrap; }
          .bainners-announcement--stacked { flex-direction: column; align-items: center; text-align: center; }
          .bainners-announcement-text { font-weight: 600; font-size: var(--bainners-title-size, 16px); }
          .bainners-announcement--marquee { display: grid; grid-template-columns: 1fr auto auto; align-items: center; column-gap: var(--bainners-announcement-gap, 16px); }
          .bainners-announcement-text--marquee { overflow: hidden; white-space: nowrap; }
          .bainners-marquee-track {
            display: inline-flex;
            align-items: center;
            white-space: nowrap;
            width: max-content;
            animation: bainners-marquee 4s linear infinite;
            will-change: transform;
            transform: translate3d(0,0,0);
          }
          .bainners-marquee-group {
            display: inline-flex;
            align-items: center;
            gap: 36px;
            padding-right: 36px;
            flex: 0 0 auto;
          }
          .bainners-announcement-separator { opacity: 0.6; font-weight: 600; }
          .bainners-announcement-coupon {
            border: 1px dashed var(--bainners-announcement-coupon-border, currentColor);
            color: var(--bainners-announcement-coupon-color, currentColor);
            background: var(--bainners-announcement-coupon-bg, transparent);
            padding: 6px 12px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          }
          .bainners-toast {
            position: absolute;
            right: 12px;
            bottom: 12px;
            background: #111111;
            color: #ffffff;
            padding: 8px 12px;
            border-radius: 10px;
            font-size: 12px;
            opacity: 0;
            pointer-events: none;
            transform: translateY(6px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            z-index: 3;
          }
          .bainners-toast.bainners-toast--visible {
            opacity: 1;
            transform: translateY(0);
          }
          .bainners-announcement--shake { animation: bainners-shake 1s ease-in-out 1; }
          .bainners-announcement--pulse { animation: bainners-pulse 2.2s ease-in-out 1; }
          .bainners-announcement--bounce { animation: bainners-bounce 2s ease-in-out 1; }
          .bainners-announcement-close {
            position: absolute;
            right: 12px;
            top: 12px;
            border: 0;
            background: transparent;
            color: var(--bainners-announcement-close-color, #111111);
            font-size: 20px;
            cursor: pointer;
          }
          .bainners-countdown {
            font-weight: 600;
            color: var(--bainners-countdown-color, #111111);
            background: var(--bainners-countdown-bg, #fef3c7);
            padding: 6px 10px;
            border-radius: 8px;
            font-size: var(--bainners-countdown-size, 14px);
          }
          .bainners-countdown--outline { background: transparent; border: 1px solid var(--bainners-countdown-color, #111111); }
          .bainners-countdown--pill { border-radius: 999px; }
          .bainners-countdown--text { background: transparent; padding: 0; }
          .bainners-countdown--segments {
            background: transparent;
            padding: 0;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .bainners-countdown-segment {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            background: var(--bainners-countdown-bg, #fef3c7);
            color: var(--bainners-countdown-color, #111111);
            padding: 4px 8px;
            border-radius: 6px;
          }
          .bainners-countdown--segments .bainners-countdown-separator {
            color: var(--bainners-countdown-color, #111111);
            font-weight: 600;
            margin: 0 4px;
          }
          .bainners-countdown-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
          @keyframes bainners-marquee {
            0% { transform: translate3d(0,0,0); }
            100% { transform: translate3d(-50%,0,0); }
          }
          @keyframes bainners-shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-3px); }
            75% { transform: translateX(3px); }
          }
          @keyframes bainners-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.65; }
          }
          @keyframes bainners-bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
        </style>
      </head>
      <body>
          <div class="bainners-banner bainners-banner--${escapeHtml(
            banner.layout
          )}" data-coupon-toast="${escapeHtml(translations.couponCopied)}" style="${escapeHtml(
            bannerStyleVars
          )}">
          ${content}
          <div class="bainners-toast" role="status" aria-live="polite"></div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
        <script>
          (function () {
            if (typeof window.Swiper === "undefined") return;
            document.querySelectorAll(".bainners-swiper").forEach(function (slider) {
              if (slider.__bainnersInit) return;
              slider.__bainnersInit = true;
              var effect = slider.getAttribute("data-effect") || "slide";
              var showBullets = slider.getAttribute("data-bullets") !== "0";
              var showArrows = slider.getAttribute("data-arrows") !== "0";
              var autoplay = slider.getAttribute("data-autoplay") === "1";
              var loop = slider.getAttribute("data-loop") !== "0";
              var perView = parseFloat(slider.getAttribute("data-per-view") || "1");
              var speedLabel = slider.getAttribute("data-speed") || "regular";
              var speed =
                speedLabel === "slow" ? 1200 : speedLabel === "fast" ? 300 : 600;
              var delay = parseInt(slider.getAttribute("data-delay") || "3500", 10);
              var centered = slider.getAttribute("data-centered") === "1";
              var spaceBetween = parseInt(slider.getAttribute("data-space") || "16", 10);
              var pauseOnHover = slider.getAttribute("data-hover") !== "0";
              new window.Swiper(slider, {
                effect: effect,
                loop: loop,
                slidesPerView: perView,
                spaceBetween: spaceBetween,
                centeredSlides: centered,
                speed: speed,
                autoplay: autoplay
                  ? { delay: delay, disableOnInteraction: false, pauseOnMouseEnter: pauseOnHover }
                  : false,
                pagination: showBullets
                  ? { el: slider.querySelector(".swiper-pagination"), clickable: true }
                  : false,
                navigation: showArrows
                  ? {
                      nextEl: slider.querySelector(".swiper-button-next"),
                      prevEl: slider.querySelector(".swiper-button-prev")
                    }
                  : false
              });
            });
          })();
        </script>
        <script>
          (function () {
        function updateCountdown(el) {
          var mode = el.getAttribute("data-mode") || "fixed";
          var endRaw = el.getAttribute("data-end") || "";
          var duration = parseFloat(el.getAttribute("data-duration") || "1");
          var showLabels = el.getAttribute("data-labels") === "1";
          var labelDays = el.getAttribute("data-label-days") || "Days";
          var labelHours = el.getAttribute("data-label-hours") || "Hours";
          var labelMinutes = el.getAttribute("data-label-minutes") || "Minutes";
          var labelSeconds = el.getAttribute("data-label-seconds") || "Seconds";
          var endTime = null;
          if (mode === "evergreen") {
            var stored = el.getAttribute("data-evergreen-end");
            if (stored) {
              endTime = parseInt(stored, 10);
            } else {
              endTime = Date.now() + duration * 60 * 60 * 1000;
              el.setAttribute("data-evergreen-end", String(endTime));
            }
          } else {
            endTime = Date.parse(endRaw);
            if (!endTime || isNaN(endTime)) {
              var match = String(endRaw).match(/([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})/);
              if (match) {
                endTime = new Date(
                  Number(match[1]),
                  Number(match[2]) - 1,
                  Number(match[3]),
                  Number(match[4]),
                  Number(match[5])
                ).getTime();
              }
            }
          }
          if (!endTime || isNaN(endTime)) return;
          var diff = endTime - Date.now();
          if (diff < 0) diff = 0;
          var target = el.querySelector(".bainners-countdown-value");
          if (!target) return;
          var days = Math.floor(diff / 86400000);
          var hours = Math.floor((diff % 86400000) / 3600000);
          var minutes = Math.floor((diff % 3600000) / 60000);
          var seconds = Math.floor((diff % 60000) / 1000);
          var pad = function (num) { return String(num).padStart(2, "0"); };
          var isSegments = el.classList.contains("bainners-countdown--segments");
          if (isSegments) {
            var segments = [];
            if (days > 0) {
              segments.push(
                '<span class="bainners-countdown-segment"><span class="bainners-countdown-number">' +
                  days +
                  '</span>' +
                  (showLabels ? '<span class="bainners-countdown-label">' + labelDays + '</span>' : "") +
                  "</span>"
              );
            }
            segments.push(
              '<span class="bainners-countdown-segment"><span class="bainners-countdown-number">' +
                pad(hours) +
                '</span>' +
                (showLabels ? '<span class="bainners-countdown-label">' + labelHours + '</span>' : "") +
                "</span>"
            );
            segments.push(
              '<span class="bainners-countdown-segment"><span class="bainners-countdown-number">' +
                pad(minutes) +
                '</span>' +
                (showLabels ? '<span class="bainners-countdown-label">' + labelMinutes + '</span>' : "") +
                "</span>"
            );
            segments.push(
              '<span class="bainners-countdown-segment"><span class="bainners-countdown-number">' +
                pad(seconds) +
                '</span>' +
                (showLabels ? '<span class="bainners-countdown-label">' + labelSeconds + '</span>' : "") +
                "</span>"
            );
            target.innerHTML = segments.join('<span class="bainners-countdown-separator">:</span>');
            return;
          }
          var value = "";
          if (showLabels) {
            value =
              (days > 0 ? days + " " + labelDays + " " : "") +
              pad(hours) + " " + labelHours + " " +
              pad(minutes) + " " + labelMinutes + " " +
              pad(seconds) + " " + labelSeconds;
          } else {
            value = (days > 0 ? String(days).padStart(2, "0") + ":" : "") + pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
          }
          target.textContent = value;
        }
            function tick() {
              document.querySelectorAll(".bainners-countdown").forEach(updateCountdown);
            }
            tick();
            setInterval(tick, 1000);
          document.querySelectorAll(".bainners-announcement-close").forEach(function (button) {
            button.addEventListener("click", function () {
              var banner = button.closest(".bainners-banner");
              if (banner) banner.style.display = "none";
            });
          });

          document.querySelectorAll(".bainners-announcement-coupon").forEach(function (button) {
            button.addEventListener("click", function () {
              var code = button.getAttribute("data-coupon") || "";
              if (!code) return;
              var root = button.closest(".bainners-banner");
              var toast = root ? root.querySelector(".bainners-toast") : null;
              var toastMessage =
                (root && root.getAttribute("data-coupon-toast")) || "Coupon copied";
              function showToast() {
                if (!toast) return;
                toast.textContent = toastMessage;
                toast.classList.add("bainners-toast--visible");
                clearTimeout(toast._bainnersToastTimer);
                toast._bainnersToastTimer = setTimeout(function () {
                  toast.classList.remove("bainners-toast--visible");
                }, 2000);
              }
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code).then(showToast).catch(showToast);
              } else {
                try {
                  var textarea = document.createElement("textarea");
                  textarea.value = code;
                  textarea.style.position = "fixed";
                  textarea.style.opacity = "0";
                  document.body.appendChild(textarea);
                  textarea.select();
                  document.execCommand("copy");
                  document.body.removeChild(textarea);
                  showToast();
                } catch (e) {
                  showToast();
                }
              }
            });
          });
          })();
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
