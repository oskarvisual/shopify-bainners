# 📦 Payloads Enviados a n8n - Ejemplos Reales

Este documento muestra **exactamente** qué JSON se envía a n8n en cada uno de los 3 casos de uso.

## 🔐 Headers (Todos los casos)

```
POST https://brain.orivisdev.shop/webhook-test/98bdf7c9-0b3f-4258-af4d-022386ca2a50

Headers:
  Content-Type: application/json
  Authorization: Bearer DbsRogxXcez5XcHj
```

---

## 🎨 CASO 1: Generar Imagen con IA

**Cuándo:** El usuario elige "Generate with AI" y escribe un prompt.

**Payload enviado a n8n:**

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "generate",
  "plan": "free",

  "prompt": "A summer beach scene with bright colors",
  "aspect_ratio": "16:9",
  "resolution": "1K",
  "output_format": "webp",

  "meta": {
    "plan": "free",
    "dispatchedAt": "2026-01-21T12:34:56.789Z"
  }
}
```

**Lo que n8n debe hacer:**
1. Recibir el payload
2. Llamar a NanoBanana API con el prompt
3. Generar imagen(s)
4. Subir a DigitalOcean Spaces
5. Retornar:

```json
{
  "success": true,
  "action": "generate",
  "variants": [
    {
      "variantIndex": 0,
      "previewUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/uuid-0.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/uuid-0.webp",
      "width": 1920,
      "height": 1080,
      "sizeInMB": 0.45,
      "format": "webp"
    }
  ]
}
```

---

## 📤 CASO 2: Subir Imagen del Usuario

**Cuándo:** El usuario elige "Upload my own image" y sube un archivo.

**Payload enviado a n8n:**

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "upload",
  "plan": "pro",

  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==...",
  "fileName": "my-banner.png",
  "optimize": true,

  "meta": {
    "plan": "pro",
    "dispatchedAt": "2026-01-21T12:34:56.789Z"
  }
}
```

**Lo que n8n debe hacer:**
1. Recibir el payload
2. **SALTARSE** la generación con IA
3. Decodificar la imagen base64
4. Optimizar (si `optimize: true`)
5. Subir a DigitalOcean Spaces
6. Retornar:

```json
{
  "success": true,
  "action": "upload",
  "image": {
    "url": "https://bainners-assets.nyc3.digitaloceanspaces.com/banners/uuid.webp",
    "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/uuid.webp",
    "width": 1920,
    "height": 1080,
    "sizeInMB": 0.32,
    "format": "webp"
  }
}
```

---

## 🏬 CASO 3: Usar Imagen de Shopify

**Cuándo:** El usuario elige "Use Shopify product image" y selecciona una imagen de un producto.

**Payload enviado a n8n:**

❌ **NINGUNO** - Este caso **NO llama a n8n**.

**Lo que la app hace:**
1. El usuario selecciona una imagen de un producto Shopify
2. La app obtiene la URL directamente de Shopify (ej: `https://cdn.shopify.com/s/files/1/0001/2345/6789/products/product-image.jpg`)
3. **NO se llama a n8n**
4. Se guarda directamente en la base de datos:

```typescript
await db.bannerImage.create({
  data: {
    sourceType: "shopify_product",
    shopifyImageUrl: "https://cdn.shopify.com/s/files/1/0001/2345/6789/products/product-image.jpg",
    sizeInMB: 0, // No consume storage porque es externo
    width: 2048,
    height: 2048,
    format: "jpg",
    isSelected: true,
  },
});
```

**Ventajas:**
- No consume API calls a n8n
- No consume storage del plan (porque la imagen está en Shopify CDN)
- Respuesta instantánea

---

## 🔄 Resumen de los 3 Casos

| Caso | Action en Payload | Llama a n8n | Consume Storage | Campos Clave |
|------|-------------------|-------------|-----------------|--------------|
| **Generate AI** | `generate` | ✅ Sí | ✅ Sí | `prompt`, `aspect_ratio`, `resolution` |
| **Upload** | `upload` | ✅ Sí | ✅ Sí | `imageBase64`, `fileName`, `optimize` |
| **Shopify** | N/A | ❌ No | ❌ No | Solo se guarda la URL en DB |

---

## 🎯 Campos Comunes en Todos los Payloads

Todos los payloads que se envían a n8n incluyen:

```json
{
  "appId": "shopify-bainners",      // Siempre
  "shop": "mystore.myshopify.com",  // Dominio de la tienda
  "app": "shopify-bainners",        // Igual que appId (compatibilidad)
  "action": "generate" | "upload",  // Tipo de acción
  "plan": "free" | "pro" | "ultra", // Plan de la tienda

  // Campos específicos según action...

  "meta": {
    "plan": "free",                 // Plan duplicado en meta
    "dispatchedAt": "2026-01-21..." // Timestamp ISO 8601
  }
}
```

---

## 🧪 Ejemplo Completo: Flujo de Generación con IA

### 1. Usuario completa el formulario

```
Title: "Summer Sale Banner"
Description: "Main hero banner for summer campaign"
Layout: "hero"
Image Source: "Generate with AI"
Prompt: "A beautiful beach sunset with palm trees and surfboard, vibrant colors"
Aspect Ratio: "16:9"
```

### 2. Se envía este JSON a n8n

```json
{
  "appId": "shopify-bainners",
  "shop": "test-store.myshopify.com",
  "app": "shopify-bainners",
  "action": "generate",
  "plan": "free",
  "prompt": "A beautiful beach sunset with palm trees and surfboard, vibrant colors",
  "aspect_ratio": "16:9",
  "resolution": "1K",
  "output_format": "webp",
  "meta": {
    "plan": "free",
    "dispatchedAt": "2026-01-21T15:30:00.000Z"
  }
}
```

### 3. n8n responde

```json
{
  "success": true,
  "action": "generate",
  "variants": [
    {
      "variantIndex": 0,
      "previewUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/abc123-0.webp",
      "cdnUrl": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/abc123-0.webp",
      "width": 1920,
      "height": 1080,
      "sizeInMB": 0.45,
      "format": "webp"
    }
  ],
  "generation": {
    "model": "flux-1.1-pro",
    "processingTime": 8.2,
    "cost": 0.015
  }
}
```

### 4. La app guarda en la base de datos

```sql
INSERT INTO BannerImage (
  shopId, bannerId, sourceType, storageUrl,
  sizeInMB, width, height, aspectRatio, format,
  isSelected, variantIndex
) VALUES (
  'shop-uuid', 'banner-uuid', 'ai_generated',
  'https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/previews/abc123-0.webp',
  0.45, 1920, 1080, '16:9', 'webp',
  true, 0
);
```

---

## 📊 Workflow de n8n Sugerido

```
┌─────────────────────────────────────────┐
│  Webhook Trigger                        │
│  - URL: /webhook-test/xxx               │
│  - Auth: Bearer Token                   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Switch Node (by action)                │
│  - generate → Ruta A                    │
│  - upload → Ruta B                      │
└─────────────────────────────────────────┘
              ↓
     ┌────────┴────────┐
     ↓                 ↓
┌─────────┐     ┌─────────────┐
│ Ruta A  │     │  Ruta B     │
│ GENERATE│     │  UPLOAD     │
└─────────┘     └─────────────┘
     ↓                 ↓
┌─────────┐     ┌─────────────┐
│NanoBanana│    │Decode Base64│
│   API    │    │             │
└─────────┘     └─────────────┘
     ↓                 ↓
     └────────┬────────┘
              ↓
┌─────────────────────────────────────────┐
│  Optimize & Upload to S3                │
│  - DigitalOcean Spaces                  │
│  - Get CDN URL                          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Response                               │
│  - Return image URLs                    │
│  - Return dimensions                    │
│  - Return file size                     │
└─────────────────────────────────────────┘
```

---

## ✅ Checklist para n8n

- [ ] Configurar webhook endpoint con Bearer auth
- [ ] Implementar Switch node para `action`
- [ ] Ruta `generate`:
  - [ ] Conectar a NanoBanana API
  - [ ] Parsear `prompt`, `aspect_ratio`, `resolution`
  - [ ] Generar imagen
  - [ ] Subir a S3
  - [ ] Retornar `variants[]`
- [ ] Ruta `upload`:
  - [ ] Decodificar `imageBase64`
  - [ ] Optimizar imagen (si `optimize: true`)
  - [ ] Subir a S3
  - [ ] Retornar `image{}`
- [ ] Error handling
- [ ] Logging de requests

---

**Listo para implementar en n8n!** 🚀
