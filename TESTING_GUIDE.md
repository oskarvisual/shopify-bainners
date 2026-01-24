# 🧪 Guía de Testing - Bainners App

## ✅ Lo que se ha implementado

1. **Listado de Banners** (`/app/banners`)
   - Muestra todos los banners
   - Drag & drop para reordenar
   - Indicador de storage usado
   - Botones de editar/eliminar

2. **Crear Banner** (`/app/banners/new`)
   - 3 opciones de imagen:
     - Generar con IA (llama a n8n con `action: "generate"`)
     - Subir imagen (llama a n8n con `action: "upload"`)
     - Usar imagen de Shopify (NO llama a n8n, solo guarda URL)

3. **Sistema de Automatización**
   - Envía `shop`, `app`, `plan` en todos los payloads
   - Headers con Bearer token
   - Manejo de 3 casos diferentes

## 🚀 Cómo Probar

### Paso 1: Iniciar la Base de Datos

```bash
# Si usas Docker
docker-compose up -d

# O si tienes MySQL instalado localmente, asegúrate de que esté corriendo
# en el puerto 3307
```

### Paso 2: Sincronizar Schema de Prisma

```bash
npx prisma db push
```

Esto creará las tablas en la base de datos, incluyendo el nuevo campo `displayOrder`.

### Paso 3: Iniciar la App

En una terminal:

```bash
npm run dev
```

O con Shopify CLI:

```bash
shopify app dev
```

### Paso 4: Instalar en tu Tienda de Desarrollo

1. Abre la URL que te da `shopify app dev`
2. Autoriza la app en tu tienda de desarrollo
3. La app creará automáticamente el registro de Shop en la base de datos

### Paso 5: Probar las Funcionalidades

#### 5.1 Listado Vacío

Al entrar a `/app/banners` verás el empty state con botón para crear banner.

#### 5.2 Crear Banner con IA

1. Click en "Create Banner"
2. Completar:
   - Title: "Test AI Banner"
   - Layout: "Hero Banner"
   - Image Source: **"Generate with AI"**
   - Prompt: "A beautiful sunset on the beach"
   - Aspect Ratio: "16:9"
3. Click "Create Banner"

**Payload enviado a n8n:**
```json
{
  "appId": "shopify-bainners",
  "shop": "tu-tienda.myshopify.com",
  "app": "shopify-bainners",
  "action": "generate",
  "plan": "free",
  "prompt": "A beautiful sunset on the beach",
  "aspect_ratio": "16:9",
  "resolution": "1K",
  "output_format": "webp",
  "meta": {
    "plan": "free",
    "dispatchedAt": "2026-01-21T..."
  }
}
```

**Revisa la consola** para ver el log:
```
[n8n] Dispatching generate automation for shop: tu-tienda.myshopify.com
```

#### 5.3 Crear Banner con Upload

1. Click en "Create Banner"
2. Completar:
   - Title: "Test Upload Banner"
   - Image Source: **"Upload my own image"**
   - Arrastrar una imagen al dropzone
3. Click "Create Banner"

**Payload enviado a n8n:**
```json
{
  "appId": "shopify-bainners",
  "shop": "tu-tienda.myshopify.com",
  "app": "shopify-bainners",
  "action": "upload",
  "plan": "free",
  "imageBase64": "iVBORw0KGgo...",
  "fileName": "my-image.png",
  "optimize": true,
  "meta": {
    "plan": "free",
    "dispatchedAt": "2026-01-21T..."
  }
}
```

#### 5.4 Crear Banner con Imagen de Shopify

1. Click en "Create Banner"
2. Completar:
   - Title: "Test Shopify Banner"
   - Image Source: **"Use Shopify product image"**
   - (Por ahora mostrará un mensaje de "coming soon")
3. **NO llama a n8n** - solo guarda la URL en DB

#### 5.5 Drag & Drop para Reordenar

1. Ve a `/app/banners` (listado)
2. Arrastra y suelta un banner a una nueva posición
3. Automáticamente se guarda el nuevo orden
4. Recarga la página y verás que el orden se mantuvo

## 🔍 Logs a Revisar

### En la terminal de la app:

```
[n8n] Dispatching generate automation for shop: mystore.myshopify.com
[2026-01-21T12:34:56.789Z] ✓ Automation image - Shop: mystore.myshopify.com, Action: generate
```

### En n8n (webhook):

Deberías ver los requests llegando con el payload completo.

## 📊 Estructura de la Base de Datos

Después de crear algunos banners:

```sql
-- Ver banners
SELECT id, title, status, layout, displayOrder, createdAt
FROM Banner
ORDER BY displayOrder ASC;

-- Ver imágenes
SELECT id, bannerId, sourceType, width, height, sizeInMB, isSelected
FROM BannerImage;

-- Ver shops
SELECT shopDomain, plan, storageUsedGB, storageLimitGB
FROM Shop;
```

## ❗ Errores Comunes

### Error: "Can't reach database server"

Solución: Inicia MySQL en el puerto 3307

```bash
docker-compose up -d
```

### Error: "N8N_WEBHOOK_IMAGE_PROCESSOR is not configured"

Solución: Verifica tu `.env`:

```env
N8N_WEBHOOK_IMAGE_PROCESSOR=https://brain.orivisdev.shop/webhook-test/98bdf7c9-0b3f-4258-af4d-022386ca2a50
```

### Error: "n8n webhook failed: 401"

Solución: Verifica el token en `.env`:

```env
AUTOMATIONS_TOKEN=DbsRogxXcez5XcHj
```

Y que n8n esté configurado para aceptar ese Bearer token.

## 🎯 Siguiente: Configurar n8n

Ver `N8N_PAYLOAD_EXAMPLES.md` para:
- Ejemplos exactos de payloads
- Estructura de response esperada
- Workflow sugerido en n8n

## 📝 Checklist de Testing

- [ ] Iniciar base de datos
- [ ] Ejecutar `npx prisma db push`
- [ ] Iniciar app con `shopify app dev`
- [ ] Instalar app en tienda de desarrollo
- [ ] Ver listado vacío
- [ ] Crear banner con AI (verificar payload en logs)
- [ ] Crear banner con upload (verificar payload en logs)
- [ ] Verificar que Shopify option no llama a n8n
- [ ] Probar drag & drop
- [ ] Verificar que orden se guarda
- [ ] Eliminar un banner
- [ ] Verificar storage indicator

---

**Listo para probar!** 🚀

Cuando tengas n8n configurado, los banners se crearán con imágenes reales.
Mientras tanto, se guardarán en draft sin imagen.
