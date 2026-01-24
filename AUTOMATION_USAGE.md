# 🤖 Automation System - Usage Guide

This guide explains how to use the automation system for Bainners, inspired by the shopify-qa app.

## 📋 Overview

The automation system provides:
- **Structured webhook dispatch** to n8n
- **Bearer token authentication** (`AUTOMATIONS_TOKEN`)
- **App identification** (`AUTOMATIONS_APP_ID`)
- **Consistent payload format** across all automations
- **Logging and error handling**

## 🔧 Configuration

### Environment Variables

Add these to your `.env` file:

```env
# App identifier (used in all webhook payloads)
AUTOMATIONS_APP_ID=shopify-bainners

# Bearer token for n8n authentication
AUTOMATIONS_TOKEN=DbsRogxXcez5XcHj

# n8n webhook endpoint for image processing
N8N_WEBHOOK_IMAGE_PROCESSOR=https://brain.orivisdev.shop/webhook-test/98bdf7c9-0b3f-4258-af4d-022386ca2a50

# (Optional) General webhook automation endpoint
AUTOMATIONS_WEBHOOK_URL=https://brain.orivisdev.shop/webhook/automation
```

## 🎨 Example: Generate Banner with AI

### Using the Quick Helper Function

```typescript
import { generateBannerWithAI } from "~/utils/automation.server";

// In your route action or loader
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = "mystore.myshopify.com";

  const result = await generateBannerWithAI({
    shop: shop,
    prompt: "a ninja reading twitter and getting surprise because japan lost world war 2",
    aspect_ratio: "1:1",
    resolution: "1K",
    output_format: "png",
    stylePrompt: "Premium studio lighting, clean background",
    negativePrompt: "text, watermarks, blurry",
    variantsCount: 3,
    meta: {
      bannerId: "banner-123",
      plan: "PRO",
    },
  });

  if (result.success) {
    console.log("Images generated:", result.data);
    // result.data contains the n8n response with image URLs
  } else {
    console.error("Generation failed:", result.error);
  }

  return json(result);
}
```

### Payload Sent to n8n

The above example sends this payload:

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "generate",
  "app": "shopify-bainners",
  "prompt": "a ninja reading twitter and getting surprise because japan lost world war 2",
  "aspect_ratio": "1:1",
  "resolution": "1K",
  "output_format": "png",
  "stylePrompt": "Premium studio lighting, clean background",
  "negativePrompt": "text, watermarks, blurry",
  "variantsCount": 3,
  "meta": {
    "bannerId": "banner-123",
    "plan": "PRO",
    "dispatchedAt": "2026-01-21T12:34:56.789Z"
  }
}
```

### Headers Sent to n8n

```
Content-Type: application/json
Authorization: Bearer DbsRogxXcez5XcHj
```

## 📤 Example: Upload Banner Image

```typescript
import { uploadBannerImage } from "~/utils/automation.server";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = "mystore.myshopify.com";
  const imageFile = formData.get("image") as File;

  // Convert to base64
  const arrayBuffer = await imageFile.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const result = await uploadBannerImage({
    shop: shop,
    imageBase64: base64,
    fileName: imageFile.name,
    optimize: true,
    meta: {
      bannerId: "banner-456",
      uploadedBy: "admin",
    },
  });

  return json(result);
}
```

## 🔄 Example: Optimize Existing Image

```typescript
import { optimizeBannerImage } from "~/utils/automation.server";

const result = await optimizeBannerImage({
  shop: "mystore.myshopify.com",
  imageUrl: "https://example.com/banner.png",
  targetFormat: "webp",
  maxSizeMB: 0.5,
  meta: {
    bannerId: "banner-789",
  },
});
```

## 🎯 Direct Automation Dispatch (Advanced)

For more control, use `dispatchImageAutomation` directly:

```typescript
import { dispatchImageAutomation } from "~/utils/automation.server";

const result = await dispatchImageAutomation({
  shop: "mystore.myshopify.com",
  action: "generate",
  payload: {
    action: "generate",
    shop: "mystore.myshopify.com",
    app: "shopify-bainners",
    prompt: "Your custom prompt",
    aspect_ratio: "16:9",
    resolution: "4K",
    output_format: "webp",
    // Any custom fields you want to send
    customField: "custom value",
  },
  meta: {
    source: "api",
    userId: "user-123",
  },
  token: "custom-token-override", // Optional: override AUTOMATIONS_TOKEN
});
```

## 📊 Payload Structure Reference

All automations follow this structure:

```typescript
{
  // Automatic fields (added by automation.server.ts)
  appId: "shopify-bainners",           // From AUTOMATIONS_APP_ID
  shop: "store.myshopify.com",
  action: "generate" | "upload" | "optimize",

  // Your custom payload
  ...yourPayload,

  // Metadata (optional)
  meta: {
    ...yourMeta,
    dispatchedAt: "2026-01-21T12:34:56.789Z"  // Auto-added timestamp
  }
}
```

## 🔐 Authentication

The system uses **Bearer token authentication**:

1. Token is read from `AUTOMATIONS_TOKEN` env var
2. Token can be overridden per-request using the `token` parameter
3. If no token is provided, the request is sent without authentication

```typescript
// Use global token from env
await generateBannerWithAI({ ... });

// Override with custom token
await dispatchImageAutomation({
  ...params,
  token: "custom-token-123",
});
```

## 🪝 Custom Webhooks (Future)

For custom webhook integrations (like Zapier, Make, custom n8n flows):

```typescript
import { dispatchWebhookAutomation } from "~/utils/automation.server";

await dispatchWebhookAutomation({
  shop: "mystore.myshopify.com",
  topic: "banner.created",
  target: "https://hooks.zapier.com/hooks/catch/123/abc/",
  payload: {
    action: "create",
    entity: "banner",
    data: {
      id: "banner-123",
      title: "Summer Sale Banner",
      status: "active",
    },
  },
  headers: {
    "X-Custom-Header": "value",
  },
  meta: {
    webhookSettingId: "webhook-setting-456",
  },
});
```

This sends to `AUTOMATIONS_WEBHOOK_URL` (not `N8N_WEBHOOK_IMAGE_PROCESSOR`).

## 📝 Logging

All automation dispatches are logged:

```
[2026-01-21T12:34:56.789Z] ✓ Automation image - Shop: mystore.myshopify.com, Action: generate
[2026-01-21T12:35:01.234Z] ✗ Automation image - Shop: mystore.myshopify.com, Action: upload, Error: Network timeout
```

## 🔄 Migration from Old n8n.server.ts

The old functions still work but are marked as deprecated:

```typescript
// OLD (still works, but deprecated)
import { processImageWithN8n } from "~/utils/n8n.server";
const result = await processImageWithN8n({ ... });

// NEW (recommended)
import { generateBannerWithAI } from "~/utils/automation.server";
const result = await generateBannerWithAI({ ... });

// OR import from n8n.server (re-exported)
import { generateBannerWithAI } from "~/utils/n8n.server";
const result = await generateBannerWithAI({ ... });
```

## 🎨 Testing with Postman

Your Postman collection should work with this payload format:

```json
POST https://brain.orivisdev.shop/webhook-test/98bdf7c9-0b3f-4258-af4d-022386ca2a50
Headers:
  Content-Type: application/json
  Authorization: Bearer DbsRogxXcez5XcHj

Body:
{
  "appId": "shopify-bainners",
  "shop": "mystore",
  "action": "generate",
  "app": "shopify-bainners",
  "prompt": "a ninja reading twitter and getting surprise because japan lost world war 2",
  "aspect_ratio": "1:1",
  "resolution": "1K",
  "output_format": "png",
  "meta": {
    "dispatchedAt": "2026-01-21T12:34:56.789Z"
  }
}
```

## 📚 Related Files

- `app/utils/automation.server.ts` - Main automation system (based on shopify-qa)
- `app/utils/n8n.server.ts` - Legacy n8n client (backward compatible)
- `.env` - Configuration
- Reference: `/Users/oscarfernandez/Projects/Shopify/shopify-qa/app/lib/automation.server.js`

## 🚀 Next Steps

1. Test the webhook with `generateBannerWithAI()`
2. Check n8n logs to see the payload structure
3. Build your n8n workflow to handle the payload
4. Add error handling and retry logic as needed
5. Consider adding custom webhooks for integrations (Zapier, Slack, etc.)
