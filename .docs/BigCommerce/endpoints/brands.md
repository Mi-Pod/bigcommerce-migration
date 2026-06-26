# Endpoint — Brands

**Base path:** `/v3/catalog/brands`  
**Service:** `src/services/bigcommerce/brand.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-catalog/brands

---

## getList — List Brands

```js
const { getList } = require("./services/bigcommerce/brand.service");

const result = await getList({ limit: 250, page: 1 });
// result.data → array of brand objects
// result.meta → pagination info
```

**GET** `/v3/catalog/brands`

| Query Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page (max 250, default 50) |
| `page` | number | Page number |
| `name` | string | Filter by exact brand name |
| `name:like` | string | Partial name match |

---

## getOne — Get Single Brand

```js
const { getOne } = require("./services/bigcommerce/brand.service");

const result = await getOne(brandId);
// result.data → brand object
```

**GET** `/v3/catalog/brands/{brandId}`

---

## create — Create Brand

```js
const { create } = require("./services/bigcommerce/brand.service");

const result = await create({ name: "Foger" });
// result.data → created brand object
```

**POST** `/v3/catalog/brands`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Brand name — must be unique |
| `page_title` | string | No | SEO page title |
| `meta_keywords` | string[] | No | SEO meta keywords |
| `meta_description` | string | No | SEO meta description |
| `image_url` | string | No | Brand logo URL |
| `custom_url` | object | No | `{ url: "/brands/foger", is_customized: true }` |

---

## update — Update Brand

```js
const { update } = require("./services/bigcommerce/brand.service");

const result = await update(brandId, { name: "Foger Co." });
// result.data → updated brand object
```

**PUT** `/v3/catalog/brands/{brandId}`

Send only the fields to change.

---

## remove — Delete Brand

```js
const { remove } = require("./services/bigcommerce/brand.service");

await remove(brandId);
// Returns 204 No Content
```

**DELETE** `/v3/catalog/brands/{brandId}`

> **Warning:** Deleting a brand does not delete its products. Products become brandless (`brand_id: 0`).
