import { json, type ActionFunctionArgs } from "@remix-run/node";
import { db } from "../db.server";

function detectDevice(userAgent: string | null) {
  if (!userAgent) return "unknown";
  if (/mobile|android|iphone|ipod|ipad/i.test(userAgent)) return "mobile";
  return "desktop";
}

export async function action({ request }: ActionFunctionArgs) {
  let payload: Record<string, any> = {};
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }
  } catch {
    payload = {};
  }

  const bannerId = (payload.banner_id || payload.bannerId || "").toString();
  const bannerItemId = payload.banner_item_id || payload.bannerItemId || null;
  const eventType = (payload.event_type || payload.eventType || "").toString();

  if (!bannerId || !eventType) {
    return json({ success: false, error: "Missing banner_id or event_type" }, { status: 400 });
  }

  const banner = await db.banner.findFirst({
    where: { id: bannerId },
    select: { id: true, shopId: true },
  });
  if (!banner) {
    return json({ success: true });
  }

  let itemId: string | null = null;
  if (bannerItemId) {
    const item = await db.bannerItem.findFirst({
      where: { id: bannerItemId.toString(), bannerId: banner.id },
      select: { id: true },
    });
    itemId = item?.id || null;
  }

  const now = new Date();
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);

  const isView = eventType === "view";
  const isClick = eventType === "click";

  await db.bannerAnalytic.upsert({
    where: {
      bannerId_date: {
        bannerId: banner.id,
        date,
      },
    },
    update: {
      views: isView ? { increment: 1 } : undefined,
      clicks: isClick ? { increment: 1 } : undefined,
    },
    create: {
      shopId: banner.shopId,
      bannerId: banner.id,
      date,
      views: isView ? 1 : 0,
      clicks: isClick ? 1 : 0,
      ctr: 0,
    },
  });

  if (itemId) {
    await db.bannerItemAnalytic.upsert({
      where: {
        bannerItemId_date: {
          bannerItemId: itemId,
          date,
        },
      },
      update: {
        views: isView ? { increment: 1 } : undefined,
        clicks: isClick ? { increment: 1 } : undefined,
      },
      create: {
        shopId: banner.shopId,
        bannerItemId: itemId,
        date,
        views: isView ? 1 : 0,
        clicks: isClick ? 1 : 0,
        ctr: 0,
      },
    });
  }

  const bannerStats = await db.bannerAnalytic.findUnique({
    where: { bannerId_date: { bannerId: banner.id, date } },
    select: { views: true, clicks: true },
  });
  if (bannerStats) {
    const ctr = bannerStats.views > 0 ? (bannerStats.clicks / bannerStats.views) * 100 : 0;
    await db.bannerAnalytic.update({
      where: { bannerId_date: { bannerId: banner.id, date } },
      data: { ctr },
    });
  }

  if (itemId) {
    const itemStats = await db.bannerItemAnalytic.findUnique({
      where: { bannerItemId_date: { bannerItemId: itemId, date } },
      select: { views: true, clicks: true },
    });
    if (itemStats) {
      const ctr = itemStats.views > 0 ? (itemStats.clicks / itemStats.views) * 100 : 0;
      await db.bannerItemAnalytic.update({
        where: { bannerItemId_date: { bannerItemId: itemId, date } },
        data: { ctr },
      });
    }
  }

  await db.bannerEvent.create({
    data: {
      shopId: banner.shopId,
      bannerId: banner.id,
      bannerItemId: itemId,
      eventType,
      pageUrl: payload.page_url?.toString() || payload.pageUrl?.toString() || "",
      pagePath: payload.page_path?.toString() || payload.pagePath?.toString() || "",
      referrer: payload.referrer?.toString() || "",
      userAgent: request.headers.get("user-agent") || "",
      device: payload.device?.toString() || detectDevice(request.headers.get("user-agent")),
    },
  });

  return json({ success: true });
}
