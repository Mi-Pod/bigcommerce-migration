# Endpoint — Products

**Base path:** `/v3/catalog/products`  
**Service:** `src/services/bigcommerce/product.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-catalog/products

---

## getList — List Products

```js
const { getList } = require("./services/bigcommerce/product.service");

const result = await getList({ limit: 5, page: 1 });
// result.data  → array of product objects
// result.meta  → pagination info
```

**GET** `/v3/catalog/products`

| Query Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page (max 250, default 50) |
| `page` | number | Page number |
| `name` | string | Filter by product name |
| `sku` | string | Filter by SKU |
| `is_visible` | boolean | Filter by visibility |
| `include` | string | Comma-separated sub-resources (e.g. `variants,images`) |

---

## getOne — Get Single Product

```js
const { getOne } = require("./services/bigcommerce/product.service");

const result = await getOne(productId);
// result.data → product object
```

**GET** `/v3/catalog/products/{product_id}`

---

## create — Create Product

```js
const { create } = require("./services/bigcommerce/product.service");

const result = await create({
  name: "My Product",
  type: "physical",
  sku: "MP-001",
  price: 19.99,
  weight: 1.0,
});
// result.data → created product object
```

**POST** `/v3/catalog/products`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Product name |
| `type` | string | Yes | `physical` or `digital` |
| `price` | number | Yes | Sale price |
| `weight` | number | Yes (physical) | Weight in store units |
| `sku` | string | No | Stock keeping unit |
| `description` | string | No | HTML description |
| `is_visible` | boolean | No | Storefront visibility (default `false`) |

---

## update — Update Product

```js
const { update } = require("./services/bigcommerce/product.service");

const result = await update(productId, { price: 24.99, is_visible: true });
// result.data → updated product object
```

**PUT** `/v3/catalog/products/{product_id}`

Only send fields you want to change — unspecified fields are left unchanged.

---

## remove — Delete Product

```js
const { remove } = require("./services/bigcommerce/product.service");

await remove(productId);
// Returns 204 No Content on success
```

**DELETE** `/v3/catalog/products/{product_id}`

> **Warning:** Deletion is permanent and cannot be undone. The product and all its variants will be removed.
