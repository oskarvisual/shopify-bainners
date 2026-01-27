import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useLocation } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Button, List, InlineStack, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam || "";
  const themeEditorUrl = shop
    ? `https://${shop}/admin/themes/current/editor?template=index`
    : "";

  return json({
    themeEditorUrl,
    videoUrl: process.env.SETUP_GUIDE_VIDEO_URL || "",
    contactUrl: process.env.SETUP_GUIDE_CONTACT_URL || "",
    docsUrl: process.env.SETUP_GUIDE_DOCS_URL || "",
  });
}

export default function SetupGuide() {
  const location = useLocation();
  const { themeEditorUrl, videoUrl, contactUrl, docsUrl } = useLoaderData<typeof loader>();
  const search = location.search || "";
  const backToDashboard = `/app${search}`;
  const settingsUrl = `/app/settings${search}`;
  return (
    <Page title="Setup guide">
      <Layout>
        <Layout.Section>
          <Banner title="Welcome to bAInners" className="bainners-setup-banner">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                This page walks you through everything you need to publish banners on your
                storefront.
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  📹 Video Tutorial
                </Text>
                <div className="bainners-section-divider" />
                <Text as="p" variant="bodySm" tone="subdued">
                  Watch a quick walkthrough of the full setup process.
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button
                  disabled={!videoUrl}
                  onClick={() => {
                    if (videoUrl) {
                      window.open(videoUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  Open video tutorial
                </Button>
                <Button url={backToDashboard} variant="tertiary">
                  Back to dashboard
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Step 1
              </Text>
              <div className="bainners-section-divider" />
              <Text as="p" variant="bodyMd">
                Create your banner and choose the right layout.
              </Text>
              <List>
                <List.Item>
                  <strong>Announcement:</strong> Perfect for promos, coupon codes, shipping
                  messages, and time-sensitive alerts.
                </List.Item>
                <List.Item>
                  <strong>Hero:</strong> One large image or video with overlay text and CTA.
                </List.Item>
                <List.Item>
                  <strong>Slider:</strong> Multiple items with transitions and optional
                  navigation.
                </List.Item>
              </List>
              <Text as="p" variant="bodySm" tone="subdued">
                Tip: Use Announcement when you want a simple bar with promo text or a coupon.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Step 2
              </Text>
              <div className="bainners-section-divider" />
              <Text as="p" variant="bodyMd">
                Configure the banner content.
              </Text>
              <List>
                <List.Item>
                  <strong>Announcement:</strong> Enter the main text, optional CTA, and optional
                  countdown. Use Inline or Stacked layout and advanced styles for color, motion,
                  and separators.
                </List.Item>
                <List.Item>
                  <strong>Hero/Slider:</strong> Add items (image, upload, gallery, AI, or video).
                  Each item has its own text, CTA, countdown, overlay, and scheduling settings.
                </List.Item>
                <List.Item>
                  Use the <strong>Edit info</strong> modal to reorder content blocks, customize
                  colors, and set click behavior.
                </List.Item>
              </List>
              <Text as="p" variant="bodySm" tone="subdued">
                Tip: If you want a clickable image, set CTA mode to “Entire item”.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Step 3
              </Text>
              <div className="bainners-section-divider" />
              <Text as="p" variant="bodyMd">
                Publish your banner.
              </Text>
              <List>
                <List.Item>Switch status from Draft to Published.</List.Item>
                <List.Item>
                  You can schedule the entire banner or individual items with start/end dates.
                </List.Item>
              </List>
              <Text as="p" variant="bodySm" tone="subdued">
                Tip: Scheduled banners/items won’t show outside their date range.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Step 4
              </Text>
              <div className="bainners-section-divider" />
              <Text as="p" variant="bodyMd">
                Embed your banner on the storefront.
              </Text>
              <List>
                <List.Item>
                  <strong>Option 1 (recommended):</strong> Add the “bAInners Banner” block in the
                  Theme Editor and select a published banner.
                </List.Item>
                <List.Item>
                  <strong>Option 2:</strong> Use the Embed HTML snippet from the banner editor to
                  place the banner anywhere in your theme.
                </List.Item>
              </List>
              <InlineStack gap="200">
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
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Additional Resources
              </Text>
              <div className="bainners-section-divider" />
              <List>
                <List.Item>
                  Configure default styles, timezone, and translations in Settings.
                </List.Item>
                <List.Item>
                  If banners don’t appear, use “Sync metaobjects” in Settings.
                </List.Item>
                <List.Item>
                  <strong>Analytics:</strong> Track views, clicks, and CTR per banner and per
                  item. Filter by date range for performance insights.
                </List.Item>
                <List.Item>
                  <strong>Gallery:</strong> App Gallery stores AI-generated and uploaded images.
                  Shopify Gallery shows files from your Shopify Admin.
                </List.Item>
              </List>
              <InlineStack gap="200">
                <Button url={settingsUrl}>Open Settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Need help?
              </Text>
              <div className="bainners-section-divider" />
              <Text as="p" variant="bodySm" tone="subdued">
                Reach out any time or browse our documentation.
              </Text>
              <InlineStack gap="200">
                <Button
                  disabled={!contactUrl}
                  onClick={() => {
                    if (contactUrl) {
                      window.open(contactUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  Contact support
                </Button>
                <Button
                  disabled={!docsUrl}
                  onClick={() => {
                    if (docsUrl) {
                      window.open(docsUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  View documentation
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
