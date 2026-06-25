# Image Migration — Shopify CDN → BigCommerce CDN

## Overview

Shopify images are publicly accessible via their CDN URLs (no auth required). BigCommerce accepts images either as a remote URL it fetches itself, or as a multipart file upload. Both routes are implemented in `src/services/bigcommerce/image.service.js`.

---

## The Two Strategies

### Strategy 1 — URL Passthrough (recommended for migration)

Pass the Shopify CDN URL directly to BigCommerce. BC fetches the image and stores it on its own CDN. This is the simplest approach and requires no intermediate file handling.

**Endpoint:** `POST /v3/catalog/products/{product_id}/images`

```json
{
  "image_url": "https://cdn.shopify.com/s/files/1/.../image.jpg",
  "description": "Alt text",
  "is_thumbnail": true,
  "sort_order": 0
}
```

**Response** contains BC CDN URLs:
```json
{
  "data": {
    "id": 123,
    "product_id": 456,
    "is_thumbnail": true,
    "sort_order": 0,
    "description": "Alt text",
    "image_file": "p/abc123.jpg",
    "url_zoom":     "https://cdn11.bigcommerce.com/s-xxx/images/stencil/1280x1280/products/456/123/image.jpg",
    "url_standard": "https://cdn11.bigcommerce.com/s-xxx/images/stencil/386x513/products/456/123/image.jpg",
    "url_thumbnail":"https://cdn11.bigcommerce.com/s-xxx/images/stencil/123x164/products/456/123/image.jpg",
    "url_tiny":     "https://cdn11.bigcommerce.com/s-xxx/images/stencil/44x58/products/456/123/image.jpg"
  }
}
```

**Service call:**
```js
const { uploadFromUrl } = require("./services/bigcommerce/image.service");

const result = await uploadFromUrl(bcProductId, {
  image_url: "https://cdn.shopify.com/...",
  description: "Alt text",
  is_thumbnail: true,
  sort_order: 0,
});
// result.data.url_standard → BC CDN URL
```

---

### Strategy 2 — Download + Re-upload

Downloads the Shopify image as a buffer, then POSTs it as `multipart/form-data` to BigCommerce. Use this if you want images stored on BC's CDN before the Shopify store is shut down, or if source URLs may expire.

```js
const { uploadFromBuffer } = require("./services/bigcommerce/image.service");

const result = await uploadFromBuffer(bcProductId, "https://cdn.shopify.com/...", {
  description: "Alt text",
  is_thumbnail: true,
  sort_order: 0,
});
```

The service handles the axios GET → Buffer → FormData chain internally.

---

## Full Migration Pipeline

```
Shopify product (images[].url)
  │
  ├─ Create BC product (POST /v3/catalog/products) → bcProductId
  │
  └─ For each image:
       POST /v3/catalog/products/{bcProductId}/images
         { image_url: shopifyImageUrl, is_thumbnail: index === 0, sort_order: index }
           │
           └─ BC fetches + stores → returns url_standard, url_thumbnail, etc.
```

Images can also be passed inline in the product creation payload under the `images` array — BC will process them in the same way. The separate-call approach gives you the BC CDN URLs immediately for each image and is easier to retry on failure.

---

## Notes

- Images must be uploaded **after** the product is created (BC needs a valid `product_id`)
- The first image with `is_thumbnail: true` becomes the main product image
- Shopify CDN URLs are public and do not expire during the store's lifetime — URL passthrough is safe for an active migration
- `sort_order` controls display order in the BC storefront; mirror Shopify's `images` array order
- Image file formats supported by BC: JPG, PNG, GIF, WebP
