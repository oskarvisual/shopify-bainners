# 🚀 Quick Start - Bainners Automation System

Guía rápida para empezar a usar el sistema de automatización en 5 minutos.

## 1️⃣ Configuración (Ya hecha ✅)

Las variables de entorno ya están configuradas en `.env`:

```env
AUTOMATIONS_APP_ID=shopify-bainners
AUTOMATIONS_TOKEN=REPLACE_WITH_LOCAL_TOKEN
N8N_WEBHOOK_IMAGE_PROCESSOR=https://brain.orivisdev.shop/webhook-test/REPLACE_WITH_WORKFLOW_ID
```

## 2️⃣ Probar el Sistema

### Opción A: Con el Script

```bash
# Inicia tu app
npm run dev

# En otra terminal, ejecuta el test
./TEST_WEBHOOK.sh
```

### Opción B: Con cURL

```bash
curl -X POST http://localhost:3000/api/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate",
    "prompt": "a ninja reading twitter",
    "aspect_ratio": "1:1",
    "resolution": "1K"
  }' | jq
```

### Opción C: Desde tu Código

Crea un archivo de prueba `app/routes/test.tsx`:

```typescript
import { json } from "@remix-run/node";
import { generateCompleteBanner } from "~/utils/automation.server";

export async function loader() {
  const result = await generateCompleteBanner({
    shopId: "test.myshopify.com",

    style: {
      preset: {
        name: "Test Style",
        type: "system",
        stylePrompt: "Professional, clean, modern composition",
      },
    },

    userPrompt: {
      text: "Beautiful product banner with summer vibes",
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

Visita: `http://localhost:3000/test`

## 3️⃣ Ver el Payload que se Envía

Revisa la consola de tu servidor (terminal donde corre `npm run dev`):

```
[n8n] Dispatching generate_preview automation for shop: test.myshopify.com
[2026-01-21T...] ✓ Automation image - Shop: test.myshopify.com, Action: generate_preview
```

## 4️⃣ Ver el Payload en n8n

El webhook recibe este JSON:

```json
{
  "appId": "shopify-bainners",
  "shop": "test.myshopify.com",
  "action": "generate_preview",
  "prompt": {
    "user": "Beautiful product banner with summer vibes",
    "system": "You are a professional banner generator...\n\nStyle Guidelines:\nProfessional, clean, modern composition...",
    "negative": "text, typography, watermark, logo, blurry, distorted, ..."
  },
  "style": { ... },
  "format": {
    "aspectRatio": "16:9",
    "dimensions": "1920x1080",
    "width": 1920,
    "height": 1080
  },
  "text": {
    "mode": "overlay",
    "overlay": {
      "title": "Summer Sale",
      "subtitle": "Up to 50% Off"
    }
  },
  "output": {
    "format": "png",
    "quality": 90,
    "variantsCount": 2,
    "previewOnly": true
  },
  "safety": { ... },
  "meta": {
    "dispatchedAt": "2026-01-21T..."
  }
}
```

## 5️⃣ Siguiente: Configurar n8n

En n8n, crea un workflow:

```
1. Webhook Trigger
   - URL: /webhook-test/REPLACE_WITH_WORKFLOW_ID
   - Method: POST
   - Auth: Bearer Token (REPLACE_WITH_LOCAL_TOKEN)

2. Switch Node
   - Condition: {{ $json.action }}
   - Routes:
     - generate_preview
     - finalize
     - upload
     - optimize

3. NanoBanana API Call (para generate_preview)
   - URL: https://api.nanobanana.ai/v1/generate
   - Body: Mapear desde el payload recibido
   - Extract: prompt.system, prompt.negative, format, etc.

4. DigitalOcean Spaces Upload
   - Upload resultados a S3
   - Get CDN URLs

5. Response
   - Return:
     {
       "success": true,
       "action": "generate_preview",
       "variants": [
         {
           "variantIndex": 0,
           "previewUrl": "https://cdn.url/preview-0.webp",
           "width": 1920,
           "height": 1080,
           "sizeInMB": 0.35,
           "format": "webp"
         }
       ]
     }
```

## 📚 Documentación Completa

| Archivo | Descripción |
|---------|-------------|
| `IMPLEMENTATION_SUMMARY.md` | **Empieza aquí** - Resumen completo |
| `N8N_PAYLOAD_STRUCTURE.md` | Estructura JSON completa con ejemplos |
| `COMPLETE_EXAMPLE.md` | Ejemplo paso a paso en Remix |
| `AUTOMATION_USAGE.md` | Guía de uso de funciones |
| `app/types/banner.ts` | Tipos TypeScript |
| `app/utils/automation.server.ts` | Lógica de automatización |

## 🎯 Funciones Principales

```typescript
// 1. Generar banner completo (12 pasos)
import { generateCompleteBanner } from "~/utils/automation.server";

const result = await generateCompleteBanner({
  shopId: "...",
  style: { ... },
  userPrompt: { ... },
  formatSettings: { ... },
  textSettings: { ... },
  variantSettings: { ... }
});

// 2. Finalizar variante seleccionada
import { finalizeBannerVariant } from "~/utils/automation.server";

const result = await finalizeBannerVariant({
  shop: "...",
  requestId: "...",
  selectedVariantIndex: 1
});

// 3. Simple test (backward compatible)
import { generateBannerWithAI } from "~/utils/automation.server";

const result = await generateBannerWithAI({
  shop: "...",
  prompt: "...",
  aspect_ratio: "16:9"
});
```

## ❓ Troubleshooting

### Error: "N8N_WEBHOOK_IMAGE_PROCESSOR is not configured"

Verifica que `.env` tenga:
```env
N8N_WEBHOOK_IMAGE_PROCESSOR=https://brain.orivisdev.shop/webhook-test/...
```

### Error: "n8n webhook failed: 401"

Verifica que el token sea correcto:
```env
AUTOMATIONS_TOKEN=REPLACE_WITH_LOCAL_TOKEN
```

Y que n8n esté configurado para aceptar Bearer token.

### No veo logs

Asegúrate de estar viendo la terminal donde corre `npm run dev`.

## 🎨 Próximos Pasos

1. ✅ Configurar webhook en n8n
2. ✅ Probar con payload de ejemplo
3. ✅ Integrar NanoBanana API
4. ✅ Configurar S3 upload
5. ✅ Crear UI de banners en Remix
6. ✅ Implementar schema de DB
7. ✅ Añadir validaciones por plan

---

**¿Listo para empezar?** 🚀

```bash
npm run dev
./TEST_WEBHOOK.sh
```

Luego revisa los logs y configura n8n para procesar el payload.
