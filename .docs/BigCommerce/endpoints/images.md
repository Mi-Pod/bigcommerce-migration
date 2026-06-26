# Endpoint — Product Images

**Base path:** `/v3/catalog/products/{productId}/images`  
**Service:** `src/services/bigcommerce/image.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-catalog/products/images

---

## getList — List Product Images

```js
const { getList } = require("./services/bigcommerce/image.service");

const result = await getList(productId);
// result.data → array of image objects
```

**GET** `/v3/catalog/products/{productId}/images`

---

## create — Add Image by URL

```js
const { create } = require("./services/bigcommerce/image.service");

const result = await create(productId, {
  image_url: "https://cdn.shopify.com/s/files/.../image.jpg",
  description: "Alt text here",
  is_thumbnail: true,
  sort_order: 0,
});
// result.data → created image object with BC-assigned `id` and `url_standard`
```

**POST** `/v3/catalog/products/{productId}/images`

| Field | Type | Required | Description |
|---|---|---|---|
| `image_url` | string | Yes* | Publicly accessible URL — BC fetches and stores the image |
| `image_file` | file | Yes* | Multipart upload alternative to `image_url` |
| `description` | string | No | Alt text (maps from Shopify `altText`) |
| `is_thumbnail` | boolean | No | Sets as the primary product image; only one allowed per product |
| `sort_order` | number | No | Display order — lower numbers appear first |

> *One of `image_url` or `image_file` is required.

**Migration pattern:** Pass Shopify CDN URLs directly — BC fetches and re-hosts them. Set `is_thumbnail: true` and `sort_order: 0` on the first image (index 0).

---

## remove — Delete Image

```js
const { remove } = require("./services/bigcommerce/image.service");

await remove(productId, imageId);
// Returns 204 No Content
```

**DELETE** `/v3/catalog/products/{productId}/images/{imageId}`

---

## Image Object Shape (Response)

```json
{
  "id": 42,
  "product_id": 1,
  "is_thumbnail": true,
  "sort_order": 0,
  "description": "Alt text",
  "image_file": "p/filename.jpg",
  "url_zoom": "https://cdn11.bigcommerce.com/.../filename.jpg",
  "url_standard": "https://cdn11.bigcommerce.com/.../filename.jpg",
  "url_thumbnail": "https://cdn11.bigcommerce.com/.../filename.jpg",
  "url_tiny": "https://cdn11.bigcommerce.com/.../filename.jpg",
  "date_modified": "2024-01-01T00:00:00+00:00"
}
```

> BC generates multiple size variants (`zoom`, `standard`, `thumbnail`, `tiny`) automatically after upload.
