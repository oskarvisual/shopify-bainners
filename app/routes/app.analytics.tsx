import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useLocation, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Card,
  Icon,
  InlineStack,
  Layout,
  Modal,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { getPlanLimits, planHasFeature, PlanFeature } from "../lib/plans";
import { AnalyticsLineChart } from "../components/AnalyticsLineChart";
import { ImageIcon, ViewIcon } from "@shopify/polaris-icons";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;
  const rangeParam = url.searchParams.get("range") || "30";
  let rangeDays = Math.max(7, Math.min(90, Number(rangeParam) || 30));

  if (!shop) {
    return json({
      rangeDays,
      totals: { views: 0, clicks: 0, ctr: 0 },
      chart: [],
      banners: [],
      items: [],
      plan: "free",
    });
  }

  const shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });
  if (!shopRecord) {
    return json({
      rangeDays,
      totals: { views: 0, clicks: 0, ctr: 0 },
      chart: [],
      banners: [],
      items: [],
      plan: "free",
    });
  }

  const planContext = await getSubscriptionPlanContext({
    shop,
    sessionPlan: session?.subscriptionPlan,
  });
  const limits = getPlanLimits(planContext.plan);
  rangeDays = Math.max(7, Math.min(limits.analyticsRange, rangeDays));
  const showAdvanced = planHasFeature(planContext.plan, PlanFeature.ADVANCED_ANALYTICS);
  const showCtr = planHasFeature(planContext.plan, PlanFeature.ANALYTICS_CTR);

  const today = startOfDay(new Date());
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));

  const dailyTotals = await db.bannerAnalytic.groupBy({
    by: ["date"],
    where: { shopId: shopRecord.id, date: { gte: startDate } },
    _sum: { views: true, clicks: true },
    orderBy: { date: "asc" },
  });

  const chartData: Array<{ date: string; views: number; clicks: number }> = [];
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
    chartData.push({ date: key, views: values.views, clicks: values.clicks });
  }

  const totals = chartData.reduce(
    (acc, row) => {
      acc.views += row.views;
      acc.clicks += row.clicks;
      return acc;
    },
    { views: 0, clicks: 0 }
  );

  const bannerAgg = await db.bannerAnalytic.groupBy({
    by: ["bannerId"],
    where: { shopId: shopRecord.id, date: { gte: startDate } },
    _sum: { views: true, clicks: true },
  });
  const bannerIds = bannerAgg.map((row) => row.bannerId);
  const bannerRecords = await db.banner.findMany({
    where: { id: { in: bannerIds } },
    select: { id: true, title: true, status: true, layout: true },
  });
  const bannerLookup = new Map(bannerRecords.map((banner) => [banner.id, banner]));
  const bannerRows = bannerAgg
    .map((row) => {
      const banner = bannerLookup.get(row.bannerId);
      const views = row._sum.views || 0;
      const clicks = row._sum.clicks || 0;
      const ctr = views > 0 ? (clicks / views) * 100 : 0;
      return {
        id: row.bannerId,
        title: banner?.title || "Untitled",
        status: banner?.status || "draft",
        layout: banner?.layout || "hero",
        views,
        clicks,
        ctr,
      };
    })
    .sort((a, b) => b.views - a.views);

  const itemAgg = await db.bannerItemAnalytic.groupBy({
    by: ["bannerItemId"],
    where: { shopId: shopRecord.id, date: { gte: startDate } },
    _sum: { views: true, clicks: true },
  });
  const itemIds = itemAgg.map((row) => row.bannerItemId);
  const itemRecords = await db.bannerItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      bannerId: true,
      externalImageUrl: true,
      tags: true,
      image: { select: { storageUrl: true } },
    },
  });
  const bannerIdsForItems = Array.from(new Set(itemRecords.map((item) => item.bannerId)));
  const itemBannerRecords = await db.banner.findMany({
    where: { id: { in: bannerIdsForItems } },
    select: { id: true, title: true },
  });
  const bannerTitleLookup = new Map(itemBannerRecords.map((banner) => [banner.id, banner.title]));
  const itemLookup = new Map(itemRecords.map((item) => [item.id, item]));
  const itemRows = itemAgg
    .map((row) => {
      const item = itemLookup.get(row.bannerItemId);
      const itemTags = (item?.tags as Record<string, any> | null) || {};
      const mediaType = itemTags.mediaType === "video" ? "video" : "image";
      const thumbnailUrl =
        mediaType === "video"
          ? itemTags.videoThumbnailUrl || ""
          : item?.image?.storageUrl || item?.externalImageUrl || "";
      const views = row._sum.views || 0;
      const clicks = row._sum.clicks || 0;
      const ctr = views > 0 ? (clicks / views) * 100 : 0;
      return {
        id: row.bannerItemId,
        bannerId: item?.bannerId || "",
        bannerTitle: bannerTitleLookup.get(item?.bannerId || "") || "Untitled",
        mediaType,
        thumbnailUrl,
        videoUrl: itemTags.videoUrl || "",
        videoProvider: itemTags.videoProvider || "",
        videoId: itemTags.videoId || "",
        views,
        clicks,
        ctr,
      };
    })
    .sort((a, b) => b.views - a.views);

  return json({
    rangeDays,
    plan: planContext.plan,
    totals: {
      views: totals.views,
      clicks: totals.clicks,
      ctr: showCtr ? (totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0) : 0,
    },
    chart: showAdvanced ? chartData : [],
    banners: showAdvanced ? bannerRows : [],
    items: showAdvanced ? itemRows : [],
  });
}

export default function AnalyticsPage() {
  const { rangeDays, totals, chart, banners, items, plan } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const editSearch = location.search || "";
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);
  const rangeOptions =
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
  const showAdvanced = plan !== "free";

  const getVideoEmbedUrl = (item: any) => {
    if (item.videoProvider === "youtube" && item.videoId) {
      return `https://www.youtube.com/embed/${item.videoId}`;
    }
    if (item.videoProvider === "vimeo" && item.videoId) {
      return `https://player.vimeo.com/video/${item.videoId}`;
    }
    return item.videoUrl || "";
  };

  return (
    <Page title="Analytics">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Overview
                </Text>
                <Select
                  label="Date range"
                  labelHidden
                  options={rangeOptions}
                  value={String(rangeDays)}
                  onChange={(value) => {
                    searchParams.set("range", value);
                    setSearchParams(searchParams);
                  }}
                />
              </InlineStack>
              <InlineStack gap="300">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Views
                    </Text>
                    <Text as="p" variant="headingMd">
                      {totals.views}
                    </Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Clicks
                    </Text>
                    <Text as="p" variant="headingMd">
                      {totals.clicks}
                    </Text>
                  </BlockStack>
                </Card>
                {showAdvanced ? (
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        CTR
                      </Text>
                      <Text as="p" variant="headingMd">
                        {totals.ctr.toFixed(2)}%
                      </Text>
                    </BlockStack>
                  </Card>
                ) : null}
              </InlineStack>
              {showAdvanced ? (
                <BlockStack gap="200">
                  <AnalyticsLineChart data={chart} />
                </BlockStack>
              ) : (
                <Banner tone="warning" title="Upgrade required">
                  <Text as="p">
                    Upgrade to unlock charts, CTR, and per-banner analytics.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {showAdvanced ? (
          <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                By banner
              </Text>
              <div className="bainners-analytics-table">
                <table>
                  <thead>
                    <tr>
                      <th className="bainners-analytics-title">Banner</th>
                      <th>Status</th>
                      <th>Layout</th>
                      <th>Views</th>
                      <th>Clicks</th>
                      <th>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {banners.map((row) => (
                      <tr key={row.id}>
                        <td className="bainners-analytics-title">
                          <Link className="bainners-analytics-link" to={`/app/banners/${row.id}/edit${editSearch}`}>
                            {row.title}
                          </Link>
                        </td>
                        <td>
                          <Badge tone={row.status === "active" ? "success" : "info"}>
                            {row.status}
                          </Badge>
                        </td>
                        <td>{row.layout}</td>
                        <td>{row.views}</td>
                        <td>{row.clicks}</td>
                        <td>{row.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
          </Layout.Section>
        ) : null}

        {showAdvanced ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  By item
                </Text>
                <div className="bainners-analytics-table">
                  <table>
                    <thead>
                      <tr>
                        <th className="bainners-analytics-item-cell">Item</th>
                        <th className="bainners-analytics-title">Banner</th>
                        <th>Views</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row: any) => (
                        <tr key={row.id}>
                          <td className="bainners-analytics-item-cell">
                            {row.mediaType === "video" ? (
                              <button
                                type="button"
                                className="bainners-video-thumb"
                                onClick={() =>
                                  setPreviewVideo({
                                    url: getVideoEmbedUrl(row),
                                    title: row.bannerTitle,
                                  })
                                }
                              >
                                {row.thumbnailUrl ? (
                                  <img src={row.thumbnailUrl} alt="Video thumbnail" />
                                ) : (
                                  <Icon source={ImageIcon} />
                                )}
                                <span className="bainners-image-overlay">
                                  <Icon source={ViewIcon} tone="base" />
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="bainners-image-thumb"
                                onClick={() =>
                                  row.thumbnailUrl
                                    ? setPreviewImage({
                                        url: row.thumbnailUrl,
                                        alt: row.bannerTitle,
                                      })
                                    : null
                                }
                                disabled={!row.thumbnailUrl}
                              >
                                {row.thumbnailUrl ? (
                                  <img src={row.thumbnailUrl} alt={row.bannerTitle} />
                                ) : (
                                  <Icon source={ImageIcon} />
                                )}
                                <span className="bainners-image-overlay">
                                  <Icon source={ViewIcon} tone="base" />
                                </span>
                              </button>
                            )}
                          </td>
                          <td className="bainners-analytics-title">
                            <Link className="bainners-analytics-link" to={`/app/banners/${row.bannerId}/edit${editSearch}`}>
                              {row.bannerTitle}
                            </Link>
                          </td>
                          <td>{row.views}</td>
                          <td>{row.clicks}</td>
                          <td>{row.ctr.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}
      </Layout>
      <Modal
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title="Image preview"
        size="large"
      >
        <Modal.Section>
          {previewImage ? (
            <div className="bainners-modal-image">
              <img src={previewImage.url} alt={previewImage.alt} />
            </div>
          ) : null}
        </Modal.Section>
      </Modal>
      <Modal
        open={Boolean(previewVideo)}
        onClose={() => setPreviewVideo(null)}
        title="Video preview"
        size="large"
      >
        <Modal.Section>
          {previewVideo ? (
            <div className="bainners-preview-frame">
              <iframe
                title={previewVideo.title}
                src={previewVideo.url}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
