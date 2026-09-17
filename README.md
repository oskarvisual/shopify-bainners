# 🧠 bAInners – AI Image Banners

[Official Orivis website](https://orivisdev.shop/)

Shopify app for creating, managing, and displaying intelligent, responsive banners using AI-generated or user-uploaded images.

## 🎯 Key Features

- **AI image generation** - Create professional banners with simple prompts
- **Image management** - Upload your own images or use images from your Shopify products
- **Custom styles** (Ultra) - Create style presets for consistent branding
- **Analytics** (Pro+) - Track banner views, clicks, and CTR
- **Storage limits** - Plans based on GB (generated and uploaded images)
- **Theme Editor integration** - Use your banners anywhere in your store

## 🏗️ Architecture

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

### Image Flow

1. **AI-generated images**: App → n8n → AI API → S3 → App
2. **User-uploaded images**: App → n8n → S3 → App
3. **Shopify product images**: The app uses the URL directly (not uploaded to S3)

## 🛠️ Tech Stack

- **Framework**: [Remix](https://remix.run) (React Router)
- **Database**: MySQL (Prisma ORM)
- **UI**: [Shopify Polaris](https://polaris.shopify.com)
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Automation**: n8n (webhooks)
- **AI Integration**: Via n8n (flexible)

## 📦 Database Schema

### Main models

- `Shop` - Store information, plan, and storage usage
- `Banner` - Banners with complete configuration (layout, CTA, text, scheduling)
- `BannerImage` - Images with size and source tracking
- `Style` - Custom style presets (Ultra feature)
- `GenerationRequest` - AI generation request tracking
- `BannerAnalytic` - View, click, and CTR metrics (Pro+ feature)

See `prisma/schema.prisma` for complete details.

## 🚀 Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and configure it:

```bash
cp .env.example .env
```

Required variables:
- `SHOPIFY_API_KEY` - API key de tu app de Shopify
- `SHOPIFY_API_SECRET` - API secret
- `DATABASE_URL` - Conexión a MySQL local
- `N8N_WEBHOOK_IMAGE_PROCESSOR` - URL del webhook de n8n
- `N8N_TOKEN` - Token de autenticación para n8n
- `SPACES_*` - Credenciales de DigitalOcean Spaces

### 3. Create and migrate the database

```bash
# Create the database
mysql -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE bainners;"

# Run migrations
npm run setup
```

### 4. Start the development server

```bash
npm run dev
```

## 🔗 n8n Integration

The app communicates with n8n through a unified webhook that handles:
- AI image generation
- Image uploads to S3
- Image optimization

Ver `docs/n8n-webhook-contract.md` para el contrato completo del API.

### Usage example

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

## 📊 Plans

| Feature | Free | Pro | Ultra |
|---------|------|-----|-------|
| Storage | 1 GB | 10 GB | 50 GB |
| Banners activos | Ilimitados | Ilimitados | Ilimitados |
| Analytics | ❌ | ✅ | ✅ |
| Custom styles | ❌ | ❌ | ✅ |
| A/B Testing | ❌ | ❌ | ✅ |

## 📁 Project Structure

```
├── app/
│   ├── routes/           # Remix routes (pages and APIs)
│   ├── utils/            # Utilities (n8n.server.ts, etc.)
│   ├── shopify.server.ts # Shopify app configuration
│   └── db.server.ts      # Prisma client
├── docs/                 # Technical documentation
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Migrations
├── extensions/           # Theme extensions
└── public/               # Static assets
```

## 🎨 Banner Creation Flow

1. The user selects a style (system or custom)
2. Configures the banner context (product or collection)
3. Writes a prompt describing the desired result
4. Selects an optional reference image:
   - Shopify product image
   - Upload a custom image
   - No reference (free generation)
5. Defines the format and dimensions
6. Configures the text and CTA
7. Generates variants (2–4)
8. Selects a favorite variant
9. Publishes the banner in the Theme Editor

## 🔐 Security

- Shopify OAuth
- Prisma session storage
- Authentication token for n8n webhooks
- Anti-injection prompt validation (in n8n)
- CDN-based image delivery

## 📝 Scripts

```bash
npm run dev          # Development with Shopify CLI
npm run build        # Production build
npm run start        # Production server
npm run setup        # Generate Prisma client and migrate the database
npm run deploy       # Deploy to Shopify
```

## 🐛 Troubleshooting

### Database does not exist
```bash
mysql -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE bainners;"
npx prisma migrate dev
```

### The n8n webhook does not respond
Verify that:
1. The webhook is active in n8n
2. The `N8N_TOKEN` value is correct
3. The `N8N_WEBHOOK_IMAGE_PROCESSOR` URL is reachable

### OAuth issues
```bash
npm run deploy
```

## 📚 Resources

- [Shopify App Remix Docs](https://shopify.dev/docs/api/shopify-app-remix)
- [Prisma Docs](https://www.prisma.io/docs)
- [n8n Docs](https://docs.n8n.io)
- [DigitalOcean Spaces Docs](https://docs.digitalocean.com/products/spaces/)

## 🤝 Contributing

This repository is public and serves as a project reference. For questions, proposals, or bug reports, open an issue or contact the team through the [official Orivis website](https://orivisdev.shop/).

## 📄 License

The code is currently published without an explicit open-source license. All rights reserved unless otherwise stated by the owner.
