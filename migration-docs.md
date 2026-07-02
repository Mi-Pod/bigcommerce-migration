# Migration Documentation

Shopify → BigCommerce migration reference. Every API call requires a `site` code to identify the store pair being migrated. Phases have dependencies — run them in sequence per site.

---

## Store Pairs

| Site Code | Shopify Store | Shopify URL | Env Vars |
|-----------|--------------|-------------|----------|
| `B2B` | mi-one-com | mi-one-com.myshopify.com | `B2B_TOKEN`, `B2B_BIGCOMMERCE_STORE_HASH`, `B2B_BIGCOMMERCE_CLIENT_ACCESS_TOKEN` |
| `B2C` | smoking-vapor-consumer | smoking-vapor-consumer.myshopify.com | `B2C_TOKEN`, `B2C_BIGCOMMERCE_STORE_HASH`, `B2C_BIGCOMMERCE_CLIENT_ACCESS_TOKEN` |
| `VAP` | vaping-usa | vaping-usa.myshopify.com | `VAP_TOKEN`, `VAP_BIGCOMMERCE_STORE_HASH`, `VAP_BIGCOMMERCE_CLIENT_ACCESS_TOKEN` |
| `PCH` | mi-pouches | mi-pouches.myshopify.com | `PCH_TOKEN`, `PCH_BIGCOMMERCE_STORE_HASH`, `PCH_BIGCOMMERCE_CLIENT_ACCESS_TOKEN` |

The examples throughout this doc use `B2B`. Substitute the appropriate site code for each migration run.

---

## Environment Setup

Before running any phase, confirm the following are set in `.env` for your target site:

```bash
# Shared
SHOPIFY_API_VERSION=2024-01

# Per-site (example for B2B — repeat pattern for B2C, VAP, PCH)
B2B_TOKEN=<shopify_admin_api_token>
B2B_BIGCOMMERCE_STORE_HASH=<bc_store_hash>
B2B_BIGCOMMERCE_CLIENT_ACCESS_TOKEN=<bc_api_token>
```

The Shopify store name is hardcoded in `mipod-shopifyql` — only the token is read from env. The BigCommerce credentials are resolved at runtime by the `@mipod/bigcommerce` package using the `<SITE>_BIGCOMMERCE_*` naming convention.

---

## Order of Operations

### Phase 1 — Pre-Migration Setup

Generate the collection-visibility map before anything else. Products, navigation, and description URL rewrites all depend on it.

**1. Fetch all Shopify collections**
```
GET /api/migrate/shopify/collections?site=B2B
```
Output: `migration/data/shopify-collections.json`

**2. Extract and validate navigation menus**
```
GET /api/migrate/navigation/validate?site=B2B
```
Fetches both known menus (`dsk-nav-21` desktop, `sidebar-menu` mobile) and saves them to:
- `migration/nav-dsk-nav-21.json`
- `migration/nav-sidebar-menu.json`

**3. Map nav items to collections**
```
GET /api/migrate/shopify/nav-collection-map
```
Reads the two nav JSON files and `shopify-collections.json` — no `site` param needed, this is a local file operation.
Output: `migration/data/nav-collection-map.json`

**4. Generate collection-visibility map**
```
GET /api/migrate/shopify/collection-visibility-map?site=B2B
```
Compares Shopify collections against live BC categories to build the BC category ID lookup. Requires steps 1–3 to be complete first.
Output: `migration/data/collection-visibility-map.json`

**5. (Optional) Configure collection overrides**
Edit `migration/tasks/override.json` to control per-collection behavior before running products:
```json
{
  "collections": {
    "your-collection-handle": {
      "skip": true,
      "bc_id": 123,
      "bc_url": "/some-category",
      "is_visible": false
    }
  }
}
```

---

### Phase 2 — Navigation & Categories

Migrate the category tree before products so BC category IDs are stable.

**1. Compose the nav payload**
```
GET /api/migrate/navigation/compose
```
Reads the nav JSON files and builds `migration/composed-nav.json` — the input for the migration step.

**2. Migrate navigation**
```
POST /api/migrate/navigation/migrate
Body: { "site": "B2B" }
```
Reads `composed-nav.json` and creates BC categories from all COLLECTION-type menu items. Two-pass: top-level first, then nested with parent ID resolution.
Output: `migration/migrated-navigation.json`

**3. Validate the result**
```
GET /api/migrate/navigation/validate?site=B2B
GET /api/migrate/navigation/compare
```
`validate` re-fetches both Shopify menus and logs type breakdowns. `compare` diffs the composed nav against live BC categories. Review any mismatches before continuing.

**4. Reset if needed**
```
POST /api/migrate/navigation/reset
Body: { "site": "B2B" }
```
Deletes only the categories created by the migration (guarded by `nav-backup.json`). Only safe to run before products are migrated.

---

### Phase 3 — Products

Requires: Phase 1 collection-visibility map and Phase 2 category IDs. Brands are created on-the-fly from the Shopify `vendor` field.

**1. Check total count**
```
GET /api/migrate/products/count?site=B2B
```

**2. Test with a single product**
```
POST /api/migrate/products/single
Body: { "site": "B2B", "shopifyProductId": "gid://shopify/Product/123" }
```
Inspect the output at `migration/migrated_{bc_product_id}.json` before running bulk.

**3. Run bulk migration**
```
POST /api/migrate/products/bulk
Body: {
  "site": "B2B",
  "batch_size": 10,
  "skip": 0,
  "max_batches": 0
}
```
- `batch_size`: Products per Shopify page (default 10)
- `skip`: Skip the first N products, useful for resuming a partial run
- `max_batches`: Stop after N batches — `0` means run all

Output: `migration/bulk-import-results.json`

**What gets migrated per product:**
- Name, description (Shopify `/collections/{handle}` hrefs rewritten to BC category URLs), handle/custom URL, SEO title + description
- Images with sort order and thumbnail flagging
- Variants with physical options (size, color, etc.)
- Brand — looked up by name, created if missing
- Category assignments resolved from collection-visibility-map
- Metafields: `filter.*`, `order_limits.order_maximum`, `custom.contains`
- Price lists per Customer Price Group (CPG) option, linked to BC customer groups via `src/config/customer-groups.js`

**Skipped automatically:** Archived Shopify products (`status === "ARCHIVED"`)

---

### Phase 4 — Customers

Independent of products — can run in parallel with Phase 3 once Phase 1 is complete.

**1. Check total count**
```
GET /api/migrate/customers/count?site=B2B
```

**2. Test with a single customer**
```
POST /api/migrate/customers/single
Body: { "site": "B2B", "shopifyCustomerId": "gid://shopify/Customer/123" }
```
Output: `migration/customers/migrated_{id}.json`

**3. Run bulk migration**
```
POST /api/migrate/customers/bulk
Body: {
  "site": "B2B",
  "batch_size": 50,
  "skip": 0,
  "max_batches": 0,
  "save": true
}
```
Output: `migration/customers/bulk-import-results.json`

**What gets migrated per customer:**
- Name, email, phone, company, email marketing consent
- Addresses — deduplicated and normalized; BC enforces a maximum of 10 per customer per API call
- Store credit balance (summed across all Shopify credit accounts)
- Metafields: `avatax_excise.*`, `adv_reg.EIN-Field`, `limits.exempt_order_limits`, `configuration.disable_cart_buttons`, `custom.purchasing_list_subscription`
- Customers are created with `force_reset: true` — they must set a new password on first login

**Skipped automatically:**
- DISABLED Shopify accounts
- Accounts with $0 lifetime spend created more than 6 months ago

**4. Re-sync addresses only (if needed)**
```
POST /api/migrate/customers/sync-addresses
Body: { "site": "B2B", "shopifyCustomerId": "gid://shopify/Customer/123" }
```
Pass `bcCustomerId` to skip the email lookup and write directly to a known BC customer.

---

### Phase 5 — Inventory

Inventory quantities are not pushed during product migration — this is a separate step after all products are live.

**1. Verify inventory locations**
```
GET /api/bigcommerce/inventory?site=B2B
```
Returns warehouse locations. Note the `location_id` values needed for steps below.

**2. (Optional) Wipe all quantities to zero**
```
GET /api/bigcommerce/inventory/wipe?site=B2B
```
Sets every SKU/location pair to 0. Use for a clean slate before importing real quantities.

**3. Set absolute quantities**
```
PUT /api/bigcommerce/inventory/absolute
Body: {
  "site": "B2B",
  "items": [
    { "sku": "ABC-123", "location_id": 1, "quantity": 50 },
    { "sku": "XYZ-456", "location_id": 1, "quantity": 12 }
  ]
}
```

**4. Or adjust by delta**
```
POST /api/bigcommerce/inventory/relative
Body: {
  "site": "B2B",
  "items": [
    { "sku": "ABC-123", "location_id": 1, "quantity": 5 }
  ]
}
```

**Note:** There is no automated pipeline that reads Shopify `inventoryQuantity` values and pushes them to BC in bulk. This step requires a manual data file or a script that reads the quantities captured during product export.

---

### Phase 6 — URL Redirects

Run after products and categories are live so all BC URLs are known.

**1. Export redirect CSV**
```
node src/scripts/export-redirects.js
```
This script reads from the local migration data files — no `site` param in the command. If migrating multiple stores, run it separately after each store's product migration completes and the migration data dir contains that store's results.

Output: `exports/redirects/url-redirects.csv`

Covers:
- `/products/{handle}` → BC product URL
- `/collections/{handle}` → BC category URL
- `/pages/{handle}` → BC page URL
- `/blogs/{blog}/{article}` → BC blog post URL

**2. Upload to BigCommerce**
Import the CSV via BC Admin → Store Setup → 301 Redirects, or POST each row to `/v2/redirects`. Review rows marked as unmapped (collections skipped or hidden via Phase 1 override config) before uploading.

---

### Phase 7 — Content Exports

Blog posts, pages, files, and metaobjects are exported from Shopify to local JSON/CSV. There is no automated BC import pipeline — publish manually in BC Admin after export.

**Export blog posts:**
```
POST /api/content/articles/bulk
Body: { "site": "B2B", "batch_size": 50 }
```
Output: `exports/content/blog_posts/data/{handle}.json`, `exports/content/blog_posts/index.csv`

**Count articles first:**
```
GET /api/content/articles/count?site=B2B
```

**Export a single article:**
```
GET /api/content/articles/one?site=B2B&id=gid://shopify/Article/123
```

---

**Export static pages:**
```
POST /api/content/pages/bulk
Body: { "site": "B2B", "batch_size": 50 }
```
Output: `exports/content/pages/data/{handle}.json`, `exports/content/pages/index.csv`

---

**Export media/files:**
```
POST /api/content/files/bulk
Body: { "site": "B2B", "batch_size": 50 }
```
Output: `exports/content/files/data/{id-slug}.json`, `exports/content/files/index.csv`

Then download files locally:
```
node src/scripts/download-files.js
```

---

**Export menus (raw structure):**
```
POST /api/content/menus/bulk
Body: { "site": "B2B" }
```
Output: `exports/content/menus/data/{handle}.json`

**Export a single menu:**
```
GET /api/content/menus/one?site=B2B&id=gid://shopify/Menu/113748344895
```

---

**List metaobject types:**
```
GET /api/content/metaobjects/types?site=B2B
```

**Export all metaobjects:**
```
POST /api/content/metaobjects/bulk
Body: { "site": "B2B", "batch_size": 50 }
```
Output: `exports/content/metaobjects/data/{handle}.json`

**Export one metaobject type as a sample:**
```
GET /api/content/metaobjects/one?site=B2B&type=your_type_name
```

---

### Phase 8 — Orders

Independent of products/customers, but most useful once both are live — orders reference BC customers by email and line items by SKU, so migrating them first will leave most orders as unresolved guest orders with empty line items.

**1. Check total count**
```
GET /api/migrate/orders/count?site=B2B
```

**2. Validate before migrating anything**
```
GET /api/migrate/orders/validate?site=B2B&batch_size=50&max_batches=1
```
Read-only — fetches a sample of orders and checks whether each order's customer email resolves to a BC customer and each line item SKU resolves to a BC product, without creating anything. Output: `migration/orders/validation-report.json`. Re-run with a larger `max_batches` to cover more of the order history before committing to a bulk run.

**3. Test with a single order**
```
POST /api/migrate/orders/single
Body: { "site": "B2B", "shopifyOrderId": "gid://shopify/Order/123" }
```
Output: `migration/orders/migrated_{id}.json`. Confirm the order appears correctly in BC admin (status, line items, totals, addresses) before running bulk.

**4. Run bulk migration**
```
POST /api/migrate/orders/bulk
Body: {
  "site": "B2B",
  "batch_size": 50,
  "skip": 0,
  "max_batches": 0
}
```
Output: `migration/orders/bulk-import-results.json`

**What gets migrated per order:**
- Status — mapped from Shopify financial/fulfillment status via `src/config/order-status-map.js` (confirm BC status IDs against `GET /v2/order_statuses` for the target store before a large run)
- Billing and shipping address
- Line items — resolved to BC products by SKU; unresolved SKUs are dropped from the order (logged, not fatal)
- Customer — resolved by email to an existing BC customer (migrate customers first); orders with no resolvable customer are created as guest orders
- A `staff_notes` annotation referencing the source Shopify order, for traceability

**Skipped automatically:** Cancelled orders, test orders, $0-total orders, and orders with no resolvable line items.

**Idempotency:** BC's `/v2/orders` has no field to look up an order by its Shopify origin, so re-runs are guarded by the presence of `migration/orders/migrated_{id}.json` — delete that file if an order genuinely needs to be re-migrated.

---

## Missing / Not-Yet-Migrated Data

Data that exists in Shopify and is captured or available but is not currently being pushed into BigCommerce.

### High Priority — Affects SEO or storefront UX

| Data | Current Status | BigCommerce API | Notes |
|------|---------------|-----------------|-------|
| Blog posts / Articles | Exported to `exports/content/blog_posts/` | `/v2/blog_posts` | Body HTML, author, tags, publish date, featured image all captured |
| Static pages | Exported to `exports/content/pages/` | `/v2/pages` | Body HTML, handle, publish status all captured |
| URL Redirects | CSV at `exports/redirects/url-redirects.csv` | `/v2/redirects` | Export script exists; needs a BC API POST step |
| Media / Files | Exported metadata + local download script | BC File Manager API | `download-files.js` fetches files locally; no upload pipeline to BC yet |

### Medium Priority — Customer data fidelity

| Data | Current Status | Notes |
|------|---------------|-------|
| Customer tags | Fetched from Shopify but not mapped | BC has no direct tag equivalent; could store in customer notes or a metafield |
| Customer notes | Fetched (`note` field) but dropped from BC payload | BC `notes` field is available on the customer object |
| SMS marketing consent | Fetched (`smsMarketingConsent`) but unused | Closest BC analog: `accepts_product_review_abandoned_cart_emails`, or store in a metafield |
| Tax exemption flag | Fetched (`taxExempt`) but not mapped | BC supports `tax_exempt_category` on customers |
| Disabled customer accounts | Filtered out; not imported as inactive | Could be imported with a flag rather than skipped entirely |

### Lower Priority — Recoverable post-launch

| Data | Current Status | Notes |
|------|---------------|-------|
| Gift cards | Not queried | BC `/v2/gift_certificates` API available |
| Discount codes / Promotions | Not queried | BC has `/v2/coupons` (code-based) and Promotions API (rule-based) |
| Inventory auto-sync | Quantities embedded in product data but not pushed | Phase 5 is currently manual; a script could read bulk-import-results and push quantities |
| Navigation non-collection items | Only COLLECTION menu items become BC categories | PAGE, ARTICLE, HTTP, PRODUCT, FRONTPAGE items in Shopify menus are not wired to BC nav widgets |
| Metaobjects | Exported to `exports/content/metaobjects/` | Shopify-specific custom data model; BC equivalent would be custom fields or Script Manager attributes |

---

## Intentionally Excluded Data

| Data | Reason |
|------|--------|
| Yotpo review metafields (`preloaded_bottomline`, `preloaded_reviews`, etc.) | Yotpo re-populates automatically once the BC domain is configured in the Yotpo dashboard |
| Archived Shopify products | Excluded from bulk migration; only ACTIVE and DRAFT products are imported |
| Disabled Shopify customer accounts | Filtered during bulk customer import to avoid cluttering BC with inactive accounts |
| $0-spend customers older than 6 months | Filtered to reduce noise from one-time or abandoned accounts |
