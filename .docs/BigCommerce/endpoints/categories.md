# Endpoint — Categories

**Base path:** `/v3/catalog/categories`  
**Service:** `src/services/bigcommerce/category.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-catalog/categories

---

## getList — List Categories

```js
const { getList } = require("./services/bigcommerce/category.service");

const result = await getList({ limit: 250, page: 1 });
// result.data → array of category objects
// result.meta → pagination info
```

**GET** `/v3/catalog/categories`

| Query Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page (max 250, default 50) |
| `page` | number | Page number |
| `name` | string | Filter by exact category name |
| `name:like` | string | Partial name match |
| `parent_id` | number | Filter by parent category (0 = root) |
| `is_visible` | boolean | Filter by visibility |

---

## getOne — Get Single Category

```js
const { getOne } = require("./services/bigcommerce/category.service");

const result = await getOne(categoryId);
// result.data → category object
```

**GET** `/v3/catalog/categories/{categoryId}`

---

## create — Create Category

```js
const { create } = require("./services/bigcommerce/category.service");

const result = await create({
  name: "Disposables",
  parent_id: 0,
  is_visible: true,
});
// result.data → created category object
```

**POST** `/v3/catalog/categories`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Category name |
| `parent_id` | number | Yes | Parent category ID; `0` for root |
| `is_visible` | boolean | No | Storefront visibility (default `true`) |
| `description` | string | No | HTML description |
| `page_title` | string | No | SEO page title |
| `meta_keywords` | string[] | No | SEO meta keywords |
| `meta_description` | string | No | SEO meta description |
| `custom_url` | object | No | `{ url: "/disposables", is_customized: true }` |
| `sort_order` | number | No | Display order among siblings |

> **Hierarchy note:** BC categories are a tree. Shopify `productType` uses the format `"Parent - Child"` — split on ` - ` and create/lookup the parent first before creating the child.

---

## update — Update Category

```js
const { update } = require("./services/bigcommerce/category.service");

const result = await update(categoryId, { is_visible: false });
// result.data → updated category object
```

**PUT** `/v3/catalog/categories/{categoryId}`

Send only the fields to change.

---

## remove — Delete Category

```js
const { remove } = require("./services/bigcommerce/category.service");

await remove(categoryId);
// Returns 204 No Content
```

**DELETE** `/v3/catalog/categories/{categoryId}`

> **Warning:** Deleting a category removes it from all products assigned to it. Products are not deleted.
