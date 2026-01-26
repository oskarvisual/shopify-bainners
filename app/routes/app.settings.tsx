import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { BlockStack, Button, Card, Checkbox, InlineStack, Layout, Page, Select, Text, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

const SIZE_OPTIONS = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
  { label: "Extra large", value: "xl" },
];

const ANIMATION_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Shake", value: "shake" },
  { label: "Pulse", value: "pulse" },
  { label: "Bounce", value: "bounce" },
];

const COUNTDOWN_STYLE_OPTIONS = [
  { label: "Solid", value: "solid" },
  { label: "Outline", value: "outline" },
  { label: "Pill", value: "pill" },
];

const ARROW_STYLE_OPTIONS = [
  { label: "Chevron", value: "chevron" },
  { label: "Arrow", value: "arrow" },
  { label: "Minimal", value: "minimal" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ shop: null, defaults: {} });
  }

  let shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    shopRecord = await db.shop.create({
      data: { shopDomain: shop, plan: "free", storageLimitGB: 1 },
    });
  }

  return json({
    shop,
    defaults: {
      bannerBackgroundColor: shopRecord.defaultBannerBackgroundColor || "",
      titleFontSize: shopRecord.defaultTitleFontSize || "lg",
      descriptionFontSize: shopRecord.defaultDescriptionFontSize || "md",
      titleColor: shopRecord.defaultTitleColor || "",
      descriptionColor: shopRecord.defaultDescriptionColor || "",
      ctaTextColor: shopRecord.defaultCtaTextColor || "",
      ctaBackgroundColor: shopRecord.defaultCtaBackgroundColor || "",
      ctaBorderColor: shopRecord.defaultCtaBorderColor || "",
      ctaBordered: shopRecord.defaultCtaBordered ?? false,
      ctaRounded: shopRecord.defaultCtaRounded ?? true,
      ctaShadow: shopRecord.defaultCtaShadow ?? false,
      countdownTextColor: shopRecord.defaultCountdownTextColor || "",
      countdownBackgroundColor: shopRecord.defaultCountdownBackgroundColor || "",
      countdownStyle: shopRecord.defaultCountdownStyle || "solid",
      sliderArrowStyle: shopRecord.defaultSliderArrowStyle || "chevron",
      sliderArrowColor: shopRecord.defaultSliderArrowColor || "",
      sliderBulletColor: shopRecord.defaultSliderBulletColor || "",
      announcementMarquee: shopRecord.defaultAnnouncementMarquee ?? false,
      announcementAnimation: shopRecord.defaultAnnouncementAnimation || "none",
      announcementCloseColor: shopRecord.defaultAnnouncementCloseColor || "",
      announcementClosable: shopRecord.defaultAnnouncementClosable ?? false,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ success: false, error: "Missing shop" }, { status: 400 });
  }

  const formData = await request.formData();

  await db.shop.upsert({
    where: { shopDomain: shop },
    update: {
      defaultBannerBackgroundColor: formData.get("bannerBackgroundColor") as string,
      defaultTitleFontSize: formData.get("titleFontSize") as string,
      defaultDescriptionFontSize: formData.get("descriptionFontSize") as string,
      defaultTitleColor: formData.get("titleColor") as string,
      defaultDescriptionColor: formData.get("descriptionColor") as string,
      defaultCtaTextColor: formData.get("ctaTextColor") as string,
      defaultCtaBackgroundColor: formData.get("ctaBackgroundColor") as string,
      defaultCtaBorderColor: formData.get("ctaBorderColor") as string,
      defaultCtaBordered: formData.get("ctaBordered") === "true",
      defaultCtaRounded: formData.get("ctaRounded") !== "false",
      defaultCtaShadow: formData.get("ctaShadow") === "true",
      defaultCountdownTextColor: formData.get("countdownTextColor") as string,
      defaultCountdownBackgroundColor: formData.get("countdownBackgroundColor") as string,
      defaultCountdownStyle: formData.get("countdownStyle") as string,
      defaultSliderArrowStyle: formData.get("sliderArrowStyle") as string,
      defaultSliderArrowColor: formData.get("sliderArrowColor") as string,
      defaultSliderBulletColor: formData.get("sliderBulletColor") as string,
      defaultAnnouncementMarquee: formData.get("announcementMarquee") === "true",
      defaultAnnouncementAnimation: formData.get("announcementAnimation") as string,
      defaultAnnouncementCloseColor: formData.get("announcementCloseColor") as string,
      defaultAnnouncementClosable: formData.get("announcementClosable") === "true",
    },
    create: {
      shopDomain: shop,
      plan: "free",
      storageLimitGB: 1,
      defaultBannerBackgroundColor: formData.get("bannerBackgroundColor") as string,
      defaultTitleFontSize: formData.get("titleFontSize") as string,
      defaultDescriptionFontSize: formData.get("descriptionFontSize") as string,
      defaultTitleColor: formData.get("titleColor") as string,
      defaultDescriptionColor: formData.get("descriptionColor") as string,
      defaultCtaTextColor: formData.get("ctaTextColor") as string,
      defaultCtaBackgroundColor: formData.get("ctaBackgroundColor") as string,
      defaultCtaBorderColor: formData.get("ctaBorderColor") as string,
      defaultCtaBordered: formData.get("ctaBordered") === "true",
      defaultCtaRounded: formData.get("ctaRounded") !== "false",
      defaultCtaShadow: formData.get("ctaShadow") === "true",
      defaultCountdownTextColor: formData.get("countdownTextColor") as string,
      defaultCountdownBackgroundColor: formData.get("countdownBackgroundColor") as string,
      defaultCountdownStyle: formData.get("countdownStyle") as string,
      defaultSliderArrowStyle: formData.get("sliderArrowStyle") as string,
      defaultSliderArrowColor: formData.get("sliderArrowColor") as string,
      defaultSliderBulletColor: formData.get("sliderBulletColor") as string,
      defaultAnnouncementMarquee: formData.get("announcementMarquee") === "true",
      defaultAnnouncementAnimation: formData.get("announcementAnimation") as string,
      defaultAnnouncementCloseColor: formData.get("announcementCloseColor") as string,
      defaultAnnouncementClosable: formData.get("announcementClosable") === "true",
    },
  });

  return json({ success: true });
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="bainners-color-field">
      <Text as="p" variant="bodySm">
        {label}
      </Text>
      <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.currentTarget.value)} />
    </div>
  );
}

export default function SettingsPage() {
  const { defaults } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [state, setState] = useState(defaults);

  useEffect(() => {
    setState(defaults);
  }, [defaults]);

  const save = () => {
    const formData = new FormData();
    Object.entries(state).forEach(([key, value]) => {
      formData.set(key, String(value ?? ""));
    });
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Default banner styles
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  These defaults apply to newly created banners.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Banner
                </Text>
                <ColorField
                  label="Background color"
                  value={state.bannerBackgroundColor}
                  onChange={(value) => setState((prev) => ({ ...prev, bannerBackgroundColor: value }))}
                />
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Typography
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Title size"
                    options={SIZE_OPTIONS}
                    value={state.titleFontSize}
                    onChange={(value) => setState((prev) => ({ ...prev, titleFontSize: value }))}
                  />
                  <ColorField
                    label="Title color"
                    value={state.titleColor}
                    onChange={(value) => setState((prev) => ({ ...prev, titleColor: value }))}
                  />
                </InlineStack>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Description size"
                    options={SIZE_OPTIONS}
                    value={state.descriptionFontSize}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, descriptionFontSize: value }))
                    }
                  />
                  <ColorField
                    label="Description color"
                    value={state.descriptionColor}
                    onChange={(value) => setState((prev) => ({ ...prev, descriptionColor: value }))}
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  CTA defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <ColorField
                    label="CTA text color"
                    value={state.ctaTextColor}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaTextColor: value }))}
                  />
                  <ColorField
                    label="CTA background"
                    value={state.ctaBackgroundColor}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaBackgroundColor: value }))}
                  />
                  <ColorField
                    label="CTA border"
                    value={state.ctaBorderColor}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaBorderColor: value }))}
                  />
                </InlineStack>
                <InlineStack gap="300" align="start">
                  <Checkbox
                    label="Bordered"
                    checked={state.ctaBordered}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaBordered: value }))}
                  />
                  <Checkbox
                    label="Rounded"
                    checked={state.ctaRounded}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaRounded: value }))}
                  />
                  <Checkbox
                    label="Shadow"
                    checked={state.ctaShadow}
                    onChange={(value) => setState((prev) => ({ ...prev, ctaShadow: value }))}
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Countdown defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Countdown style"
                    options={COUNTDOWN_STYLE_OPTIONS}
                    value={state.countdownStyle}
                    onChange={(value) => setState((prev) => ({ ...prev, countdownStyle: value }))}
                  />
                  <ColorField
                    label="Countdown text"
                    value={state.countdownTextColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, countdownTextColor: value }))
                    }
                  />
                  <ColorField
                    label="Countdown background"
                    value={state.countdownBackgroundColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, countdownBackgroundColor: value }))
                    }
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Slider defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Arrow style"
                    options={ARROW_STYLE_OPTIONS}
                    value={state.sliderArrowStyle}
                    onChange={(value) => setState((prev) => ({ ...prev, sliderArrowStyle: value }))}
                  />
                  <ColorField
                    label="Arrow color"
                    value={state.sliderArrowColor}
                    onChange={(value) => setState((prev) => ({ ...prev, sliderArrowColor: value }))}
                  />
                  <ColorField
                    label="Bullet color"
                    value={state.sliderBulletColor}
                    onChange={(value) => setState((prev) => ({ ...prev, sliderBulletColor: value }))}
                  />
                </InlineStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Announcement defaults
                </Text>
                <InlineStack gap="300" align="start">
                  <Checkbox
                    label="Closable"
                    checked={state.announcementClosable}
                    onChange={(value) => setState((prev) => ({ ...prev, announcementClosable: value }))}
                  />
                  <Checkbox
                    label="Marquee"
                    checked={state.announcementMarquee}
                    onChange={(value) => setState((prev) => ({ ...prev, announcementMarquee: value }))}
                  />
                  <Select
                    label="Animation"
                    options={ANIMATION_OPTIONS}
                    value={state.announcementAnimation}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementAnimation: value }))
                    }
                  />
                  <ColorField
                    label="Close color"
                    value={state.announcementCloseColor}
                    onChange={(value) =>
                      setState((prev) => ({ ...prev, announcementCloseColor: value }))
                    }
                  />
                </InlineStack>
              </BlockStack>

              <InlineStack align="end">
                <Button onClick={save} variant="primary" loading={fetcher.state !== "idle"}>
                  Save settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
