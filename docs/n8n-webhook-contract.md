# n8n Webhook Contract

Contrato entre la app de Shopify (bAInners) y los workflows de n8n para el
procesamiento de imágenes.

## Endpoints

Cada acción tiene su propio workflow. Las URLs se configuran por variable de
entorno en la app:

| Acción      | Variable de entorno            | Workflow en n8n                    |
|-------------|--------------------------------|------------------------------------|
| `generate`  | `N8N_WEBHOOK_IMAGE_PROCESSOR`  | bAInners - Generate image (KIE + Quota) |
| `upload`    | `N8N_WEBHOOK_IMAGE_UPLOAD`     | bAInners - Upload image (Spaces)   |
| `optimize`  | `N8N_WEBHOOK_IMAGE_OPTIMIZE`   | bAInners - Optimize image (Spaces) |
| `delete`    | `N8N_WEBHOOK_IMAGE_DELETE`     | bAInners - Delete image (Spaces)   |
| poll estado | `N8N_WEBHOOK_IMAGE_STATUS`     | bAInners - Poll image status (KIE + Spaces) |
| consulta    | `N8N_WEBHOOK_IMAGE_QUOTA`      | bAInners - Quota (Data Table)      |

Si `N8N_WEBHOOK_IMAGE_UPLOAD` / `_OPTIMIZE` no están definidas, la app cae
en `N8N_WEBHOOK_IMAGE_PROCESSOR` para mantener compatibilidad con
despliegues anteriores.

## Autenticación

```
Authorization: Bearer {AUTOMATIONS_TOKEN}
```

Todos los workflows validan el token en el primer nodo y lanzan `Unauthorized`
si no coincide.

---

## Data Table: contador de uso

El contador diario vive en una Data Table de n8n llamada `bainners_usage`.

| Columna | Tipo    | Contenido                          |
|---------|---------|------------------------------------|
| `shop`  | string  | dominio del shop                   |
| `date`  | string  | día UTC en formato `YYYY-MM-DD`    |
| `kind`  | string  | `generation` o `upload`            |
| `count` | number  | usos consumidos en el día           |

La clave única lógica es `(shop, date, kind)`. El workflow de cuota usa la
operación `upsert` con `matchingColumns` para obtener la fila del día
(incrementándola solo en la operación de guardado).

### Consulta de cuota

```
POST {N8N_WEBHOOK_IMAGE_QUOTA}
```

```json
{
  "shop": "mi-tienda.myshopify.com",
  "kind": "generation",
  "plan": "free",
  "date": "2026-10-27"
}
```

Respuesta:

```json
{
  "used": 0,
  "limit": 1,
  "remaining": 1,
  "allowed": true,
  "date": "2026-10-27",
  "model": "flux-2/pro-text-to-image"
}
```

---

## Límites por plan

| Plan   | Generaciones/día | Subidas/día | Storage | Modelo IA                |
|--------|------------------|-------------|---------|--------------------------|
| free   | 1                | 5           | 1 GB    | `flux-2/pro-text-to-image` |
| pro    | 10               | 50          | 5 GB    | `nano-banana-pro`         |
| ultra  | 20               | 200         | 10 GB   | `nano-banana-pro`         |

El modelo lo decide **n8n** a partir del `plan` del payload: el cliente no
puede elegir un modelo distinto.

---

## Action: `generate`

### Request

```json
{
  "action": "generate",
  "shop": "mi-tienda.myshopify.com",
  "plan": "pro",
  "prompt": "zapatillas deportivas en exterior",
  "aspect_ratio": "16:9",
  "resolution": "1K",
  "output_format": "png",
  "referenceImages": "https://.../ref-1.jpg,https://.../ref-2.jpg",
  "variantsCount": 1
}
```

### Response

```json
{
  "taskId": "a9530a3d9ea6193ecb98b375a22aeebc",
  "state": "pending"
}
```

Si la cuota diaria está agotada, el workflow responde con error:
`Daily AI generation quota reached (N per day for this plan)`.

---

## Action: `upload`

### Request

```json
{
  "action": "upload",
  "shop": "mi-tienda.myshopify.com",
  "plan": "free",
  "imageBase64": "iVBORw0KGgo...",
  "fileName": "banner.png",
  "mimeType": "image/png",
  "optimize": true
}
```

### Response

```json
{
  "success": true,
  "action": "upload",
  "imageUrl": "https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/bAInners/mi-tienda.myshopify.com/abc123-banner.png",
  "cdnUrl": "https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/bAInners/mi-tienda.myshopify.com/abc123-banner.png",
  "filename": "abc123-banner.png",
  "key": "bAInners/mi-tienda.myshopify.com/abc123-banner.png",
  "sizeInMB": 0.42,
  "format": "png"
}
```

La imagen se guarda en el bucket `cdn-orivisdev` con la clave
`bAInners/<shop>/<random>-<nombre>`.

---

## Action: `delete`

### Request

```json
{
  "fileKey": "bAInners/mi-tienda.myshopify.com/abc123-banner.png"
}
```

También acepta `key`, `path` o `imageKey`, y acepta una URL completa (extrae
la clave).

### Response

```json
{
  "success": true,
  "action": "delete",
  "key": "bAInners/mi-tienda.myshopify.com/abc123-banner.png",
  "imageUrl": "https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/bAInners/mi-tienda.myshopify.com/abc123-banner.png"
}
```

---

## Poll de estado

```
POST {N8N_WEBHOOK_IMAGE_STATUS}
```

```json
{ "shop": "mi-tienda.myshopify.com", "taskId": "a9530a3d..." }
```

Cuando la tarea termina, n8n **descarga la imagen de KIE, la sube al bucket de
Spaces** y devuelve la URL del CDN:

```json
{
  "success": true,
  "state": "success",
  "imageUrl": "https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/bAInners/...",
  "cdnUrl": "https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com/bAInners/...",
  "filename": "a9530a3d-image_abc.png",
  "key": "bAInners/mi-tienda.myshopify.com/a9530a3d-image_abc.png",
  "taskId": "a9530a3d..."
}
```

Esto garantiza que las imágenes generadas persisten en el bucket del
cliente y no dependan de la URL temporal del proveedor de IA.

---

## Configuración de n8n

Variables en `/srv/n8n/.env`:

```
SPACES_ACCESS_KEY=...
SPACES_SECRET_KEY=...
SPACES_ENDPOINT=https://cdn-orivisdev.nyc3.cdn.digitaloceanspaces.com
SPACES_BUCKET=cdn-orivisdev
KIE_API_KEY=...
AUTOMATIONS_TOKEN=...
```

La credencial de n8n (`DigitalOcean Spaces cdn-orivisdev`) debe apuntar al
mismo bucket y tener permisos de lectura y escritura.
