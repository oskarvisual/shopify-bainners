# 🧠 bAInners – AI Image Banners

[Sitio oficial de Orivis](https://orivisdev.shop/)

App de Shopify para crear, gestionar y mostrar banners inteligentes y responsivos usando imágenes generadas con IA o subidas por el usuario.

## 🎯 Características Principales

- **Generación de imágenes con IA** - Crea banners profesionales con prompts simples
- **Gestión de imágenes** - Sube tus propias imágenes o usa las de tus productos de Shopify
- **Estilos personalizados** (Ultra) - Crea presets de estilo para mantener branding consistente
- **Analytics** (Pro+) - Visualizaciones, clicks y CTR de tus banners
- **Límite por almacenamiento** - Planes basados en GB (imágenes generadas + subidas)
- **Integración con Theme Editor** - Usa tus banners en cualquier parte de tu tienda

## 🏗️ Arquitectura

```
┌─────────────────┐
│  Shopify Store  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│   bAInners App (Remix)      │
│  - UI/UX                    │
│  - Auth & Session           │
│  - Database (MySQL)         │
│  - Business Logic           │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   n8n Webhooks              │
│  - AI Image Generation      │
│  - S3 Upload & Optimization │
│  - Image Processing         │
└────────┬────────────────────┘
         │
         ├─────────────┬───────────────┐
         ▼             ▼               ▼
   ┌─────────┐  ┌──────────┐  ┌───────────┐
   │ AI APIs │  │ DO Spaces│  │  Shopify  │
   │ (DALL-E)│  │   (S3)   │  │   APIs    │
   └─────────┘  └──────────┘  └───────────┘
```

### Flujo de Imágenes

1. **Imágenes generadas con IA**: App → n8n → AI API → S3 → App
2. **Imágenes subidas por usuario**: App → n8n → S3 → App
3. **Imágenes de productos Shopify**: App usa URL directamente (no se suben a S3)

## 🛠️ Tech Stack

- **Framework**: [Remix](https://remix.run) (React Router)
- **Database**: MySQL (Prisma ORM)
- **UI**: [Shopify Polaris](https://polaris.shopify.com)
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Automation**: n8n (webhooks)
- **AI Integration**: Via n8n (flexible)

## 📦 Database Schema

### Modelos principales

- `Shop` - Información de la tienda, plan, uso de almacenamiento
- `Banner` - Banners con configuración completa (layout, CTA, texto, programación)
- `BannerImage` - Imágenes con tracking de tamaño y origen
- `Style` - Presets de estilo personalizados (feature Ultra)
- `GenerationRequest` - Tracking de solicitudes de generación con IA
- `BannerAnalytic` - Métricas de views, clicks y CTR (feature Pro+)

Ver `prisma/schema.prisma` para detalles completos.

## 🚀 Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env` y configura:

```bash
cp .env.example .env
```

Variables requeridas:
- `SHOPIFY_API_KEY` - API key de tu app de Shopify
- `SHOPIFY_API_SECRET` - API secret
- `DATABASE_URL` - Conexión a MySQL local
- `N8N_WEBHOOK_IMAGE_PROCESSOR` - URL del webhook de n8n
- `N8N_TOKEN` - Token de autenticación para n8n
- `SPACES_*` - Credenciales de DigitalOcean Spaces

### 3. Crear y migrar la base de datos

```bash
# Crear la base de datos
mysql -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE bainners;"

# Ejecutar migraciones
npm run setup
```

### 4. Iniciar servidor de desarrollo

```bash
npm run dev
```

## 🔗 Integración con n8n

La app se comunica con n8n mediante un webhook unificado que maneja:
- Generación de imágenes con IA
- Upload de imágenes a S3
- Optimización de imágenes

Ver `docs/n8n-webhook-contract.md` para el contrato completo del API.

### Ejemplo de uso

```typescript
import { generateImageWithAI } from "~/utils/n8n.server";

const result = await generateImageWithAI({
  shopId: shop.id,
  requestId: generationRequest.id,
  prompt: "Modern athletic shoes in outdoor setting",
  format: "16:9",
  dimensions: "1920x800",
  variantsCount: 3,
});
```

## 📊 Planes

| Feature | Free | Pro | Ultra |
|---------|------|-----|-------|
| Almacenamiento | 1 GB | 10 GB | 50 GB |
| Banners activos | Ilimitados | Ilimitados | Ilimitados |
| Analytics | ❌ | ✅ | ✅ |
| Estilos personalizados | ❌ | ❌ | ✅ |
| A/B Testing | ❌ | ❌ | ✅ |

## 📁 Estructura del Proyecto

```
├── app/
│   ├── routes/           # Rutas de Remix (páginas y APIs)
│   ├── utils/            # Utilidades (n8n.server.ts, etc.)
│   ├── shopify.server.ts # Configuración de Shopify App
│   └── db.server.ts      # Cliente de Prisma
├── docs/                 # Documentación técnica
├── prisma/
│   ├── schema.prisma     # Schema de base de datos
│   └── migrations/       # Migraciones
├── extensions/           # Theme extensions (future)
└── public/               # Assets estáticos
```

## 🎨 Flujo de Creación de Banner

1. Usuario selecciona estilo (system o custom)
2. Configura contexto del banner (producto, colección)
3. Escribe prompt describiendo lo que quiere
4. Selecciona imagen de referencia (opcional):
   - Imágenes de productos Shopify
   - Subir imagen propia
   - Sin referencia (generación libre)
5. Define formato y dimensiones
6. Configura texto y CTA
7. Genera variantes (2-4)
8. Selecciona variante favorita
9. Publica banner en Theme Editor

## 🔐 Seguridad

- OAuth con Shopify
- Session storage con Prisma
- Token de autenticación para n8n webhooks
- Validación de prompts anti-injection (en n8n)
- CDN para servir imágenes

## 📝 Scripts

```bash
npm run dev          # Desarrollo con Shopify CLI
npm run build        # Build para producción
npm run start        # Servidor de producción
npm run setup        # Generar Prisma client y migrar DB
npm run deploy       # Deploy a Shopify
```

## 🐛 Troubleshooting

### Base de datos no existe
```bash
mysql -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE bainners;"
npx prisma migrate dev
```

### n8n webhook no responde
Verifica que:
1. El webhook esté activo en n8n
2. El token `N8N_TOKEN` sea correcto
3. La URL `N8N_WEBHOOK_IMAGE_PROCESSOR` sea accesible

### Problemas con OAuth
```bash
npm run deploy
```

## 📚 Recursos

- [Shopify App Remix Docs](https://shopify.dev/docs/api/shopify-app-remix)
- [Prisma Docs](https://www.prisma.io/docs)
- [n8n Docs](https://docs.n8n.io)
- [DigitalOcean Spaces Docs](https://docs.digitalocean.com/products/spaces/)

## 🤝 Contribuir

Este repositorio es público y sirve como referencia del proyecto. Para dudas, propuestas o reportes, abre un issue o contacta al equipo desde el [sitio oficial de Orivis](https://orivisdev.shop/).

## 📄 Licencia

Actualmente el código se publica sin una licencia open source explícita. Todos los derechos quedan reservados salvo indicación distinta del propietario.
