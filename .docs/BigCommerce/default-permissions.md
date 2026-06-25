# BigCommerce API — Required Permissions

## Where to set these

**BigCommerce Admin → Settings → API → Store-level API Accounts**

Create or edit the API account tied to `BIGCOMMERCE_CLIENT_ACCESS_TOKEN` in `.env`.  
Each row below is a scope in the **OAuth Scopes** section on that page.

> After saving, BigCommerce generates a **new access token** — update `.env` immediately.

---

## Required Scopes

Scope names and values match the BigCommerce UI exactly.

| Scope | Value | Reason |
|---|---|---|
| **Customers** | modify | Customer CRUD, customer group CRUD, price list linking |
| **Marketing** | modify | Price Lists and price list records |
| **Products** | modify | Products, variants, brands, categories, images |
| **Store Locations** | read-only | Read inventory locations (`GET /v3/inventory/locations`) |
| **Store Inventory** | modify | Read and adjust inventory levels |
| **Metafield Ownership** | manage | Create and manage metafields on products |
| **Metafields Access** | full | Read and write metafield values |

All other scopes: **None** (or default).

---

## Per-Scope Breakdown

### Customers — modify

| Endpoint | Used In |
|---|---|
| `GET/POST/PUT/DELETE /v3/customers` | `customer.service.js` |
| `GET/POST/PUT/DELETE /v2/customer_groups` | `customer-group.service.js` |
| `GET/PUT /v2/customer_groups/{id}` | `migrate.js` (links price list to group) |

### Marketing — modify

| Endpoint | Used In |
|---|---|
| `GET/POST /v3/pricelists` | `migrate.js` |
| `PUT /v3/pricelists/{id}/records` | `migrate.js` |

> **Plan note:** Price Lists are an Enterprise-tier feature. If `/v3/pricelists` returns 403, the current plan does not include this feature.

### Products — modify

| Endpoint | Used In |
|---|---|
| `GET/POST/PUT/DELETE /v3/catalog/products` | `product.service.js` |
| `GET/POST/DELETE /v3/catalog/products/{id}/images` | `image.service.js` |
| `GET/POST/PUT/DELETE /v3/catalog/brands` | `brand.service.js` |
| `GET/POST/PUT/DELETE /v3/catalog/categories` | `category.service.js` |

### Store Locations — read-only

| Endpoint | Used In |
|---|---|
| `GET /v3/inventory/locations` | `inventory.service.js` |

### Store Inventory — modify

| Endpoint | Used In |
|---|---|
| `GET /v3/inventory/items` | `inventory.service.js` |
| `PUT /v3/inventory/adjustments/absolute` | `inventory.service.js` |
| `POST /v3/inventory/adjustments/relative` | `inventory.service.js` |

### Metafield Ownership — manage

| Endpoint | Used In |
|---|---|
| `POST /v3/catalog/products/{id}/metafields` | `migrate.js` |

### Metafields Access — full

Required alongside Metafield Ownership to read and write metafield values (not just manage ownership).

---

## Changelog

| Date | Change | Reason |
|---|---|---|
| 2026-06-24 | Added **Products** modify | Product/variant/brand/category/image CRUD |
| 2026-06-24 | Added **Customers** modify | Customer and customer group CRUD, price list linking |
| 2026-06-24 | Added **Marketing** modify | Price Lists for per-group wholesale pricing |
| 2026-06-24 | Added **Store Locations** read-only | Read inventory locations |
| 2026-06-24 | Added **Store Inventory** modify | Inventory level reads and adjustments |
| 2026-06-24 | Added **Metafield Ownership** manage | Create and own metafields on catalog products |
| 2026-06-24 | Added **Metafields Access** full | Read and write metafield values during migration |
