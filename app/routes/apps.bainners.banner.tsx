import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

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

export async function loader({ request }: LoaderFunctionArgs) {
  const { liquid } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const bannerId = url.searchParams.get("banner_id") || "";
  const shop = url.searchParams.get("shop") || "";

  if (!bannerId || !shop) {
    return liquid(
      "<div class='bainners-banner-empty'>Missing banner ID.</div>",
      { status: 400 }
    );
  }

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    return liquid("<div class='bainners-banner-empty'>Shop not found.</div>", {
      status: 404,
    });
  }

  const banner = await db.banner.findFirst({
    where: { id: bannerId, shopId: shopRecord.id, status: "active" },
    include: {
      bannerItems: {
        orderBy: { displayOrder: "asc" },
        include: { image: true },
      },
    },
  });

  if (!banner) {
    return liquid("<div class='bainners-banner-empty'>Banner not found.</div>", {
      status: 404,
    });
  }

  const items = banner.bannerItems;
  const selectedItem =
    items.find((item) => item.isSelected) || items[0] || null;

  if (!selectedItem && banner.layout !== "announcement") {
    return liquid("<div class='bainners-banner-empty'>No images yet.</div>");
  }

  const titleSize =
    TITLE_SIZE_MAP[banner.titleFontSize || "lg"] || TITLE_SIZE_MAP.lg;
  const descriptionSize =
    DESCRIPTION_SIZE_MAP[banner.descriptionFontSize || "md"] || DESCRIPTION_SIZE_MAP.md;
  const bannerStyleVars = [
    `--bainners-title-size:${titleSize}`,
    `--bainners-desc-size:${descriptionSize}`,
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
    banner.sliderArrowColor ? `--bainners-arrow-color:${banner.sliderArrowColor}` : "",
    banner.sliderBulletColor ? `--bainners-bullet-color:${banner.sliderBulletColor}` : "",
  ]
    .filter(Boolean)
    .join(";");

  const ctaClasses = [
    "bainners-banner-cta",
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
    banner.announcementMarquee ? "bainners-announcement--marquee" : "",
    banner.announcementAnimation && banner.announcementAnimation !== "none"
      ? `bainners-announcement--${banner.announcementAnimation}`
      : "",
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
          )}" data-duration="${escapeHtml(countdownDurationHours)}">
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
      ? `<div class="${announcementClasses}">
          <span class="bainners-announcement-text">${escapeHtml(
            banner.announcementText || ""
          )}</span>
          ${
            banner.announcementShowCountdown
              ? `<div class="${countdownClass}" data-mode="${escapeHtml(
                  banner.announcementCountdownMode || "fixed"
                )}" data-end="${escapeHtml(
                  banner.announcementCountdownEndAt
                    ? new Date(banner.announcementCountdownEndAt).toISOString()
                    : ""
                )}" data-tz="${escapeHtml(
                  banner.announcementCountdownTimezone || "UTC"
                )}" data-duration="${escapeHtml(
                  banner.announcementCountdownDurationHours || "1"
                )}">
                  <span class="bainners-countdown-value">00:00:00</span>
                </div>`
              : ""
          }
          ${
            banner.announcementCtaText
              ? `<a class="${ctaClasses}" href="${escapeHtml(
                  banner.announcementCtaUrl || "#"
                )}" target="${escapeHtml(
                  banner.announcementCtaTarget || "_self"
                )}" rel="${
                  banner.announcementCtaTarget === "_blank" ? "noopener noreferrer" : ""
                }">${escapeHtml(banner.announcementCtaText)}</a>`
              : ""
          }
          ${
            banner.announcementClosable
              ? `<button class="bainners-announcement-close" type="button" aria-label="Close banner">×</button>`
              : ""
          }
        </div>`
      : renderItem(selectedItem);

  const html = `
    <div class="bainners-banner bainners-banner--${escapeHtml(
      banner.layout
    )}" data-banner-id="${escapeHtml(banner.id)}" style="${escapeHtml(bannerStyleVars)}">
      ${content}
    </div>
    <style>
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
      .bainners-banner-overlay > * {
        position: relative;
        z-index: 1;
      }
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
        border-radius: 12px;
        background: var(--bainners-cta-bg, #ffffff);
        color: var(--bainners-cta-color, #000000);
        border: 1px solid var(--bainners-cta-border, transparent);
        text-decoration: none;
        font-weight: 600;
      }
      .bainners-cta--bordered { border-color: var(--bainners-cta-border, currentColor); }
      .bainners-cta--rounded { border-radius: 999px; }
      .bainners-cta--shadow { box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
      .bainners-banner-slider {
        width: 100%;
      }
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
      .bainners-announcement { position: relative; display: flex; align-items: center; gap: 16px; padding: 16px 48px 16px 24px; background: var(--bainners-banner-bg, #f6f6f7); color: var(--bainners-title-color, #111111); flex-wrap: wrap; }
      .bainners-announcement-text { font-weight: 600; }
      .bainners-announcement--marquee { overflow: hidden; }
      .bainners-announcement--marquee .bainners-announcement-text { display: inline-block; white-space: nowrap; animation: bainners-marquee 12s linear infinite; }
      .bainners-announcement--shake { animation: bainners-shake 1s ease-in-out 1; }
      .bainners-announcement--pulse { animation: bainners-pulse 2.2s ease-in-out 1; }
      .bainners-announcement--bounce { animation: bainners-bounce 2s ease-in-out 1; }
      .bainners-announcement-close {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
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
      }
      .bainners-countdown--outline { background: transparent; border: 1px solid var(--bainners-countdown-color, #111111); }
      .bainners-countdown--pill { border-radius: 999px; }
      @keyframes bainners-marquee {
        0% { transform: translateX(100%); }
        100% { transform: translateX(-100%); }
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
    <script>
      (function () {
        function updateCountdown(el) {
          var mode = el.getAttribute("data-mode") || "fixed";
          var endRaw = el.getAttribute("data-end") || "";
          var duration = parseFloat(el.getAttribute("data-duration") || "1");
          var endTime = null;
          if (mode === "evergreen") {
            endTime = Date.now() + duration * 60 * 60 * 1000;
          } else {
            endTime = Date.parse(endRaw);
          }
          if (!endTime || isNaN(endTime)) return;
          var diff = endTime - Date.now();
          if (diff < 0) diff = 0;
          var hours = Math.floor(diff / 3600000);
          var minutes = Math.floor((diff % 3600000) / 60000);
          var seconds = Math.floor((diff % 60000) / 1000);
          var value = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
          var target = el.querySelector(".bainners-countdown-value");
          if (target) target.textContent = value;
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

        var bannerEl = document.querySelector(".bainners-banner");
        if (!bannerEl) return;
        var bannerId = bannerEl.getAttribute("data-banner-id");
        if (!bannerId) return;
        var inView = false;
        var sentBannerView = false;
        var sentItemViews = {};

        function sendEvent(type, itemId) {
          try {
            var payload = {
              banner_id: bannerId,
              banner_item_id: itemId || "",
              event_type: type,
              page_url: window.location.href,
              page_path: window.location.pathname,
              referrer: document.referrer || ""
            };
            if (navigator.sendBeacon) {
              var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
              navigator.sendBeacon("/apps/bainners/track", blob);
            } else {
              fetch("/apps/bainners/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                keepalive: true
              });
            }
          } catch (err) {
            // no-op
          }
        }

        function getActiveItemId() {
          var activeSlide = bannerEl.querySelector(".swiper-slide-active .bainners-banner-item");
          var item = activeSlide || bannerEl.querySelector(".bainners-banner-item");
          return item ? item.getAttribute("data-item-id") : "";
        }

        function handleView() {
          if (!sentBannerView) {
            sendEvent("view", "");
            sentBannerView = true;
          }
          var itemId = getActiveItemId();
          if (itemId && !sentItemViews[itemId]) {
            sendEvent("view", itemId);
            sentItemViews[itemId] = true;
          }
        }

        var observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                inView = true;
                handleView();
              } else {
                inView = false;
              }
            });
          },
          { threshold: 0.4 }
        );
        observer.observe(bannerEl);

        var mutationObserver = new MutationObserver(function () {
          if (!inView) return;
          var itemId = getActiveItemId();
          if (itemId && !sentItemViews[itemId]) {
            sendEvent("view", itemId);
            sentItemViews[itemId] = true;
          }
        });
        mutationObserver.observe(bannerEl, { attributes: true, subtree: true, attributeFilter: ["class"] });

        bannerEl.addEventListener("click", function (event) {
          var target = event.target;
          if (!target) return;
          var cta = target.closest(".bainners-banner-cta, .bainners-item-link");
          if (!cta) return;
          var item = target.closest(".bainners-banner-item");
          var itemId = item ? item.getAttribute("data-item-id") : "";
          sendEvent("click", itemId || "");
        });
      })();
    </script>
  `;

  return liquid(html);
}
