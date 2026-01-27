import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  gatherCustomerData,
  logGdprRequest,
  updateGdprRequestStatus,
  sendCustomerDataByEmail,
  formatCustomerDataAsJson,
} from "../lib/gdpr.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer data request:", payload);

  const customerId = payload.customer?.id?.toString();
  const customerEmail = payload.customer?.email;
  const shopDomain = payload.shop_domain;

  let gdprRequest = null;

  try {
    gdprRequest = await logGdprRequest({
      shop: shopDomain,
      requestType: "data_request",
      customerEmail,
      customerId,
      payload,
    });

    await updateGdprRequestStatus(gdprRequest.id, "processing");

    const customerData = await gatherCustomerData(shopDomain, customerEmail, customerId);

    await sendCustomerDataByEmail(customerEmail, customerData, shopDomain);

    await updateGdprRequestStatus(gdprRequest.id, "completed");

    if (process.env.NODE_ENV === "development") {
      console.log("[GDPR] Customer data:", formatCustomerDataAsJson(customerData));
    }
  } catch (error) {
    console.error("[GDPR] Error processing customer data request:", error);
    if (gdprRequest) {
      await updateGdprRequestStatus(gdprRequest.id, "failed");
    }
  }

  return new Response(null, { status: 200 });
};
