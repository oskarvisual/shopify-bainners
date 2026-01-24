import { Page, Layout, Card, BlockStack, Text, Button, List } from "@shopify/polaris";
import { useLocation } from "@remix-run/react";

export default function SetupGuide() {
  const location = useLocation();
  const backToDashboard = `/app${location.search || ""}`;
  return (
    <Page title="Setup guide">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Follow these steps to show your banners on the storefront.
              </Text>
              <List type="number">
                <List.Item>Create and publish a banner in the app.</List.Item>
                <List.Item>
                  Copy the Banner ID from the edit screen (top right).
                </List.Item>
                <List.Item>
                  Open the Theme Editor and add the “Bainners Banner” block.
                </List.Item>
                <List.Item>
                  Paste the Banner ID into the block setting and save the theme.
                </List.Item>
              </List>
              <Text as="p" variant="bodySm">
                The block will render the banner that matches the ID and belongs to this shop.
              </Text>
              <Button url={backToDashboard} variant="primary">
                Back to dashboard
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
