import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Layout,
  List,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";

type LoaderData = {
  environment: string;
  isProduction: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { authenticate } = await import("../shopify.server");
  await authenticate.admin(request);

  const environment = process.env.NODE_ENV || "development";
  const isProduction = environment === "production";

  if (isProduction) {
    throw new Response("Not Found", {
      status: 404,
      statusText: "GDPR testing interface is only available in development mode",
    });
  }

  return json<LoaderData>({ environment, isProduction });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { authenticate } = await import("../shopify.server");
  const {
    gatherCustomerData,
    logGdprRequest,
    updateGdprRequestStatus,
    sendCustomerDataByEmail,
  } = await import("../lib/gdpr.server");
  const { db } = await import("../db.server");

  const { session } = await authenticate.admin(request);

  if (process.env.NODE_ENV === "production") {
    return json(
      {
        success: false,
        message: "GDPR testing is only available in development mode",
      },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const actionType = formData.get("action");
  const customerEmail = String(formData.get("customerEmail") || "");
  const shop = session.shop;

  try {
    if (actionType === "data_request") {
      const gdprRequest = await logGdprRequest({
        shop,
        requestType: "data_request",
        customerEmail,
        customerId: `test-customer-${Date.now()}`,
        payload: { test: true, customerEmail },
      });

      await updateGdprRequestStatus(gdprRequest.id, "processing");

      const customerData = await gatherCustomerData(shop, customerEmail, null);
      await sendCustomerDataByEmail(customerEmail, customerData, shop);

      const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
      const shopId = shopRecord?.id;
      const counts = shopId
        ? {
            banners: await db.banner.count({ where: { shopId } }),
            items: await db.bannerItem.count({ where: { shopId } }),
            images: await db.image.count({ where: { shopId } }),
            analytics: await db.bannerAnalytic.count({ where: { shopId } }),
            events: await db.bannerEvent.count({ where: { shopId } }),
          }
        : null;

      await updateGdprRequestStatus(gdprRequest.id, "completed");

      return json({
        success: true,
        message: `Data request processed for ${customerEmail}`,
        data: {
          requestId: gdprRequest.id,
          counts,
        },
      });
    }

    if (actionType === "customer_redact") {
      const gdprRequest = await logGdprRequest({
        shop,
        requestType: "customer_redact",
        customerEmail,
        customerId: `test-customer-${Date.now()}`,
        payload: { test: true, customerEmail },
      });

      await updateGdprRequestStatus(gdprRequest.id, "completed");

      return json({
        success: true,
        message: `Customer data redaction completed for ${customerEmail}`,
        data: {
          requestId: gdprRequest.id,
          note: "No customer-identifiable data is stored for banners.",
        },
      });
    }

    if (actionType === "shop_redact") {
      const gdprRequest = await logGdprRequest({
        shop,
        requestType: "shop_redact",
        payload: { test: true, shop },
      });

      if (process.env.NODE_ENV === "development") {
        await db.shop.deleteMany({ where: { shopDomain: shop } });
        await updateGdprRequestStatus(gdprRequest.id, "completed");

        return json({
          success: true,
          message: `All shop data deleted for ${shop}`,
          data: {
            requestId: gdprRequest.id,
          },
        });
      }

      return json({
        success: false,
        message: "Shop redact test is only available in development mode",
      });
    }

    return json({ success: false, message: "Unknown action" });
  } catch (error) {
    console.error("GDPR test error:", error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function GdprTest() {
  const actionData = useActionData<typeof action>();
  const { environment } = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  const [customerEmail, setCustomerEmail] = useState("");

  return (
    <Page
      title="GDPR Webhooks Testing"
      subtitle="Test GDPR compliance webhooks in development"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="warning">
            <p>
              <strong>⚠️ DEVELOPMENT MODE ONLY:</strong> This testing interface is
              only available when NODE_ENV is not set to "production".
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            <p>
              <strong>Current Environment:</strong> {environment}
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Customer Email for Testing
              </Text>
              <TextField
                label="Customer Email"
                value={customerEmail}
                onChange={setCustomerEmail}
                placeholder="customer@example.com"
                autoComplete="email"
                helpText="Enter an email to simulate GDPR requests"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                1. Test Data Request (customers/data_request)
              </Text>
              <Text as="p" tone="subdued">
                Simulates a customer requesting their data. This will:
              </Text>
              <List type="bullet">
                <List.Item>Log the request in the GdprRequest table</List.Item>
                <List.Item>Compile any stored customer data (if any)</List.Item>
                <List.Item>Send an email if delivery is configured</List.Item>
              </List>

              <Form method="post">
                <input type="hidden" name="action" value="data_request" />
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <Button submit loading={isLoading} disabled={!customerEmail || isLoading}>
                  Test Data Request
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                2. Test Customer Redact (customers/redact)
              </Text>
              <Text as="p" tone="subdued">
                Simulates a customer requesting data deletion. This will:
              </Text>
              <List type="bullet">
                <List.Item>Log the request in the GdprRequest table</List.Item>
                <List.Item>Return a confirmation response</List.Item>
              </List>

              <Form method="post">
                <input type="hidden" name="action" value="customer_redact" />
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <Button
                  submit
                  loading={isLoading}
                  disabled={!customerEmail || isLoading}
                  tone="critical"
                >
                  Test Customer Redact
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                3. Test Shop Redact (shop/redact)
              </Text>
              <Text as="p" tone="critical">
                ⚠️ DANGER: This will delete ALL data for your shop!
              </Text>
              <Text as="p" tone="subdued">
                Simulates a store owner uninstalling the app. This will delete all
                banner data for the current shop.
              </Text>

              <Banner tone="critical">
                <p>
                  This action is IRREVERSIBLE and only works in development mode.
                </p>
              </Banner>

              <Form method="post">
                <input type="hidden" name="action" value="shop_redact" />
                <input type="hidden" name="customerEmail" value="" />
                <Button submit loading={isLoading} disabled={isLoading} tone="critical">
                  Test Shop Redact (Delete Everything)
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner
                  tone={actionData.success ? "success" : "critical"}
                  title={actionData.success ? "Success" : "Error"}
                >
                  <p>{actionData.message}</p>
                </Banner>

                {actionData.data && (
                  <div>
                    <Text variant="headingMd" as="h3">
                      Result Data:
                    </Text>
                    <pre
                      style={{
                        backgroundColor: "#f5f5f5",
                        padding: "12px",
                        borderRadius: "4px",
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(actionData.data, null, 2)}
                    </pre>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
