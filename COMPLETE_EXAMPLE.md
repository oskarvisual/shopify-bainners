# 🎨 Ejemplo Completo: Generación de Banner con IA

Este documento muestra cómo implementar el flujo completo de generación de banners en tu app Remix.

## 📁 Estructura de Archivos

```
app/
├── types/
│   └── banner.ts                    # Tipos TypeScript completos
├── utils/
│   ├── automation.server.ts         # Sistema de automatización
│   └── n8n.server.ts               # Cliente n8n (legacy)
└── routes/
    ├── app.banners.new.tsx         # Crear banner (paso 1)
    └── app.banners.$id.finalize.tsx # Finalizar banner (paso 2)
```

## 🚀 Flujo Completo en 2 Pasos

### Paso 1: Generar Previews

**Archivo**: `app/routes/app.banners.new.tsx`

```typescript
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData, Form } from "@remix-run/react";
import { generateCompleteBanner } from "~/utils/automation.server";
import type { BannerGenerationRequest } from "~/types/banner";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = "mystore.myshopify.com"; // Obtener del session

  // Construir el request completo
  const bannerRequest: BannerGenerationRequest = {
    // Identificación
    shopId: shop,
    requestId: `req-${Date.now()}`,

    // 1) Style Selection
    style: {
      presetId: formData.get("stylePresetId") as string,
      preset: {
        name: "Luxury Black & Gold",
        type: "system",
        stylePrompt: "Premium studio lighting, low-key shadows, clean background, high-end product photography",
        negativePrompt: "cartoons, extra items, busy background",
        toneKeywords: ["minimal", "premium", "bold"],
        defaultComposition: "product_left",
        backgroundStyle: "studio",
        cameraFeel: "medium",
        depthOfField: "subtle",
      },
    },

    // 2) Product Context
    productContext: {
      productId: formData.get("productId") as string,
      productTitle: formData.get("productTitle") as string,
      productDescription: formData.get("productDescription") as string,
      price: formData.get("price") as string,
      compareAtPrice: formData.get("compareAtPrice") as string,
      onSale: formData.get("onSale") === "true",
    },

    // 3) User Prompt
    userPrompt: {
      text: formData.get("prompt") as string,
      feeling: formData.get("feeling") as string,
      visualContext: formData.get("visualContext") as string,
      objective: formData.get("objective") as "sale" | "launch" | "awareness",
    },

    // 4) Reference Images (opcional)
    referenceSettings: {
      images: [
        {
          url: formData.get("productImageUrl") as string,
          source: "shopify_product",
        },
      ],
      mode: "flexible",
      backgroundMode: "replace",
    },

    // 5) Format & Dimensions
    formatSettings: {
      aspectRatio: (formData.get("aspectRatio") as any) || "16:9",
      productOrientation: (formData.get("productOrientation") as any) || "center",
    },

    // 6) Text Settings
    textSettings: {
      mode: "overlay", // Recomendado
      overlay: {
        title: formData.get("title") as string,
        subtitle: formData.get("subtitle") as string,
        titleColor: "#FFFFFF",
        subtitleColor: "#FFD700",
        textPosition: "bottom_right",
      },
    },

    // 7) CTA
    ctaSettings: {
      text: formData.get("ctaText") as string,
      url: formData.get("ctaUrl") as string,
      target: "_self",
      style: "button",
      show: true,
      backgroundColor: "#FF6B35",
      textColor: "#FFFFFF",
    },

    // 8) Branding (opcional, usar Brand Kit si existe)
    brandingSettings: {
      primaryColor: "#000000",
      secondaryColor: "#C9A227",
      allowGradients: true,
      contrastLevel: "high",
      logoPlacement: "corner",
    },

    // 9) Safety Rules (siempre activas, auto-aplicadas)
    safetyRules: {
      noInventProducts: true,
      noCompetingBrands: true,
      noTextGarbage: true,
      noProductDeformation: true,
      noProhibitedElements: true,
    },

    // 10) Variants
    variantSettings: {
      count: 3, // Free: 2, Pro: 3, Ultra: 4
      generatePreviewsOnly: true, // Solo previews por ahora
    },

    // Metadata
    meta: {
      plan: "pro",
      userId: "user-123",
    },
  };

  // Enviar a n8n
  const result = await generateCompleteBanner(bannerRequest);

  if (result.success) {
    // result.data contiene los variants
    return json({
      success: true,
      requestId: bannerRequest.requestId,
      variants: result.data?.variants,
    });
  } else {
    return json({
      success: false,
      error: result.error,
    }, { status: 500 });
  }
}

export default function NewBanner() {
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <h1>Create New Banner</h1>

      {!actionData?.variants ? (
        <Form method="post">
          {/* 1) Style Selection */}
          <fieldset>
            <legend>1. Choose Style</legend>
            <select name="stylePresetId">
              <option value="system-luxury">Luxury Black & Gold</option>
              <option value="system-minimal">Minimal Clean</option>
              <option value="system-bold">Bold Impact</option>
            </select>
          </fieldset>

          {/* 2) Product Context */}
          <fieldset>
            <legend>2. Product Information (Optional)</legend>
            <input name="productId" placeholder="Product ID" />
            <input name="productTitle" placeholder="Product Title" />
            <input name="productDescription" placeholder="Description" />
            <input name="price" placeholder="$99.99" />
          </fieldset>

          {/* 3) User Prompt */}
          <fieldset>
            <legend>3. Describe Your Banner</legend>
            <textarea
              name="prompt"
              placeholder="Describe what you want to see..."
              required
            />
            <select name="feeling">
              <option value="">Select feeling...</option>
              <option value="exciting">Exciting</option>
              <option value="calm">Calm</option>
              <option value="premium">Premium</option>
            </select>
            <select name="objective">
              <option value="sale">Sale Campaign</option>
              <option value="launch">Product Launch</option>
              <option value="awareness">Brand Awareness</option>
            </select>
          </fieldset>

          {/* 5) Format */}
          <fieldset>
            <legend>5. Format & Size</legend>
            <select name="aspectRatio">
              <option value="16:9">16:9 (Hero Banner)</option>
              <option value="4:5">4:5 (Instagram)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
            <select name="productOrientation">
              <option value="center">Centered</option>
              <option value="left">Left Side</option>
              <option value="right">Right Side</option>
            </select>
          </fieldset>

          {/* 6) Text */}
          <fieldset>
            <legend>6. Text Overlay</legend>
            <input name="title" placeholder="Main Title" />
            <input name="subtitle" placeholder="Subtitle (optional)" />
          </fieldset>

          {/* 7) CTA */}
          <fieldset>
            <legend>7. Call to Action</legend>
            <input name="ctaText" placeholder="Shop Now" />
            <input name="ctaUrl" placeholder="/collections/sale" />
          </fieldset>

          <button type="submit">Generate Previews</button>
        </Form>
      ) : (
        <div>
          <h2>Choose Your Favorite</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            {actionData.variants.map((variant: any, idx: number) => (
              <div key={idx}>
                <img
                  src={variant.previewUrl}
                  alt={`Variant ${idx + 1}`}
                  style={{ width: "100%", height: "auto" }}
                />
                <p>Size: {variant.sizeInMB.toFixed(2)} MB</p>
                <Form method="post" action={`/app/banners/${actionData.requestId}/finalize`}>
                  <input type="hidden" name="variantIndex" value={idx} />
                  <button type="submit">Select This One</button>
                </Form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Paso 2: Finalizar Banner Seleccionado

**Archivo**: `app/routes/app.banners.$id.finalize.tsx`

```typescript
import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { finalizeBannerVariant } from "~/utils/automation.server";
import { db } from "~/db.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = "mystore.myshopify.com"; // Obtener del session
  const requestId = params.id as string;
  const selectedVariantIndex = parseInt(formData.get("variantIndex") as string);

  // Finalizar la variante seleccionada en n8n
  const result = await finalizeBannerVariant({
    shop,
    requestId,
    selectedVariantIndex,
    meta: {
      plan: "pro",
    },
  });

  if (result.success && result.data?.image) {
    // Guardar en la base de datos
    const banner = await db.banner.create({
      data: {
        shop,
        title: formData.get("title") as string || "Untitled Banner",
        imageUrl: result.data.image.url,
        cdnUrl: result.data.image.cdnUrl,
        width: result.data.image.width,
        height: result.data.image.height,
        sizeInMB: result.data.image.sizeInMB,
        format: result.data.image.format,
        status: "ACTIVE",
      },
    });

    // Redirigir al banner
    return redirect(`/app/banners/${banner.id}`);
  } else {
    return json({
      success: false,
      error: result.error,
    }, { status: 500 });
  }
}
```

## 🎯 Ejemplo Simplificado (Para Testing)

Si quieres probar rápidamente sin formularios complejos:

```typescript
import { generateCompleteBanner } from "~/utils/automation.server";

export async function action({ request }: ActionFunctionArgs) {
  const result = await generateCompleteBanner({
    shopId: "test-store.myshopify.com",
    requestId: `req-${Date.now()}`,

    style: {
      preset: {
        name: "Test Style",
        type: "system",
        stylePrompt: "Professional, clean, modern",
      },
    },

    userPrompt: {
      text: "A beautiful summer banner with product",
      objective: "sale",
    },

    formatSettings: {
      aspectRatio: "16:9",
    },

    textSettings: {
      mode: "overlay",
      overlay: {
        title: "Summer Sale",
        subtitle: "Up to 50% Off",
      },
    },

    variantSettings: {
      count: 2,
      generatePreviewsOnly: true,
    },
  });

  return json(result);
}
```

## 📊 Respuesta de n8n

Después de llamar a `generateCompleteBanner()`, recibirás:

```typescript
{
  success: true,
  data: {
    success: true,
    requestId: "req-1234567890",
    action: "generate_preview",
    variants: [
      {
        variantIndex: 0,
        previewUrl: "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/...",
        width: 1920,
        height: 1080,
        sizeInMB: 0.35,
        format: "webp",
        seed: 42
      },
      {
        variantIndex: 1,
        previewUrl: "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/...",
        width: 1920,
        height: 1080,
        sizeInMB: 0.38,
        format: "webp",
        seed: 43
      }
    ],
    generation: {
      model: "flux-1.1-pro",
      processingTime: 8.5,
      cost: 0.015
    }
  }
}
```

## 🔄 Flujo Visual

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Usuario completa formulario                                │
│     - Selecciona estilo                                         │
│     - Ingresa prompt                                            │
│     - Configura formato, texto, CTA, etc.                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. generateCompleteBanner()                                    │
│     - Construye payload completo                                │
│     - Aplica anti-injection en prompts                          │
│     - Valida safety rules                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. dispatchImageAutomation()                                   │
│     - Envía a n8n con Bearer token                              │
│     - POST https://brain.orivisdev.shop/webhook-test/...        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. n8n procesa (NanoBanana API)                                │
│     - Genera 2-4 variantes                                      │
│     - Sube previews a DigitalOcean Spaces                       │
│     - Retorna URLs                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. Usuario ve previews                                         │
│     - Elige la que más le gusta                                 │
│     - Click en "Select This One"                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. finalizeBannerVariant()                                     │
│     - Envía selectedVariantIndex a n8n                          │
│     - n8n guarda imagen final (permanente)                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. Guardar en DB                                               │
│     - Banner.create({ imageUrl, cdnUrl, ... })                  │
│     - Actualizar GB usage del plan                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  8. Banner listo para usar                                      │
│     - Disponible en Theme Editor (App Block)                    │
│     - Puede editarse, duplicarse, archivarse                    │
└─────────────────────────────────────────────────────────────────┘
```

## 🎨 Presets de Estilo (Ejemplo)

Puedes guardar presets de estilo en tu DB:

```typescript
// Crear preset de estilo
const luxuryStyle: StylePreset = {
  id: "system-luxury",
  name: "Luxury Black & Gold",
  type: "system",
  category: "luxury",

  stylePrompt: "Premium studio lighting, low-key shadows, clean black background, high-end product photography, luxury aesthetic, minimalist composition",
  negativePrompt: "cartoons, extra items, busy background, cheap looking, cluttered",
  toneKeywords: ["minimal", "premium", "bold", "luxury"],

  defaultComposition: "product_left",
  backgroundStyle: "studio",
  cameraFeel: "medium",
  depthOfField: "subtle",

  primaryColor: "#000000",
  accentColor: "#C9A227",
  allowGradients: false,

  noExtraProducts: true,
  noCompetingBrands: true,
  familyFriendly: true,
};
```

## 🚀 Next Steps

1. **Probar el flujo completo**:
   ```bash
   npm run dev
   # Ir a /app/banners/new
   ```

2. **Implementar en n8n**:
   - Crear workflow que reciba el payload
   - Conectar con NanoBanana API
   - Subir imágenes a DigitalOcean Spaces
   - Retornar response en formato esperado

3. **Guardar en DB**:
   - Crear modelo Banner en Prisma
   - Guardar metadata, URLs, dimensiones
   - Trackear GB usage por shop

4. **Añadir validaciones**:
   - Plan limits (Free: 2 variants, Pro: 3, Ultra: 4)
   - GB limits
   - Rate limiting

5. **UI/UX**:
   - Formulario paso a paso (wizard)
   - Preview en tiempo real
   - Galería de estilos predeterminados
   - Selector de variantes con comparación

---

**¿Necesitas ayuda?** Revisa:
- `app/types/banner.ts` - Todos los tipos
- `app/utils/automation.server.ts` - Lógica de automatización
- `N8N_PAYLOAD_STRUCTURE.md` - Estructura completa del payload
