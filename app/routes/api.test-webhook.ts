/**
 * API Route: Test Webhook Integration
 *
 * This is a test route to verify the automation system is working correctly.
 * You can call this endpoint to test n8n webhook integration.
 *
 * Usage:
 *   POST /api/test-webhook
 *   Body: { "action": "generate" | "upload" | "optimize" }
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { generateBannerWithAI, uploadBannerImage, optimizeBannerImage } from "../utils/automation.server";
import { authenticate } from "../shopify.server";

const ALLOWED_TEST_ACTIONS = new Set(["generate", "upload", "optimize"]);

function ensureDevOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  ensureDevOnly();
  await authenticate.admin(request);

  try {
    const body = await request.json();
    const action = String(body?.action || "generate");

    if (!ALLOWED_TEST_ACTIONS.has(action)) {
      return json({
        error: "Invalid action",
        validActions: ["generate", "upload", "optimize"],
      }, { status: 400 });
    }

    const shop = "test-store.myshopify.com";

    // Example: Generate banner with AI
    if (action === "generate") {
      console.log("🧪 Testing AI generation...");

      const result = await generateBannerWithAI({
        shop: shop,
        prompt: body.prompt || "A clean ecommerce hero banner with modern lighting",
        aspect_ratio: body.aspect_ratio || "1:1",
        resolution: body.resolution || "1K",
        output_format: body.output_format || "png",
        stylePrompt: body.stylePrompt,
        negativePrompt: body.negativePrompt,
        productContext: body.productContext,
        referenceImages: body.referenceImages,
        variantsCount: body.variantsCount || 2,
        meta: {
          source: "test-api",
          testMode: true,
        },
      });

      return json({
        status: "test_completed",
        action: "generate",
        result,
        timestamp: new Date().toISOString(),
      });
    }

    // Example: Upload image
    if (action === "upload") {
      console.log("🧪 Testing image upload...");

      // This is just a test, in real usage you'd get this from form data
      const testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="; // 1x1 red pixel

      const result = await uploadBannerImage({
        shop: shop,
        imageBase64: body.imageBase64 || testImageBase64,
        fileName: body.fileName || "test-banner.png",
        optimize: body.optimize !== false,
        meta: {
          source: "test-api",
          testMode: true,
        },
      });

      return json({
        status: "test_completed",
        action: "upload",
        result,
        timestamp: new Date().toISOString(),
      });
    }

    // Example: Optimize image
    if (action === "optimize") {
      console.log("🧪 Testing image optimization...");

      const result = await optimizeBannerImage({
        shop: shop,
        imageUrl: body.imageUrl || "https://example.com/banner.png",
        targetFormat: body.targetFormat || "webp",
        maxSizeMB: body.maxSizeMB || 0.5,
        meta: {
          source: "test-api",
          testMode: true,
        },
      });

      return json({
        status: "test_completed",
        action: "optimize",
        result,
        timestamp: new Date().toISOString(),
      });
    }

  } catch (error) {
    console.error("❌ Test webhook error:", error);

    return json({
      error: "Test failed",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// GET request to show test instructions
export async function loader({ request }: LoaderFunctionArgs) {
  ensureDevOnly();
  await authenticate.admin(request);

  return json({
    message: "Webhook Test Endpoint",
    instructions: {
      method: "POST",
      endpoint: "/api/test-webhook",
      actions: {
        generate: {
          description: "Test AI image generation",
          example: {
            action: "generate",
            prompt: "A clean ecommerce hero banner with modern lighting",
            aspect_ratio: "1:1",
            resolution: "1K",
            output_format: "png",
          },
        },
        upload: {
          description: "Test image upload",
          example: {
            action: "upload",
            imageBase64: "base64-encoded-image-data",
            fileName: "banner.png",
            optimize: true,
          },
        },
        optimize: {
          description: "Test image optimization",
          example: {
            action: "optimize",
            imageUrl: "https://example.com/banner.png",
            targetFormat: "webp",
            maxSizeMB: 0.5,
          },
        },
      },
    },
    webhook: {
      configured: !!process.env.N8N_WEBHOOK_IMAGE_PROCESSOR,
      authenticated: !!process.env.AUTOMATIONS_TOKEN,
    },
  });
}
