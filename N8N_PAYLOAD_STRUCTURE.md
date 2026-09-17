# 📦 n8n Payload Structure - Complete Documentation

Este documento define la estructura **completa** del JSON que se envía a n8n para generar banners con IA, basado en el flujo de 12 pasos de Bainners.

## 🎯 Payload Completo (Estructura JSON)

```json
{
  // ============================================
  // App Identification (automático)
  // ============================================
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "generate_preview" | "generate" | "finalize",

  // ============================================
  // 1-3) Prompts (con anti-injection)
  // ============================================
  "prompt": {
    "user": "A summer beach scene with product, bright and energetic",
    "system": "You are a professional banner generator...\n\nStyle Guidelines:\nPremium studio lighting...\n\nUser Request:\nA summer beach scene...",
    "negative": "text, typography, watermark, logo, blurry, distorted, extra products"
  },

  // ============================================
  // 1) Style Selection
  // ============================================
  "style": {
    "id": "preset-luxury-001",
    "name": "Luxury Black & Gold",
    "type": "system" | "custom",
    "settings": {
      "stylePrompt": "Premium studio lighting, low-key shadows, clean background, high-end product photography",
      "negativePrompt": "cartoons, extra items, busy background",
      "toneKeywords": ["minimal", "premium", "bold"],
      "defaultComposition": "product_left" | "product_right" | "centered" | "rule_of_thirds",
      "backgroundStyle": "clean" | "gradient" | "studio" | "lifestyle" | "pattern",
      "cameraFeel": "wide" | "medium" | "close_up",
      "depthOfField": "none" | "subtle" | "strong"
    }
  },

  // ============================================
  // 2) Product Context (semantic info)
  // ============================================
  "product": {
    "productId": "gid://shopify/Product/123456789",
    "productTitle": "Premium Wireless Headphones",
    "productDescription": "High-quality noise-canceling headphones with 30h battery",
    "collection": "Electronics",
    "productType": "Headphones",
    "price": "$299.99",
    "compareAtPrice": "$399.99",
    "onSale": true,
    "tags": ["wireless", "noise-canceling", "premium"],
    "vendor": "AudioTech"
  },

  // ============================================
  // 4) Reference Images
  // ============================================
  "references": {
    "images": [
      {
        "url": "https://cdn.shopify.com/s/files/1/product-image.jpg",
        "source": "shopify_product",
        "productImageId": "gid://shopify/ProductImage/987654321"
      },
      {
        "base64": "data:image/png;base64,iVBORw0KGgo...",
        "source": "user_upload"
      }
    ],
    "mode": "strict" | "flexible",
    "backgroundMode": "keep" | "replace" | "simplify"
  },

  // ============================================
  // 5) Format & Dimensions
  // ============================================
  "format": {
    "aspectRatio": "16:9" | "21:9" | "4:5" | "1:1" | "9:16",
    "dimensions": "1920x1080",
    "width": 1920,
    "height": 1080,
    "safeArea": {
      "top": 10,
      "right": 10,
      "bottom": 10,
      "left": 10
    },
    "productOrientation": "left" | "right" | "center" | "rule_of_thirds"
  },

  // ============================================
  // 6) Text Handling
  // ============================================
  "text": {
    "mode": "overlay" | "embedded",

    // Si mode = "overlay" (recomendado)
    "overlay": {
      "title": "Summer Sale",
      "subtitle": "Up to 50% Off",
      "titleColor": "#FFFFFF",
      "subtitleColor": "#FFD700",
      "textPosition": "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" | "custom",
      "customPosition": {
        "x": 100,
        "y": 50
      }
    },

    // Si mode = "embedded" (texto en la imagen)
    "embedded": {
      "headline": "Summer Sale",
      "subheadline": "Up to 50% Off",
      "language": "en",
      "maxChars": 50,
      "forceGenericFont": true
    }
  },

  // ============================================
  // 7) Call to Action
  // ============================================
  "cta": {
    "text": "Shop Now",
    "url": "/collections/summer-sale",
    "target": "_self" | "_blank",
    "style": "button" | "link" | "badge",
    "show": true,
    "backgroundColor": "#FF6B35",
    "textColor": "#FFFFFF"
  },

  // ============================================
  // 8) Branding & Colors
  // ============================================
  "branding": {
    "primaryColor": "#000000",
    "secondaryColor": "#C9A227",
    "allowGradients": true,
    "contrastLevel": "low" | "medium" | "high",
    "logoUrl": "https://cdn.shopify.com/logo.png",
    "logoPlacement": "none" | "corner" | "watermark",
    "logoOpacity": 30
  },

  // ============================================
  // Output Settings
  // ============================================
  "output": {
    "format": "png" | "jpg" | "webp",
    "quality": 90,
    "variantsCount": 3,
    "previewOnly": true
  },

  // ============================================
  // 9) Safety & Quality Rules (siempre activas)
  // ============================================
  "safety": {
    "noInventProducts": true,
    "noCompetingBrands": true,
    "noTextGarbage": true,
    "noProductDeformation": true,
    "noProhibitedElements": true,
    "prohibitedElements": ["weapons", "alcohol", "tobacco"]
  },

  // ============================================
  // Metadata
  // ============================================
  "meta": {
    "bannerId": "banner-uuid-123",
    "requestId": "req-uuid-456",
    "plan": "free" | "pro" | "ultra",
    "userId": "user-789",
    "dispatchedAt": "2026-01-21T12:34:56.789Z"
  }
}
```

## 🔄 Respuesta de n8n (Expected Response)

### Para `action: "generate_preview"` (Generar previews)

```json
{
  "success": true,
  "requestId": "req-uuid-456",
  "action": "generate_preview",

  "variants": [
    {
      "variantIndex": 0,
      "previewUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/banner-uuid-123-variant-0.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/banner-uuid-123-variant-0.webp",
      "width": 1920,
      "height": 1080,
      "sizeInMB": 0.35,
      "format": "webp",
      "seed": 42
    },
    {
      "variantIndex": 1,
      "previewUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/banner-uuid-123-variant-1.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/banner-uuid-123-variant-1.webp",
      "width": 1920,
      "height": 1080,
      "sizeInMB": 0.38,
      "format": "webp",
      "seed": 43
    },
    {
      "variantIndex": 2,
      "previewUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/banner-uuid-123-variant-2.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/banner-uuid-123-variant-2.webp",
      "width": 1920,
      "height": 1080,
      "sizeInMB": 0.42,
      "format": "webp",
      "seed": 44
    }
  ],

  "generation": {
    "model": "flux-1.1-pro",
    "processingTime": 8.5,
    "cost": 0.015,
    "tokensUsed": null
  }
}
```

### Para `action: "finalize"` (Usuario selecciona una variante)

Cuando el usuario elige una variante, se envía:

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "finalize",
  "requestId": "req-uuid-456",
  "selectedVariantIndex": 1,
  "bannerId": "banner-uuid-123"
}
```

Respuesta:

```json
{
  "success": true,
  "requestId": "req-uuid-456",
  "action": "finalize",

  "image": {
    "url": "https://bainners-assets.nyc3.digitaloceanspaces.com/banners/banner-uuid-123-final.png",
    "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/banner-uuid-123-final.png",
    "width": 1920,
    "height": 1080,
    "sizeInMB": 1.2,
    "format": "png"
  },

  "generation": {
    "model": "flux-1.1-pro",
    "processingTime": 2.1,
    "cost": 0.005
  }
}
```

## 🎨 Ejemplos por Caso de Uso

### Ejemplo 1: Banner Simple con Overlay de Texto

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "generate_preview",

  "prompt": {
    "user": "Clean studio shot, white background, product centered",
    "system": "Professional banner generator...",
    "negative": "text, blurry, distorted"
  },

  "style": {
    "id": "system-minimal",
    "name": "Minimal Clean",
    "type": "system",
    "settings": {
      "stylePrompt": "Clean white background, soft lighting, minimal shadows",
      "backgroundStyle": "clean",
      "cameraFeel": "medium"
    }
  },

  "product": {
    "productId": "gid://shopify/Product/123",
    "productTitle": "Wireless Speaker",
    "price": "$149.99"
  },

  "format": {
    "aspectRatio": "16:9",
    "dimensions": "1920x1080",
    "width": 1920,
    "height": 1080,
    "productOrientation": "center"
  },

  "text": {
    "mode": "overlay",
    "overlay": {
      "title": "Premium Sound",
      "subtitle": "Wireless Freedom",
      "textPosition": "bottom_right"
    }
  },

  "output": {
    "format": "webp",
    "quality": 90,
    "variantsCount": 2,
    "previewOnly": true
  },

  "safety": {
    "noInventProducts": true,
    "noCompetingBrands": true,
    "noTextGarbage": true,
    "noProductDeformation": true,
    "noProhibitedElements": true
  },

  "meta": {
    "bannerId": "banner-001",
    "requestId": "req-001",
    "plan": "pro",
    "dispatchedAt": "2026-01-21T12:00:00.000Z"
  }
}
```

### Ejemplo 2: Banner de Campaña con Imagen de Producto

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "generate_preview",

  "prompt": {
    "user": "Summer beach vibes, bright and energetic, product in lifestyle setting",
    "system": "Professional banner generator...",
    "negative": "text, dark, gloomy, winter"
  },

  "style": {
    "id": "custom-summer-001",
    "name": "Summer Vibes",
    "type": "custom",
    "settings": {
      "stylePrompt": "Bright sunlight, beach background, warm colors, energetic mood",
      "toneKeywords": ["bright", "energetic", "summer"],
      "backgroundStyle": "lifestyle",
      "depthOfField": "subtle"
    }
  },

  "product": {
    "productId": "gid://shopify/Product/789",
    "productTitle": "Beach Sunglasses",
    "price": "$79.99",
    "compareAtPrice": "$99.99",
    "onSale": true,
    "tags": ["summer", "beach", "accessories"]
  },

  "references": {
    "images": [
      {
        "url": "https://cdn.shopify.com/product-sunglasses.jpg",
        "source": "shopify_product"
      }
    ],
    "mode": "flexible",
    "backgroundMode": "replace"
  },

  "format": {
    "aspectRatio": "4:5",
    "dimensions": "1080x1350",
    "width": 1080,
    "height": 1350,
    "productOrientation": "rule_of_thirds"
  },

  "text": {
    "mode": "overlay",
    "overlay": {
      "title": "Summer Sale",
      "subtitle": "20% Off Beach Essentials",
      "titleColor": "#FF6B35",
      "subtitleColor": "#FFFFFF",
      "textPosition": "top_left"
    }
  },

  "cta": {
    "text": "Shop Summer Collection",
    "url": "/collections/summer",
    "target": "_self",
    "style": "button",
    "show": true,
    "backgroundColor": "#FF6B35",
    "textColor": "#FFFFFF"
  },

  "branding": {
    "primaryColor": "#FF6B35",
    "secondaryColor": "#FFD700",
    "allowGradients": true,
    "logoPlacement": "corner",
    "logoUrl": "https://cdn.shopify.com/logo.png",
    "logoOpacity": 40
  },

  "output": {
    "format": "png",
    "quality": 95,
    "variantsCount": 3,
    "previewOnly": true
  },

  "safety": {
    "noInventProducts": true,
    "noCompetingBrands": true,
    "noTextGarbage": true,
    "noProductDeformation": true,
    "noProhibitedElements": true
  },

  "meta": {
    "bannerId": "banner-summer-001",
    "requestId": "req-summer-001",
    "plan": "ultra",
    "dispatchedAt": "2026-01-21T14:30:00.000Z"
  }
}
```

### Ejemplo 3: Banner con Texto Embebido (Avanzado)

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "generate_preview",

  "prompt": {
    "user": "Bold typography poster style, product with impact text",
    "system": "Professional banner generator...",
    "negative": "blurry, small text, unreadable"
  },

  "style": {
    "id": "system-bold",
    "name": "Bold Impact",
    "type": "system",
    "settings": {
      "stylePrompt": "High contrast, bold colors, poster-style composition",
      "toneKeywords": ["bold", "impactful", "strong"]
    }
  },

  "format": {
    "aspectRatio": "1:1",
    "dimensions": "1080x1080",
    "width": 1080,
    "height": 1080
  },

  "text": {
    "mode": "embedded",
    "embedded": {
      "headline": "NEW ARRIVAL",
      "subheadline": "Limited Edition",
      "language": "en",
      "maxChars": 30,
      "forceGenericFont": true
    }
  },

  "output": {
    "format": "jpg",
    "quality": 85,
    "variantsCount": 2,
    "previewOnly": true
  },

  "safety": {
    "noInventProducts": true,
    "noCompetingBrands": true,
    "noTextGarbage": true,
    "noProductDeformation": true,
    "noProhibitedElements": true
  },

  "meta": {
    "bannerId": "banner-embedded-001",
    "plan": "pro",
    "dispatchedAt": "2026-01-21T16:00:00.000Z"
  }
}
```

## 📊 Diferencias por Action

| Campo | `generate_preview` | `finalize` |
|---|---|---|
| Payload completo | ✅ | ❌ Solo requestId + selectedVariantIndex |
| Genera imágenes | ✅ Múltiples previews | ✅ Una imagen final |
| Guarda en S3 | ⚠️ Temporal | ✅ Permanente |
| Consume GB del plan | ❌ | ✅ |
| Response | `variants[]` | `image{}` |

## 🔐 Headers

Todos los requests llevan:

```
Content-Type: application/json
Authorization: Bearer REPLACE_WITH_LOCAL_TOKEN
```

## 🎯 Plan Limits

| Campo | Free | Pro | Ultra |
|---|---|---|
| `variantsCount` | 2 | 3 | 4 |
| `style.type` | system only | system only | system + custom |
| `output.format` | png, jpg | png, jpg, webp | png, jpg, webp |
| Analytics | ❌ | ✅ | ✅ A/B testing |

---

**Nota**: Este payload se genera automáticamente usando `generateCompleteBanner()` en `automation.server.ts`. No necesitas construirlo manualmente.
