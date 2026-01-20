# n8n Webhook Contract

Este documento define el contrato entre la app de Shopify y el webhook de n8n para procesamiento de imágenes.

## Endpoint

```
POST https://brain.orivisdev.shop/webhook/image-processor
```

## Autenticación

```
Authorization: Bearer {N8N_TOKEN}
```

---

## Request Payload

### Common Fields (siempre presentes)

```json
{
  "action": "generate" | "upload" | "optimize",
  "shopId": "uuid-del-shop",
  "requestId": "uuid-opcional-para-tracking"
}
```

---

## Action: `generate` (Generar imágenes con IA)

### Request

```json
{
  "action": "generate",
  "shopId": "shop-123",
  "requestId": "gen-req-456",
  "generate": {
    "prompt": "Modern athletic shoes in outdoor setting, natural lighting",
    "stylePrompt": "Premium studio lighting, low-key, clean shadows...",
    "negativePrompt": "No cartoons, no extra items, no text...",
    "productContext": {
      "productId": "gid://shopify/Product/123",
      "title": "Running Shoes Pro",
      "description": "High-performance running shoes",
      "price": "129.99"
    },
    "referenceImages": [
      "https://cdn.shopify.com/product-image.jpg",
      "data:image/jpeg;base64,/9j/4AAQ..."
    ],
    "format": "16:9",
    "dimensions": "1920x800",
    "variantsCount": 3,
    "compositionSettings": {
      "composition": "product_left",
      "backgroundStyle": "gradient",
      "textPosition": "right",
      "primaryColor": "#000000",
      "accentColor": "#C9A227"
    }
  }
}
```

### Response

```json
{
  "success": true,
  "action": "generate",
  "requestId": "gen-req-456",
  "variants": [
    {
      "imageUrl": "https://bainners-assets.nyc3.digitaloceanspaces.com/shop-123/banner-abc.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/shop-123/banner-abc.webp",
      "sizeInMB": 0.42,
      "width": 1920,
      "height": 800,
      "format": "webp",
      "variantIndex": 0
    },
    {
      "imageUrl": "https://bainners-assets.nyc3.digitaloceanspaces.com/shop-123/banner-def.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/shop-123/banner-def.webp",
      "sizeInMB": 0.38,
      "width": 1920,
      "height": 800,
      "format": "webp",
      "variantIndex": 1
    },
    {
      "imageUrl": "https://bainners-assets.nyc3.digitaloceanspaces.com/shop-123/banner-ghi.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/shop-123/banner-ghi.webp",
      "sizeInMB": 0.45,
      "width": 1920,
      "height": 800,
      "format": "webp",
      "variantIndex": 2
    }
  ]
}
```

---

## Action: `upload` (Subir imagen del usuario a S3)

### Request

```json
{
  "action": "upload",
  "shopId": "shop-123",
  "upload": {
    "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
    "fileName": "my-banner-image.jpg",
    "optimize": true
  }
}
```

### Response

```json
{
  "success": true,
  "action": "upload",
  "imageUrl": "https://bainners-assets.nyc3.digitaloceanspaces.com/shop-123/my-banner-image.webp",
  "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/shop-123/my-banner-image.webp",
  "sizeInMB": 0.25,
  "width": 1920,
  "height": 1080,
  "format": "webp"
}
```

---

## Action: `optimize` (Optimizar imagen existente)

### Request

```json
{
  "action": "optimize",
  "shopId": "shop-123",
  "optimize": {
    "imageUrl": "https://cdn.shopify.com/s/files/1/0000/0000/products/image.jpg",
    "targetFormat": "webp",
    "maxSizeMB": 0.5
  }
}
```

### Response

```json
{
  "success": true,
  "action": "optimize",
  "imageUrl": "https://bainners-assets.nyc3.digitaloceanspaces.com/shop-123/optimized-xyz.webp",
  "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/shop-123/optimized-xyz.webp",
  "sizeInMB": 0.32,
  "width": 1920,
  "height": 1080,
  "format": "webp"
}
```

---

## Error Response

En caso de error, todas las acciones devuelven:

```json
{
  "success": false,
  "action": "generate" | "upload" | "optimize",
  "requestId": "...",
  "error": "Descripción del error"
}
```

---

## Flujo en n8n (recomendado)

1. **Webhook Trigger** - recibe el POST
2. **Switch Node** - evalúa `action`
3. **Branch por acción**:
   - `generate`:
     - Construir system prompt (anti-injection)
     - Llamar API de IA (DALL-E, Midjourney, Stable Diffusion, etc.)
     - Generar N variantes
     - Subir cada variante a S3
     - Optimizar (WebP, compresión)
     - Retornar array de variants
   - `upload`:
     - Decodificar base64
     - Optimizar si `optimize: true`
     - Subir a S3
     - Retornar URL
   - `optimize`:
     - Descargar imagen de URL
     - Aplicar optimizaciones
     - Subir a S3
     - Retornar nueva URL
4. **Respond to Webhook** - enviar response

---

## Notas Importantes

### Para la acción `generate`:

- **System prompt**: n8n debe inyectar un system prompt que prevenga prompt injection
- **Validación**: Verificar que el prompt no contenga instrucciones maliciosas
- **Límites**: Máximo 4 variantes por request
- **Timeout**: Considerar que la generación puede tardar 30-120 segundos
- **Fallback**: Si la IA falla, retornar `success: false` con mensaje de error

### Para `upload` y `optimize`:

- **Validación de archivos**: Verificar que sean imágenes válidas (JPG, PNG, WebP)
- **Tamaño máximo**: Limitar a 10MB de input
- **Optimización automática**: Siempre convertir a WebP y comprimir
- **Estructura de carpetas en S3**: `{shopId}/{timestamp}-{random}.webp`

### Seguridad:

- Validar el token en cada request
- No exponer URLs de S3 con acceso directo (usar CDN)
- Rate limiting en n8n si es necesario

---

## Ejemplo de uso en la app

```typescript
import { generateImageWithAI } from "~/utils/n8n.server";

// En un loader o action de Remix
const result = await generateImageWithAI({
  shopId: shop.id,
  requestId: generationRequest.id,
  prompt: userPrompt,
  stylePrompt: style.stylePrompt,
  format: "16:9",
  dimensions: "1920x800",
  variantsCount: 3,
});

if (result.success && result.variants) {
  // Guardar las variantes en la base de datos
  for (const variant of result.variants) {
    await prisma.bannerImage.create({
      data: {
        shopId: shop.id,
        bannerId: banner.id,
        sourceType: "ai_generated",
        storageUrl: variant.imageUrl,
        sizeInMB: variant.sizeInMB,
        width: variant.width,
        height: variant.height,
        format: variant.format,
        variantIndex: variant.variantIndex,
        generationRequestId: generationRequest.id,
      },
    });
  }
}
```
