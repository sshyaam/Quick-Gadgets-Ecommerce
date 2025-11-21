# Setting Up R2 Bucket for Product Images

This guide explains how to set up the Cloudflare R2 bucket for storing product images.

## Prerequisites

- Cloudflare account with R2 enabled
- Wrangler CLI installed: `npm install -g wrangler`
- Logged in to Cloudflare: `wrangler login`

## Create R2 Bucket

```bash
wrangler r2 bucket create product-images
```

This creates a bucket named `product-images` which matches the configuration in `wrangler.catalogworker.toml`.

## Verify Bucket

```bash
wrangler r2 bucket list
```

You should see `product-images` in the list.

## Configure CORS (Optional)

If you need to access images directly from the frontend domain, you may need to configure CORS:

1. Go to Cloudflare Dashboard → R2 → product-images bucket
2. Settings → CORS Policy
3. Add your frontend domain to allowed origins

## Image Storage Structure

Images are stored in R2 with the following structure:
- Path: `products/{uuid}.{ext}`
- Example: `products/123e4567-e89b-12d3-a456-426614174000.jpg`

## Image URLs

Images are served through the catalog worker at:
- `https://catalog-worker.shyaamdps.workers.dev/images/products/{uuid}.{ext}`

## Admin Image Upload

Only authenticated admin users can upload images via:
- `POST /admin/images/upload` (multipart/form-data with 'image' field)

## Public Image Access

Images are publicly accessible through:
- `GET /images/products/{uuid}.{ext}`

## Image Deletion

Only authenticated admin users can delete images via:
- `DELETE /admin/images/products/{uuid}.{ext}`

## Migration from Base64

If you have existing products with base64-encoded images:

1. Update those products in the admin panel
2. Upload images using the new R2 upload feature
3. The images will be automatically converted to R2 URLs

