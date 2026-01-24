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

  const items = banner.bannerItems;
  const selectedItem = items.find((item) => item.isSelected) || items[0] || null;

  if (!selectedItem) {
    return new Response("No images yet.", { status: 200 });
  }

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

    return `
      <div class="bainners-banner-item">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />
        ${
          showOverlay || showText || showCta
            ? `<div class="bainners-banner-overlay">
                ${showOverlay ? `<div class="bainners-banner-shade"></div>` : ""}
                ${
                  showText
                    ? `<div class="bainners-banner-text">
                      ${textTitle ? `<h3>${escapeHtml(textTitle)}</h3>` : ""}
                      ${textDescription ? `<p>${escapeHtml(textDescription)}</p>` : ""}
                    </div>`
                    : ""
                }
                ${
                  showCta
                    ? `<a class="bainners-banner-cta" href="${escapeHtml(ctaUrl)}">${escapeHtml(
                        ctaText || "Learn more"
                      )}</a>`
                    : ""
                }
              </div>`
            : ""
        }
      </div>
    `;
  };

  const content =
    banner.layout === "slider"
      ? `<div class="bainners-swiper swiper" data-effect="${escapeHtml(
          banner.sliderType || "slide"
        )}">
          <div class="swiper-wrapper">
            ${items.map((item) => `<div class="swiper-slide">${renderItem(item)}</div>`).join("")}
          </div>
          <div class="swiper-pagination"></div>
        </div>`
      : banner.layout === "promo_strip"
      ? `<div class="bainners-promo-strip">${renderItem(selectedItem)}</div>`
      : banner.layout === "product_highlight"
      ? `<div class="bainners-product-highlight">
          <div class="bainners-product-image">${renderItem(selectedItem)}</div>
          <div class="bainners-product-copy">
            <h3>${escapeHtml(banner.title || "")}</h3>
            ${
              banner.descriptionInternal
                ? `<p>${escapeHtml(banner.descriptionInternal)}</p>`
                : ""
            }
          </div>
        </div>`
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
          .bainners-banner { position: relative; width: 100%; }
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
            color: #ffffff;
          }
          .bainners-banner-shade {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.35);
          }
          .bainners-banner-overlay > * { position: relative; z-index: 1; }
          .bainners-banner-text h3 { margin: 0 0 4px 0; font-size: 28px; }
          .bainners-banner-text p { margin: 0; font-size: 16px; }
          .bainners-banner-cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: fit-content;
            padding: 10px 18px;
            border-radius: 999px;
            background: #ffffff;
            color: #000000;
            text-decoration: none;
            font-weight: 600;
          }
          .bainners-promo-strip .bainners-banner-item img {
            height: 160px;
            object-fit: cover;
          }
          .bainners-product-highlight {
            display: grid;
            grid-template-columns: minmax(240px, 40%) 1fr;
            gap: 24px;
            align-items: center;
          }
          .bainners-product-copy h3 { margin: 0 0 8px 0; font-size: 24px; }
          .bainners-product-copy p { margin: 0; font-size: 16px; color: #4a4d50; }
        </style>
      </head>
      <body>
        <div class="bainners-banner bainners-banner--${escapeHtml(banner.layout)}">
          ${content}
        </div>
        <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
        <script>
          (function () {
            if (typeof window.Swiper === "undefined") return;
            document.querySelectorAll(".bainners-swiper").forEach(function (slider) {
              if (slider.__bainnersInit) return;
              slider.__bainnersInit = true;
              var effect = slider.getAttribute("data-effect") || "slide";
              new window.Swiper(slider, {
                effect: effect,
                loop: true,
                pagination: { el: slider.querySelector(".swiper-pagination"), clickable: true }
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
