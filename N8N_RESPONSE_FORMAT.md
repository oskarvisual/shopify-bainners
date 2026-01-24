# 📥 Formato de Respuesta de n8n - DEFINITIVO

## ✅ Respuesta Exitosa (Status 200)

Tanto para `action: "generate"` como `action: "upload"`, n8n debe retornar:

```json
{
  "message": "",
  "filename": "banner-uuid-123.webp",
  "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/banner-uuid-123.webp",
  "filesize": 0.45
}
```

### Campos:

| Campo | Tipo | Descripción | Valor en Éxito |
|-------|------|-------------|----------------|
| `message` | string | Mensaje (vacío en éxito) | `""` (string vacío) |
| `filename` | string | Nombre del archivo guardado en S3 | "banner-abc123.webp" |
| `url` | string | **URL completa del CDN** de la imagen | "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/banner-abc123.webp" |
| `filesize` | number | Tamaño del archivo en MB | `0.45` |

**⚠️ Importante:** El campo `message` debe estar **vacío** (`""`) cuando el status es 200.

## ❌ Respuesta de Error (Status != 200)

Cualquier status diferente de 200 se considera error. El campo `message` contiene la descripción del error.

Ejemplos:

### Status 400 - Bad Request
```json
{
  "message": "Invalid prompt provided"
}
```

### Status 500 - Internal Server Error
```json
{
  "message": "Failed to generate image with AI: NanoBanana API timeout"
}
```

### Status 503 - Service Unavailable
```json
{
  "message": "NanoBanana API is currently unavailable"
}
```

**⚠️ Importante:** En errores, solo el campo `message` es necesario (no `filename` ni `url`).

## 🔄 Cómo la App Maneja la Respuesta

### Caso Exitoso (Status 200)

```typescript
const result = await dispatchImageAutomation({...});

if (result.success) {
  const imageUrl = result.data.url; // ✅ Usamos este URL
  const filename = result.data.filename;
  const filesizeStr = result.data.filesize; // "1.65 MB"
  const sizeInMB = parseFilesize(filesizeStr); // Parsear a float

  // 1. Crear registro en tabla Image (storage tracking)
  const image = await db.image.create({
    data: {
      shopId,
      filename,
      storageUrl: imageUrl,
      sizeInMB,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      format: "webp",
      sourceType: "ai_generated", // o "uploaded"
    },
  });

  // 2. Crear BannerItem (referencia al banner)
  await db.bannerItem.create({
    data: {
      shopId,
      bannerId,
      imageId: image.id,
      isSelected: true,
    },
  });

  // 3. Actualizar storage usado en Shop
  await db.shop.update({
    where: { id: shopId },
    data: { storageUsedGB: { increment: sizeInMB / 1024 } },
  });
}
```

### Caso de Error (Status != 200)

```typescript
if (!result.success) {
  // result.error contiene el mensaje de error
  return json({ error: result.error }, { status: 500 });
}
```

## 🧪 Ejemplos Completos

### Ejemplo 1: Generación Exitosa

**Request a n8n:**
```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "generate",
  "plan": "free",
  "prompt": "A beautiful sunset on the beach",
  "aspect_ratio": "16:9",
  "resolution": "1K",
  "output_format": "webp"
}
```

**Response de n8n (Status 200):**
```json
{
  "message": "",
  "filename": "banner-2026-01-21-abc123.webp",
  "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/banner-2026-01-21-abc123.webp",
  "filesize": 0.45
}
```

### Ejemplo 2: Upload Exitoso

**Request a n8n:**
```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "app": "shopify-bainners",
  "action": "upload",
  "plan": "pro",
  "imageBase64": "iVBORw0KGgo...",
  "fileName": "my-banner.png",
  "optimize": true
}
```

**Response de n8n (Status 200):**
```json
{
  "message": "",
  "filename": "banner-2026-01-21-def456.webp",
  "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/banner-2026-01-21-def456.webp",
  "filesize": 0.32
}
```

### Ejemplo 3: Error - Prompt Vacío

**Request a n8n:**
```json
{
  "appId": "shopify-bainners",
  "shop": "mystore.myshopify.com",
  "action": "generate",
  "prompt": "",
  ...
}
```

**Response de n8n (Status 400):**
```json
{
  "message": "Prompt cannot be empty"
}
```

**La app maneja esto como:**
```typescript
// result.success = false
// result.error = "Prompt cannot be empty"
```

### Ejemplo 4: Error - Fallo al Subir a S3

**Request a n8n:**
```json
{
  "action": "upload",
  "imageBase64": "...",
  ...
}
```

**Response de n8n (Status 500):**
```json
{
  "message": "Failed to upload to DigitalOcean Spaces: Access Denied"
}
```

## 📊 Workflow de n8n Sugerido

```
┌─────────────────────────────────────────┐
│  1. Webhook Trigger (POST)              │
│     - Recibe payload                    │
│     - Valida Bearer token               │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. Validación                          │
│     - Check action: generate/upload     │
│     - Validar campos requeridos         │
└─────────────────────────────────────────┘
              ↓
     ┌────────┴────────┐
     ↓                 ↓
┌──────────┐    ┌─────────────┐
│ GENERATE │    │   UPLOAD    │
└──────────┘    └─────────────┘
     ↓                 ↓
┌──────────┐    ┌─────────────┐
│NanoBanana│    │Decode Base64│
│   API    │    │  + Optimize │
└──────────┘    └─────────────┘
     ↓                 ↓
     └────────┬────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. Upload to DigitalOcean Spaces       │
│     - Generate unique filename          │
│     - Upload to S3                      │
│     - Get CDN URL                       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. Response (Status 200)               │
│     {                                   │
│       "message": "",                    │
│       "filename": "...",                │
│       "url": "...",                     │
│       "filesize": 0.45                  │
│     }                                   │
└─────────────────────────────────────────┘

         (Si hay error)
              ↓
┌─────────────────────────────────────────┐
│  Error Response (Status 400/500)       │
│     {                                   │
│       "message": "Error description"    │
│     }                                   │
└─────────────────────────────────────────┘
```

## ✅ Checklist para n8n

- [ ] Webhook recibe POST con Bearer auth
- [ ] Valida que `action` sea "generate" o "upload"
- [ ] Para `generate`:
  - [ ] Valida que `prompt` no esté vacío
  - [ ] Llama a NanoBanana API
  - [ ] Sube resultado a S3
- [ ] Para `upload`:
  - [ ] Decodifica `imageBase64`
  - [ ] Optimiza si `optimize: true`
  - [ ] Sube a S3
- [ ] **Si éxito:** Retorna **Status 200** con:
  ```json
  {
    "message": "",
    "filename": "banner-xxx.webp",
    "url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/...",
    "filesize": 0.45
  }
  ```
- [ ] **Si error:** Retorna **Status 400/500** con:
  ```json
  {
    "message": "Error description"
  }
  ```
- [ ] El campo `url` debe ser la URL **completa del CDN**
- [ ] El campo `message` debe estar **vacío** (`""`) cuando status es 200

---

## 📌 Notas Importantes

1. **Campo `message`:**
   - ✅ Status 200: `message` debe ser **string vacío** `""`
   - ❌ Status != 200: `message` contiene la descripción del error

2. **Campo `url`:**
   - ✅ Correcto: `"url": "https://bainners-assets.nyc3.cdn.digitaloceanspaces.com/banners/image.webp"`
   - ❌ Incorrecto: `"url": "/banners/image.webp"`

3. **Campos en error:**
   - Solo `message` es necesario
   - No incluir `filename` ni `url` en errores
