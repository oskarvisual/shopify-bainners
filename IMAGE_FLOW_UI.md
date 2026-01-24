# 🎨 Flujo de UI para Imágenes de Banner

Este documento describe el flujo completo de la interfaz de usuario para agregar/editar imágenes en un banner.

---

## 📐 Layout de la Vista de Banner

### Estructura General

```
┌─────────────────────────────────────────────────────────────┐
│ Banner: Summer Sale Campaign                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 🎨 GENERAL SETTINGS (Top Section)                           │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Layout: Hero Banner                                  │   │
│ │ Colors: #FF5733, #C70039                             │   │
│ │ CTA Style: Button                                    │   │
│ │ Text Position: Left                                  │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ 📸 IMAGES (Bottom Section)                                  │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ ┌────────┐ ┌────────┐ ┌────────┐                    │   │
│ │ │ Image 1│ │ Image 2│ │ Image 3│  [+ Add Image]     │   │
│ │ │        │ │        │ │        │                     │   │
│ │ │  Main  │ │Variant │ │Variant │                     │   │
│ │ └────────┘ └────────┘ └────────┘                    │   │
│ │                                                       │   │
│ │ Title: "Summer Beach Scene"                          │   │
│ │ Description: "Main hero image"                       │   │
│ │ CTA: "Shop Now"                                      │   │
│ │ Analytics: 1,234 views, 56 clicks (2.3% CTR) 📊     │   │
│ │             └── Solo si plan lo permite              │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🖼️ Modal: Add/Edit Image

Cuando el usuario clickea "Add Image" o "Edit" en una imagen existente:

### Layout del Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│ Add Image to Banner                                           [X]   │
├────────────────────┬────────────────────────────────────────────────┤
│                    │                                                │
│  LEFT SIDE         │           RIGHT SIDE                           │
│  (Options)         │           (Content Area)                       │
│                    │                                                │
│ ┌────────────────┐ │                                                │
│ │ 1️⃣ Shopify     │ │    (Empty until option selected)              │
│ │    Gallery     │ │                                                │
│ │    ✓ Free      │ │                                                │
│ └────────────────┘ │                                                │
│                    │                                                │
│ ┌────────────────┐ │                                                │
│ │ 2️⃣ Upload      │ │                                                │
│ │    Image       │ │                                                │
│ │    💰 Uses GB  │ │                                                │
│ └────────────────┘ │                                                │
│                    │                                                │
│ ┌────────────────┐ │                                                │
│ │ 3️⃣ Generate    │ │                                                │
│ │    with AI     │ │                                                │
│ │    💰 Uses GB  │ │                                                │
│ │    🔒 Pro      │ │ ← Locked si no tiene el plan                  │
│ └────────────────┘ │                                                │
│                    │                                                │
└────────────────────┴────────────────────────────────────────────────┘
```

---

## 1️⃣ Opción: Shopify Gallery

### Al seleccionar esta opción:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Add Image to Banner                                           [X]   │
├────────────────────┬────────────────────────────────────────────────┤
│ ┌────────────────┐ │ 🏬 Shopify Products & Images                  │
│ │✅ 1️⃣ Shopify   │ │                                                │
│ │    Gallery     │ │ Search: [___________] 🔍                      │
│ └────────────────┘ │                                                │
│                    │ ┌─────────────────────────────────────┐       │
│ ┌────────────────┐ │ │ Product: Premium Watch              │       │
│ │ 2️⃣ Upload      │ │ ├─────────────────────────────────────┤       │
│ │    Image       │ │ │ ┌──────┐ ┌──────┐ ┌──────┐         │       │
│ └────────────────┘ │ │ │ Img1 │ │ Img2 │ │ Img3 │         │       │
│                    │ │ │      │ │ [✓]  │ │      │         │       │
│ ┌────────────────┐ │ │ └──────┘ └──────┘ └──────┘         │       │
│ │ 3️⃣ Generate    │ │ └─────────────────────────────────────┘       │
│ │    with AI 🔒  │ │                                                │
│ └────────────────┘ │ ┌─────────────────────────────────────┐       │
│                    │ │ Product: Summer Dress               │       │
│                    │ ├─────────────────────────────────────┤       │
│                    │ │ ┌──────┐ ┌──────┐                  │       │
│                    │ │ │ Img1 │ │ Img2 │                  │       │
│                    │ │ │      │ │      │                  │       │
│                    │ │ └──────┘ └──────┘                  │       │
│                    │ └─────────────────────────────────────┘       │
│                    │                                                │
│                    │                    [Use Selected Image]        │
└────────────────────┴────────────────────────────────────────────────┘
```

### Comportamiento:
- Lista todos los productos del shop usando Shopify Admin API
- Al seleccionar un producto, muestra todas sus imágenes
- Imagen seleccionada se marca con borde azul y checkmark
- Botón "Use Selected Image" se activa solo cuando hay selección
- **NO llama a n8n**
- **NO consume GB del plan**
- Solo guarda la URL en `externalImageUrl` en DB

---

## 2️⃣ Opción: Upload Image

### Al seleccionar esta opción:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Add Image to Banner                                           [X]   │
├────────────────────┬────────────────────────────────────────────────┤
│ ┌────────────────┐ │ 📤 Upload Your Image                          │
│ │ 1️⃣ Shopify     │ │                                                │
│ │    Gallery     │ │ ┌────────────────────────────────────────┐   │
│ └────────────────┘ │ │                                          │   │
│                    │ │         📁                               │   │
│ ┌────────────────┐ │ │                                          │   │
│ │✅ 2️⃣ Upload    │ │ │   Drag & drop your image here           │   │
│ │    Image       │ │ │                                          │   │
│ │    💰 Uses GB  │ │ │        or click to browse               │   │
│ └────────────────┘ │ │                                          │   │
│                    │ │   Supported: JPG, PNG, WEBP              │   │
│ ┌────────────────┐ │ │   Max size: 10 MB                        │   │
│ │ 3️⃣ Generate    │ │ │                                          │   │
│ │    with AI 🔒  │ │ └────────────────────────────────────────┘   │
│ └────────────────┘ │                                                │
│                    │ ☑️ Optimize for web (recommended)              │
│                    │                                                │
│                    │ ℹ️  This image will use storage from your plan │
│                    │    Current usage: 0.5 GB / 1 GB               │
│                    │                                                │
└────────────────────┴────────────────────────────────────────────────┘
```

### Después de seleccionar archivo:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Add Image to Banner                                           [X]   │
├────────────────────┬────────────────────────────────────────────────┤
│ ┌────────────────┐ │ 📤 Upload Your Image                          │
│ │✅ 2️⃣ Upload    │ │                                                │
│ │    Image       │ │ ┌────────────────────────────────────────┐   │
│ │    💰 Uses GB  │ │ │  ┌──────────────────┐                  │   │
│ └────────────────┘ │ │  │                  │                  │   │
│                    │ │  │   [Preview]      │                  │   │
│                    │ │  │                  │                  │   │
│                    │ │  │  summer-sale.jpg │                  │   │
│                    │ │  └──────────────────┘                  │   │
│                    │ │                                          │   │
│                    │ │  📊 Original: 2.3 MB (1920x1080)        │   │
│                    │ │  ✨ Optimized: ~0.8 MB (webp)           │   │
│                    │ │                                          │   │
│                    │ │  [Change File]                          │   │
│                    │ └────────────────────────────────────────┘   │
│                    │                                                │
│                    │ ☑️ Optimize for web (recommended)              │
│                    │                                                │
│                    │                        [⏫ Upload & Use Image] │
└────────────────────┴────────────────────────────────────────────────┘
```

### Al clickear "Upload & Use Image":

```json
// Payload enviado a n8n
POST https://brain.orivisdev.shop/webhook-test/98bdf7c9-0b3f-4258-af4d-022386ca2a50

{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "upload",
  "plan": "free",

  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAA...",
  "fileName": "summer-sale.jpg",
  "optimize": true,

  "meta": {
    "plan": "free",
    "bannerId": "banner-uuid",
    "dispatchedAt": "2026-01-22T16:00:00.000Z"
  }
}
```

### Durante la subida:

```
┌──────────────────────────────────────────┐
│ ⏳ Uploading & Optimizing...             │
│                                          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ 75%               │
│                                          │
│ Optimizing image for web...             │
└──────────────────────────────────────────┘
```

### Respuesta exitosa de n8n:

```json
{
  "success": true,
  "filename": "uuid-optimized.webp",
  "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/uuid.webp",
  "sizeInMB": 0.82,
  "width": 1920,
  "height": 1080,
  "format": "webp"
}
```

### UI después de éxito:

```
┌──────────────────────────────────────────┐
│ ✅ Image Uploaded Successfully!          │
│                                          │
│ [Preview of uploaded image]             │
│                                          │
│ Size: 0.82 MB                           │
│ Format: webp                            │
│ Dimensions: 1920x1080                   │
│                                          │
│            [Use This Image]             │
└──────────────────────────────────────────┘
```

---

## 3️⃣ Opción: Generate with AI

### Al seleccionar esta opción:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Add Image to Banner                                           [X]   │
├────────────────────┬───────────────────────────────────────────────┤
│ ┌────────────────┐ │ 🎨 Generate with AI                           │
│ │ 1️⃣ Shopify     │ │                                                │
│ │    Gallery     │ │ ┌────────────────────────────────────────┐   │
│ └────────────────┘ │ │ 1️⃣ Select Character (Optional)          │   │
│                    │ │                                          │   │
│ ┌────────────────┐ │ │ ○ No character                          │   │
│ │ 2️⃣ Upload      │ │ │ ○ Select from gallery                   │   │
│ │    Image       │ │ │ ● Upload new character                  │   │
│ └────────────────┘ │ │                                          │   │
│                    │ │ [📁 Choose file]                        │   │
│ ┌────────────────┐ │ └────────────────────────────────────────┘   │
│ │✅ 3️⃣ Generate  │ │                                                │
│ │    with AI     │ │ ┌────────────────────────────────────────┐   │
│ │    💰 Uses GB  │ │ │ 2️⃣ Select Product                       │   │
│ │    ⭐ Pro      │ │ │                                          │   │
│ └────────────────┘ │ │ ● Select from Shopify products          │   │
│                    │ │ ○ Upload product photo                  │   │
│                    │ │                                          │   │
│                    │ │ Search products: [___________] 🔍       │   │
│                    │ │                                          │   │
│                    │ │ [Selected: Premium Watch]               │   │
│                    │ │ ┌──────┐                                │   │
│                    │ │ │      │ Premium Watch                  │   │
│                    │ │ │ Img  │ $299.00                        │   │
│                    │ │ └──────┘                                │   │
│                    │ └────────────────────────────────────────┘   │
│                    │                                                │
│                    │ ┌────────────────────────────────────────┐   │
│                    │ │ 3️⃣ Style & Settings                     │   │
│                    │ │                                          │   │
│                    │ │ Style Preset:                           │   │
│                    │ │ [Luxury ▼] [Fashion] [Tech] [Custom]   │   │
│                    │ │                                          │   │
│                    │ │ Aspect Ratio:                           │   │
│                    │ │ ● 16:9  ○ 21:9  ○ 4:5  ○ 1:1           │   │
│                    │ │                                          │   │
│                    │ │ Resolution:                             │   │
│                    │ │ ○ 1K  ● 2K  ○ 4K                        │   │
│                    │ │                                          │   │
│                    │ │ Additional Details (optional):          │   │
│                    │ │ ┌────────────────────────────────┐     │   │
│                    │ │ │Beach sunset, warm lighting,    │     │   │
│                    │ │ │golden hour atmosphere          │     │   │
│                    │ │ └────────────────────────────────┘     │   │
│                    │ │                                          │   │
│                    │ │ Variants: [2 ▼]                         │   │
│                    │ └────────────────────────────────────────┘   │
│                    │                                                │
│                    │ ℹ️  Cost: ~0.5 GB storage per variant          │
│                    │    Current usage: 0.5 GB / 5 GB (Pro plan)   │
│                    │                                                │
│                    │                          [🎨 Generate Images]  │
└────────────────────┴────────────────────────────────────────────────┘
```

### Cuando selecciona "Select from gallery" en Character:

```
┌────────────────────────────────────────┐
│ Select Character                       │
├────────────────────────────────────────┤
│ Your Characters (from Image table):    │
│                                        │
│ ┌──────┐ ┌──────┐ ┌──────┐           │
│ │      │ │      │ │      │           │
│ │ Char1│ │ Char2│ │ Char3│           │
│ │      │ │ [✓]  │ │      │           │
│ └──────┘ └──────┘ └──────┘           │
│                                        │
│              [Select]  [Cancel]       │
└────────────────────────────────────────┘
```

### Cuando selecciona "Upload new character":
- Se muestra drag & drop similar al Upload Image
- Se sube usando el mismo webhook pero con `action: "upload"`
- Se guarda en tabla `Image` con `sourceType: "character"`

### Al clickear "Generate Images":

```json
// Payload enviado a n8n
POST https://brain.orivisdev.shop/webhook-test/98bdf7c9-0b3f-4258-af4d-022386ca2a50

{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "generate",
  "plan": "pro",

  "prompt": "Beach sunset, warm lighting, golden hour atmosphere",
  "aspect_ratio": "16:9",
  "resolution": "2K",
  "output_format": "webp",

  "stylePrompt": "Luxury brand photography, high-end lighting, premium feel",
  "negativePrompt": "text, watermark, blurry, distorted",

  "productContext": {
    "productId": "gid://shopify/Product/123",
    "title": "Premium Watch",
    "imageUrl": "https://cdn.shopify.com/s/files/watch.jpg"
  },

  "referenceImages": [
    "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/characters/character-uuid.png"
  ],

  "variantsCount": 2,

  "meta": {
    "plan": "pro",
    "bannerId": "banner-uuid",
    "stylePresetId": "luxury-preset-uuid",
    "dispatchedAt": "2026-01-22T16:00:00.000Z"
  }
}
```

### Durante la generación:

```
┌──────────────────────────────────────────┐
│ 🎨 Generating with AI...                 │
│                                          │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░ Processing...      │
│                                          │
│ Creating 2 variants...                  │
│ This may take 10-30 seconds            │
└──────────────────────────────────────────┘
```

### Respuesta exitosa de n8n (200):

```json
{
  "success": true,
  "variants": [
    {
      "variantIndex": 0,
      "filename": "uuid-0.webp",
      "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/uuid-0.webp",
      "sizeInMB": 0.45,
      "width": 2048,
      "height": 1152,
      "format": "webp"
    },
    {
      "variantIndex": 1,
      "filename": "uuid-1.webp",
      "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/uuid-1.webp",
      "sizeInMB": 0.48,
      "width": 2048,
      "height": 1152,
      "format": "webp"
    }
  ]
}
```

### UI después de éxito:

```
┌──────────────────────────────────────────────────────────────┐
│ ✅ Generated 2 Variants Successfully!                        │
│                                                              │
│ Select your favorite:                                       │
│                                                              │
│ ┌────────────────┐  ┌────────────────┐                    │
│ │                │  │                │                    │
│ │   [Image 1]    │  │   [Image 2]    │                    │
│ │                │  │                │                    │
│ │   ○ Select     │  │   ● Select     │                    │
│ └────────────────┘  └────────────────┘                    │
│                                                              │
│ Selected: Variant 2                                         │
│ Size: 0.48 MB                                               │
│ Dimensions: 2048x1152                                       │
│                                                              │
│                              [Use Selected Image]           │
└──────────────────────────────────────────────────────────────┘
```

### Respuesta de error de n8n (no 200):

```json
{
  "success": false,
  "message": "AI generation failed: Model timeout. Please try again."
}
```

### UI en caso de error:

```
┌──────────────────────────────────────────┐
│ ❌ Generation Failed                     │
│                                          │
│ AI generation failed: Model timeout.    │
│ Please try again.                       │
│                                          │
│              [Try Again]                │
└──────────────────────────────────────────┘
```

---

## 🗂️ Vista: Galería de la App

Ruta: `/app/gallery`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Image Gallery                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Filter: [All ▼] [AI Generated] [Uploaded] [Characters]             │
│ Sort: [Newest ▼]                           Search: [___________] 🔍 │
│                                                                     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │          │ │          │ │          │ │          │             │
│ │  Image 1 │ │  Image 2 │ │  Image 3 │ │  Image 4 │             │
│ │          │ │          │ │          │ │          │             │
│ │ 0.45 MB  │ │ 0.82 MB  │ │ 0.38 MB  │ │ 0.55 MB  │             │
│ │ 1920x1080│ │ 1920x1080│ │ 2048x1152│ │ 1920x1080│             │
│ │ AI       │ │ Uploaded │ │ AI       │ │ Character│             │
│ │          │ │          │ │          │ │          │             │
│ │ [🗑️ Delete]│ │ [🗑️ Delete]│ │ [🗑️ Delete]│ │ [🗑️ Delete]│             │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│                                                                     │
│ Showing 12 of 45 images                         [Load More...]     │
│                                                                     │
│ Storage Used: 12.3 GB / 25 GB (Pro Plan)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Al clickear "Delete":

```
┌────────────────────────────────────────┐
│ ⚠️  Delete Image?                      │
├────────────────────────────────────────┤
│                                        │
│ Are you sure you want to delete       │
│ this image?                           │
│                                        │
│ [Preview thumbnail]                   │
│                                        │
│ Filename: uuid-0.webp                 │
│ Size: 0.45 MB                         │
│                                        │
│ This action cannot be undone.         │
│                                        │
│         [Cancel]  [Delete]            │
└────────────────────────────────────────┘
```

### Al confirmar "Delete":

```json
// Payload enviado a n8n
POST https://brain.orivisdev.shop/webhook/delete-image

{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "delete",
  "filename": "uuid-0.webp",

  "meta": {
    "imageId": "image-uuid",
    "dispatchedAt": "2026-01-22T16:00:00.000Z"
  }
}
```

### Respuesta de n8n:

```json
{
  "success": true,
  "message": "Image deleted successfully",
  "filename": "uuid-0.webp"
}
```

### UI después de eliminar:

```
┌────────────────────────────────────────┐
│ ✅ Image Deleted Successfully          │
│                                        │
│ The image has been removed from       │
│ storage and your gallery.             │
│                                        │
│ Storage freed: 0.45 MB                │
│                                        │
│              [OK]                      │
└────────────────────────────────────────┘
```

---

## 📊 Resumen de Payloads a n8n

### 1. **Upload Image** (Character o Product)

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "upload",
  "plan": "pro",

  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAA...",
  "fileName": "character.png",
  "optimize": true,

  "meta": {
    "plan": "pro",
    "sourceType": "character", // o "product"
    "dispatchedAt": "2026-01-22T16:00:00.000Z"
  }
}
```

### 2. **Generate with AI**

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "generate",
  "plan": "pro",

  "prompt": "Additional user prompt details",
  "aspect_ratio": "16:9",
  "resolution": "2K",
  "output_format": "webp",

  "stylePrompt": "Luxury, high-end, premium lighting",
  "negativePrompt": "text, watermark, blurry",

  "productContext": {
    "productId": "gid://shopify/Product/123",
    "title": "Premium Watch",
    "imageUrl": "https://cdn.shopify.com/product.jpg"
  },

  "referenceImages": [
    "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/characters/char.png"
  ],

  "variantsCount": 2,

  "meta": {
    "plan": "pro",
    "bannerId": "banner-uuid",
    "stylePresetId": "style-uuid",
    "dispatchedAt": "2026-01-22T16:00:00.000Z"
  }
}
```

### 3. **Delete Image**

```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "delete",
  "filename": "uuid-0.webp",

  "meta": {
    "imageId": "image-uuid",
    "dispatchedAt": "2026-01-22T16:00:00.000Z"
  }
}
```

---

## ✅ Checklist de Implementación

### Frontend (Remix/React)
- [ ] Modal con 3 opciones (Shopify, Upload, Generate AI)
- [ ] Opción 1: Listado de productos Shopify con imágenes
- [ ] Opción 2: Drag & drop upload con preview
- [ ] Opción 3: Formulario AI con:
  - [ ] Selector de character (gallery + upload)
  - [ ] Selector de product (Shopify + upload)
  - [ ] Style presets
  - [ ] Aspect ratio selector
  - [ ] Additional prompt textarea
  - [ ] Variants count
- [ ] Loading states durante upload/generación
- [ ] Display de resultados (single image o variants)
- [ ] Gallery page con filtros y búsqueda
- [ ] Delete confirmation modal
- [ ] Storage usage indicator

### Backend (Remix Loaders/Actions)
- [ ] Route: `/app/banners/$bannerId/images/new`
- [ ] Action para upload image
- [ ] Action para generate with AI
- [ ] Action para delete image
- [ ] Loader para gallery
- [ ] Integration con `automation.server.ts`
- [ ] DB updates en tablas Image y BannerItem

### n8n Workflows
- [ ] Webhook: Image Processor (upload + generate)
- [ ] Webhook: Delete Image
- [ ] Switch node por `action`
- [ ] Upload flow: decode base64 → optimize → S3
- [ ] Generate flow: call AI API → optimize → S3
- [ ] Delete flow: remove from S3 → confirm

---

¡Listo para implementar! 🚀
