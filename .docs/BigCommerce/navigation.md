# Navigation — BigCommerce

BigCommerce does not have a separate "menu" object. **The category tree is the navigation.** Top-level categories (`parent_id: 0`) become the primary nav items in the storefront; sub-categories appear as dropdowns under them.

`sort_order` controls display order within each level. `is_visible: false` hides a category from the nav without deleting it.

---

## API Endpoints

| Action | Method | Path |
|---|---|---|
| Get category tree (nested) | GET | `/v2/catalog/categories/tree` |
| Get flat category list | GET | `/v3/catalog/categories` |
| Get single category | GET | `/v3/catalog/categories/{id}` |
| Create category | POST | `/v3/catalog/categories` |
| Update category | PUT | `/v3/catalog/categories/{id}` |
| Delete category | DELETE | `/v3/catalog/categories/{id}` |

**Service:** `src/services/bigcommerce/category.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-catalog/categories

---

## Key Fields

| Field | Type | Notes |
|---|---|---|
| `id` | number | Unique category ID |
| `parent_id` | number | `0` = top-level nav item |
| `name` | string | Display name in storefront nav |
| `sort_order` | number | Order within the same level; lower = first |
| `is_visible` | boolean | Show in storefront nav and category pages |
| `url.path` | string | Canonical URL slug (e.g. `/disposables/`) |
| `description` | string | HTML description shown on category page |
| `image_url` | string | Banner image for the category page |

---

## Get the Category Tree

Use `/v2/catalog/categories/tree` to get the full nested structure in one call. Returns an array of top-level categories, each with a `children` array of sub-categories.

```js
const { makeRequest } = require("./api/bigcommerce");

const getTree = async () => {
  const result = await makeRequest("GET", "/v2/catalog/categories/tree");
  return result; // array of top-level category nodes with nested `children`
};
```

**Response shape:**

```json
[
  {
    "id": 18,
    "parent_id": 0,
    "name": "Disposables",
    "is_visible": true,
    "url": "/disposables/",
    "children": [
      {
        "id": 24,
        "parent_id": 18,
        "name": "Foger Bit",
        "is_visible": true,
        "url": "/disposables/foger-bit/",
        "children": []
      }
    ]
  }
]
```

---

## Get Top-Level Nav Items Only

Use `/v3/catalog/categories` with `parent_id=0` to fetch only the top-level categories (the primary nav bar).

```js
const { getList } = require("./services/bigcommerce/category.service");

const getTopLevel = async () => {
  const result = await getList({ parent_id: 0 });
  return result.data; // sorted by sort_order ascending
};
```

---

## Create / Reorder

```js
const { create, update } = require("./services/bigcommerce/category.service");

// Create a top-level nav item
const nav = await create({
  name: "Disposables",
  parent_id: 0,
  sort_order: 1,
  is_visible: true,
});

// Create a sub-category (dropdown item)
const sub = await create({
  name: "Foger Bit",
  parent_id: nav.data.id,
  sort_order: 0,
  is_visible: true,
});

// Reorder nav item
await update(nav.data.id, { sort_order: 3 });
```

---

## Migration Notes

To reconstruct Shopify navigation in BigCommerce:

- Shopify top-level menu items (type `COLLECTION`) → BC categories with `parent_id: 0`
- Shopify nested items (dropdown rows) → BC sub-categories with `parent_id` set to the parent's BC `id`
- `sort_order` should mirror the order items appear in the Shopify menu
- `is_visible: true` must be set explicitly — it defaults to `false` on new categories

> **Note:** Product `category_ids` in BigCommerce determines which category pages a product appears on, but navigation structure is controlled independently by the category tree hierarchy. A product can be assigned to a sub-category without being assigned to the parent.

---

## Migration Execution

Script: `src/scripts/migrate-navigation.js`  
Routes: `POST /api/migrate/navigation/migrate` and `POST /api/migrate/navigation/reset`

### Two-Pass Creation Order

Categories must be created parent-first. The script splits `composed-nav.json` into two groups and processes them sequentially:

1. **Pass 1** — top-level categories (`parent_id === 0`). Each created category's BC `id` is stored in a `refToId` map keyed by `_ref`.
2. **Pass 2** — nested categories. The `parent_id` field in `composed-nav.json` is a template string (`"{{kits}}"`) that is resolved to the real BC ID via `refToId` before the API call.

Template resolution: `cat.parent_id.replace(/\{\{|\}\}/g, "")` extracts the ref key.

### Output Files

| File | Written by | Contents |
|---|---|---|
| `migration/nav-backup.json` | `migrateNavigation` | All BC categories that existed **before** migration |
| `migration/migrated-navigation.json` | `migrateNavigation` | `{ _ref, bc_id, name, parent_bc_id }` for every created category |

### Undo / Reset Safety Model

`resetNavigation` deletes categories in reverse creation order (children before parents). It loads `nav-backup.json` and builds a `preExisting` Set — any BC ID found in that set is **skipped**, ensuring pre-migration categories are never touched.

---

## Nav Items Requiring Special Handling

Identified from `migration/nav-validation.json`. Items that cannot become BC categories are captured in `migration/composed-nav.json` → `skipped[]`.

| Item(s) | Shopify Type | Count | BC Handling |
|---|---|---|---|
| "2.0 Replacement Pods", "Pro Pods" | `PRODUCT` | 2 | Direct product links — cannot be a BC category. Use a featured product widget or custom link. |
| "Hardware Compatibility" | `ARTICLE` | 1 | Blog article. Create equivalent BC Blog post; link via custom theme nav. |
| "Caliburn Pods" | `HTTP` (external URL) | 1 | External link (`mipodwholesale.com`). Custom theme nav link or BC Page. |
| "Vendors" section (5 sub-items) | `HTTP` | 5 | Non-product nav (vendor support, site features). Omit from BC category tree; handle as BC Pages or theme links if needed. |
| "Energy" section (Caffeine Pouches, Energy Drinks) | `HTTP` | 2 | Placeholder section — no collections exist yet. Created as `is_visible: false` categories; flip visible when products are added. |
| ~50 `#` stub sub-items ("By Type", "By Brand", etc.) | `HTTP` | ~50 | These were UX grouping labels in Shopify (non-navigable). In BC they become real empty category pages. BC renders empty categories with a sub-category tile grid — acceptable behavior, no theme change needed. |

---

## Backlog

- Once BC category IDs are assigned after creation, update `composed-nav.json` entries to replace `{{_ref}}` placeholders with real `parent_id` values
- If a Shopify collection doesn't map 1:1 to a BC category name, a manual mapping table will be needed
