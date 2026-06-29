# BigCommerce Migration

Express.js service that migrates data from Shopify to BigCommerce. Handles both **product** migration (Customer Price Group deduplication, brand/category resolution, metafield transfer, per-SKU wholesale pricing via Price Lists) and **customer** migration (field mapping, address deduplication, metafield transfer, marketing consent).

## ToC

| Name | Description | Link |
| ---- | ----------- | ---- |
| Routes — BigCommerce | Proxy routes for BC resources (customers, customer groups, categories, brands, inventory) | [#bigcommerce-apibigcommerce](#bigcommerce-apibigcommerce) |
| Routes — Migration | Trigger full Shopify → BigCommerce product and customer migration | [#migration-apimigrate](#migration-apimigrate) |
| Routes — Test | Dev utilities: connection test, field validation, translation, customer composition | [#test-apitest](#test-apitest) |
| Documentation | Index of internal `.docs/` reference files | [#documentation](#documentation) |

## Routes

Server starts on `http://localhost:3000/api` (override with `PORT` env var).  
All error responses share the shape `{ "error": "<message>" }`.

---

### BigCommerce `/api/bigcommerce`

Proxy layer over the BigCommerce v3/v2 REST API. Credentials and store hash are resolved from `.env`. Query params are forwarded to BC as-is.

---

#### Customers

##### GET: Get many

**Status:** 🟢 Ready  
**Description:** List customers. Accepts any query params forwarded to BC (e.g. `?email:in=jane@example.com&limit=10`).  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/customers
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Paginated list of customer objects |
| 500 | `error` | BC API error |

---

##### GET: Get one

**Status:** 🟢 Ready  
**Description:** Fetch a single customer by BC ID.  
**Source:** BigCommerce

```bash
curl http://localhost:3000/api/bigcommerce/customers/4
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Single customer object |
| 500 | `error` | BC API error |

---

##### POST: Create one

**Status:** 🟢 Ready  
**Description:** Create a customer. Body is passed directly to BC.  
**Source:** BigCommerce

```bash
curl -X POST http://localhost:3000/api/bigcommerce/customers \
  -H "Content-Type: application/json" \
  -d '{ "first_name": "Jane", "last_name": "Doe", "email": "jane@example.com", "channel_ids": [1] }'
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 201 | — | Newly created customer |
| 500 | `error` | BC API error |

---

##### PUT: Update one

**Status:** 🟢 Ready  
**Description:** Update a customer by ID. Send only fields to change.  
**Source:** BigCommerce

```bash
curl -X PUT http://localhost:3000/api/bigcommerce/customers/4 \
  -H "Content-Type: application/json" \
  -d '{ "phone": "+15559876543" }'
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Updated customer |
| 500 | `error` | BC API error |

---

##### DELETE: Delete one

**Status:** 🟢 Ready  
**Description:** Delete a customer by BC ID.  
**Source:** BigCommerce

```bash
curl -X DELETE http://localhost:3000/api/bigcommerce/customers/4
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 204 | — | Deleted — no body |
| 500 | `error` | BC API error |

---

#### Customer Groups

##### GET: Get many

**Status:** 🟢 Ready  
**Description:** List all customer groups. Accepts optional query params forwarded to BC (e.g. `?limit=10`).  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/customer-groups
```

**Example response:**

```json
[
  { "id": 1, "name": "Wholesale A", "is_default": false, "discount_rules": [], "category_access": { "type": "all" } },
  { "id": 2, "name": "Wholesale B (Low)", "is_default": false, "discount_rules": [], "category_access": { "type": "all" } }
]
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Array of customer group objects |
| 500 | `error` | BC API error forwarded as-is |

---

##### GET: Get one

**Status:** 🟢 Ready  
**Description:** Fetch a single customer group by its BC ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/customer-groups/1
```

**Example response:**

```json
{ "id": 1, "name": "Wholesale A", "is_default": false, "discount_rules": [], "category_access": { "type": "all" } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Single customer group object |
| 500 | `error` | BC API error |

---

##### POST: Create one

**Status:** 🟢 Ready  
**Description:** Create a new customer group. Body is passed directly to BC.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X POST http://localhost:3000/api/bigcommerce/customer-groups \
  -H "Content-Type: application/json" \
  -d '{ "name": "VIP", "is_default": false }'
```

**Example response:**

```json
{ "id": 7, "name": "VIP", "is_default": false, "discount_rules": [], "category_access": { "type": "all" } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 201 | — | Newly created group |
| 500 | `error` | BC API error |

---

##### PUT: Update one

**Status:** 🟢 Ready  
**Description:** Update a customer group by ID. Body is passed directly to BC.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X PUT http://localhost:3000/api/bigcommerce/customer-groups/7 \
  -H "Content-Type: application/json" \
  -d '{ "name": "VIP Platinum" }'
```

**Example response:**

```json
{ "id": 7, "name": "VIP Platinum", "is_default": false, "discount_rules": [], "category_access": { "type": "all" } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Updated group |
| 500 | `error` | BC API error |

---

##### DELETE: Delete one

**Status:** 🟢 Ready  
**Description:** Delete a customer group by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X DELETE http://localhost:3000/api/bigcommerce/customer-groups/7
```

**Example response:**

```json
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 204 | — | Deleted — no body |
| 500 | `error` | BC API error |

---

#### Categories

##### GET: Get many

**Status:** 🟢 Ready  
**Description:** List all categories. Accepts query params forwarded to BC.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/categories
```

**Example response:**

```json
{
  "data": [
    { "id": 23, "parent_id": 0, "name": "Disposable Vapes", "is_visible": true, "custom_url": { "url": "/disposable-vapes/" } }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Paginated list of categories |
| 500 | `error` | BC API error |

---

##### GET: Get one

**Status:** 🟢 Ready  
**Description:** Fetch a single category by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/categories/23
```

**Example response:**

```json
{ "data": { "id": 23, "parent_id": 0, "name": "Disposable Vapes", "is_visible": true } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Single category object |
| 500 | `error` | BC API error |

---

##### POST: Create one

**Status:** 🟢 Ready  
**Description:** Create a category. `parent_id: 0` creates a root-level category.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X POST http://localhost:3000/api/bigcommerce/categories \
  -H "Content-Type: application/json" \
  -d '{ "name": "Disposable Vapes", "parent_id": 0 }'
```

**Example response:**

```json
{ "data": { "id": 24, "parent_id": 0, "name": "Disposable Vapes", "is_visible": true } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 201 | — | Newly created category |
| 500 | `error` | BC API error |

---

##### PUT: Update one

**Status:** 🟢 Ready  
**Description:** Update a category by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X PUT http://localhost:3000/api/bigcommerce/categories/24 \
  -H "Content-Type: application/json" \
  -d '{ "name": "Vapes - Disposable" }'
```

**Example response:**

```json
{ "data": { "id": 24, "parent_id": 0, "name": "Vapes - Disposable", "is_visible": true } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Updated category |
| 500 | `error` | BC API error |

---

##### DELETE: Delete one

**Status:** 🟢 Ready  
**Description:** Delete a category by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X DELETE http://localhost:3000/api/bigcommerce/categories/24
```

**Example response:**

```json
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 204 | — | Deleted — no body |
| 500 | `error` | BC API error |

---

#### Brands

##### GET: Get many

**Status:** 🟢 Ready  
**Description:** List all brands. Accepts query params forwarded to BC (e.g. `?name=Foger`).  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/brands
```

**Example response:**

```json
{
  "data": [
    { "id": 5, "name": "Foger", "page_title": "", "custom_url": { "url": "/foger/" } }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Paginated list of brands |
| 500 | `error` | BC API error |

---

##### GET: Get one

**Status:** 🟢 Ready  
**Description:** Fetch a single brand by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/brands/5
```

**Example response:**

```json
{ "data": { "id": 5, "name": "Foger", "page_title": "", "custom_url": { "url": "/foger/" } } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Single brand object |
| 500 | `error` | BC API error |

---

##### POST: Create one

**Status:** 🟢 Ready  
**Description:** Create a brand.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X POST http://localhost:3000/api/bigcommerce/brands \
  -H "Content-Type: application/json" \
  -d '{ "name": "Foger" }'
```

**Example response:**

```json
{ "data": { "id": 5, "name": "Foger", "page_title": "", "custom_url": { "url": "/foger/" } } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 201 | — | Newly created brand |
| 500 | `error` | BC API error |

---

##### PUT: Update one

**Status:** 🟢 Ready  
**Description:** Update a brand by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X PUT http://localhost:3000/api/bigcommerce/brands/5 \
  -H "Content-Type: application/json" \
  -d '{ "name": "Foger Vapes" }'
```

**Example response:**

```json
{ "data": { "id": 5, "name": "Foger Vapes" } }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Updated brand |
| 500 | `error` | BC API error |

---

##### DELETE: Delete one

**Status:** 🟢 Ready  
**Description:** Delete a brand by ID.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X DELETE http://localhost:3000/api/bigcommerce/brands/5
```

**Example response:**

```json
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 204 | — | Deleted — no body |
| 500 | `error` | BC API error |

---

#### Inventory

##### GET: Get locations

**Status:** 🟢 Ready  
**Description:** List all fulfillment locations in the BC store. Returns location IDs required for inventory adjustment calls. Default location ID is `1`.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/bigcommerce/inventory/locations
```

**Example response:**

```json
{
  "data": [
    { "id": 1, "code": "DEFAULT", "label": "Default Location", "managed": false, "enabled": true }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Array of location objects |
| 500 | `error` | BC API error |

---

##### GET: Get items

**Status:** 🟢 Ready  
**Description:** Query current inventory levels for variants at all locations. Accepts query params forwarded to BC (e.g. `?variant_id:in=245,246`).  
**Source:** BigCommerce

**Example request:**

```bash
curl "http://localhost:3000/api/bigcommerce/inventory/items?variant_id:in=245,246"
```

**Example response:**

```json
{
  "data": [
    { "identity": { "id": 245, "sku": "63777-5" }, "locations": [{ "id": 1, "quantity": 100 }] }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Array of inventory items with per-location quantities |
| 500 | `error` | BC API error |

---

##### PUT: Set absolute quantity

**Status:** 🟢 Ready  
**Description:** Set an exact inventory count for one or more variants at a specific location. Overwrites the existing quantity.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X PUT http://localhost:3000/api/bigcommerce/inventory/absolute \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "variant_id": 245, "location_id": 1, "quantity": 100 }
    ]
  }'
```

**Example response:**

```json
{ "data": [{ "variant_id": 245, "location_id": 1, "quantity": 100 }] }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Updated inventory records |
| 500 | `error` | BC API error |

---

##### POST: Adjust relative quantity

**Status:** 🟢 Ready  
**Description:** Add or subtract from existing inventory. Use positive values to add stock, negative to reduce.  
**Source:** BigCommerce

**Example request:**

```bash
curl -X POST http://localhost:3000/api/bigcommerce/inventory/relative \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "variant_id": 245, "location_id": 1, "relative_quantity": -5 }
    ]
  }'
```

**Example response:**

```json
{ "data": [{ "variant_id": 245, "location_id": 1, "quantity": 95 }] }
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Updated inventory records |
| 500 | `error` | BC API error |

---

### Migration `/api/migrate`

Orchestrates full Shopify → BigCommerce migration for products and customers. Shopify is accessed via internal GraphQL — no Shopify-facing routes are exposed.

---

#### Customers

##### POST: Migrate one

**Status:** 🟢 Ready  
**Description:** Migrates a single Shopify customer end-to-end: fetches from Shopify GraphQL, resolves name splitting, deduplicates addresses, maps marketing consent, creates the BC customer, creates addresses, and writes all non-null metafields. Idempotent — re-running with the same customer skips if the email already exists in BC. Saves composed and migrated JSON to `migration/customers/`.  
**Source:** Shopify → BigCommerce

See [.docs/BigCommerce/customer-data-shape.md](.docs/BigCommerce/customer-data-shape.md) for the full field mapping.

**Example request:**

```bash
curl -X POST http://localhost:3000/api/migrate/customers/single \
  -H "Content-Type: application/json" \
  -d '{ "shopifyCustomerId": "2147081748549" }'
```

**Example response (`_action: "created"`):**

```json
{
  "_source_customer_id": "gid://shopify/Customer/2147081748549",
  "_shopify_numeric_id": 2147081748549,
  "_migrated_at": "2026-06-26T00:00:00.000Z",
  "_action": "created",
  "bc_customer_id": 4,
  "customer": { "id": 4, "email": "...", "first_name": "...", "last_name": "..." },
  "addresses": [ { "id": 1, "address1": "...", "city": "..." } ],
  "metafields": [ { "namespace": "avatax_excise", "key": "customer_no", "value": "C0076325" } ]
}
```

**Example response (`_action: "skipped"`):**

```json
{
  "_action": "skipped",
  "_reason": "customer_exists",
  "bc_customer_id": 4,
  "email": "user@example.com"
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 201 | — | Migration result — includes `_action: "created"` or `"skipped"` |
| 400 | `shopifyCustomerId is required` | Missing body field |
| 500 | `error` | Shopify GraphQL or BC API error |

---

#### Products

##### POST: Migrate one

**Status:** 🟢 Ready  
**Description:** Migrates a single product end-to-end: fetches from Shopify GraphQL, resolves or creates the brand and category in BC, deduplicates Customer Price Group variants into physical variants, creates the BC product with metafields, and applies per-SKU customer group pricing via Price Lists. Saves a result record to `migration/migrated_{bcProductId}.json`.  
**Source:** Shopify → BigCommerce

**Example request:**

```bash
curl -X POST http://localhost:3000/api/migrate/product \
  -H "Content-Type: application/json" \
  -d '{ "shopifyProductId": "gid://shopify/Product/8191177064511" }'
```

**Example response:**

```json
{
  "shopify_id": "gid://shopify/Product/8191177064511",
  "bc_product_id": 256,
  "name": "Frozen Peach FOGER BIT 35K",
  "brand_id": 5,
  "category_id": 23,
  "variants_created": 1,
  "pricing_groups_set": 6,
  "metafields_written": 11,
  "unresolved_groups": []
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 201 | — | Migration result summary |
| 400 | `shopifyProductId is required` | Missing request body field |
| 500 | `error` | Shopify GraphQL or BC API error |

> **Note:** `unresolved_groups` lists any Shopify CPG group names not found in `src/config/customer-groups.js`. Those groups are skipped — no pricing is set for them.

---

### Test `/api/test`

Development utilities for exploring data shape and validating connectivity. Product routes target a hardcoded Shopify product; customer routes accept an `id` query param.

---

#### GET: BigCommerce connection test

**Status:** 🟢 Ready  
**Description:** Verifies BC API credentials by fetching the first 5 products and 5 customers from BC. Results are logged to the server console.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/test/bigcommerce
```

**Example response:**

```json
{
  "products": [
    { "id": 112, "name": "Sample Product", "sku": "", "price": "0.0000", "is_visible": true }
  ],
  "customers": [
    { "id": 1, "first_name": "John", "last_name": "Doe", "email": "john@example.com" }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | First 5 products and customers from BC |
| 500 | `error` | Auth failure or BC API error |

---

#### GET: Field validation

**Status:** 🟢 Ready  
**Description:** Fetches the hardcoded Shopify product and documents every expected field as `{ type, example, populated }`. Useful for auditing which fields are actually populated before migration. Saves output to `migration/validation.json`.  
**Source:** Shopify

**Example request:**

```bash
curl http://localhost:3000/api/test/field-validation
```

**Example response:**

```json
{
  "_product_id": "gid://shopify/Product/8191177064511",
  "_retrieved_at": "2026-06-24T17:35:19.476Z",
  "title":       { "type": "string", "example": "Frozen Peach FOGER BIT 35K", "populated": true },
  "seo.title":   { "type": "null",   "example": null,                           "populated": false },
  "variants":    { "type": "array",  "count": 6,                                "populated": true },
  "metafields": {
    "filter.flavor":      { "type": "list.single_line_text_field", "example": "[\"Peach\"]", "populated": true },
    "filter.built_in_usa": { "type": "null", "example": null,                                "populated": false }
  }
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Field validation schema saved and returned |
| 500 | `error` | Shopify GraphQL error |

---

#### GET: Translate product

**Status:** 🟢 Ready  
**Description:** Fetches the hardcoded Shopify product and maps it to the BigCommerce v3 POST payload shape — without writing anything to BC. Shows CPG deduplication and the per-group pricing split. Saves output to `migration/translated_product.json`.  
**Source:** Shopify

**Example request:**

```bash
curl http://localhost:3000/api/test/translate-product
```

**Example response:**

```json
{
  "_source_product_id": "gid://shopify/Product/8191177064511",
  "product": {
    "name": "Frozen Peach FOGER BIT 35K",
    "type": "physical",
    "variants": [
      { "sku": "63777-5", "price": 55, "option_values": [{ "option_display_name": "Nicotine", "label": "50mg" }] }
    ]
  },
  "metafields": [
    { "namespace": "filter", "key": "flavor", "value": "[\"Peach\"]", "permission_set": "read" }
  ],
  "customer_group_pricing": [
    { "customer_group_id": 1, "_group_name": "Wholesale A", "type": "fixed", "price": 55 },
    { "customer_group_id": 3, "_group_name": "Chain Store",  "type": "fixed", "price": 52.5 }
  ],
  "_manual_mapping_required": {
    "brand_id":   "Shopify vendor: \"Foger\" — match to BigCommerce Brand",
    "categories": "Shopify productType: \"Disposables - Foger Bit\" — match to BigCommerce Category ID"
  }
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Translated payload saved and returned |
| 500 | `error` | Shopify GraphQL error |

---

#### GET: Migrate images

**Status:** 🟢 Ready  
**Description:** Uploads images from the hardcoded Shopify product to an existing BC product via URL passthrough — BC fetches and re-hosts the images from the Shopify CDN. Requires `bcProductId` as a query param. Saves a summary to `migration/images.json`.  
**Source:** Shopify → BigCommerce

**Example request:**

```bash
curl "http://localhost:3000/api/test/migrate-images?bcProductId=256"
```

**Example response:**

```json
{
  "bc_product_id": "256",
  "total": 2,
  "succeeded": 2,
  "failed": 0,
  "images": [
    {
      "shopify_url": "https://cdn.shopify.com/s/files/.../Foger_Bit35_Frozen-Peach-1.png",
      "bc_url": "https://cdn11.bigcommerce.com/s-.../products/256/images/88/Foger_Bit35_Frozen-Peach-1.png",
      "bc_image_id": 88
    },
    {
      "shopify_url": "https://cdn.shopify.com/s/files/.../Foger_Bit35_Frozen-Peach-2.png",
      "bc_url": "https://cdn11.bigcommerce.com/s-.../products/256/images/89/Foger_Bit35_Frozen-Peach-2.png",
      "bc_image_id": 89
    }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Upload summary with Shopify and BC URLs per image |
| 500 | `bcProductId is required` | Missing query param |
| 500 | `error` | BC image upload error |

---

#### GET: Get inventory

**Status:** 🟢 Ready  
**Description:** Fetches all locations and the top 5 inventory items. Logs each SKU, location, and quantity to the server console.  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/test/inventory
```

**Example response:**

```json
{
  "locations": [
    { "id": 1, "code": "DEFAULT", "label": "Default Location", "managed": false, "enabled": true }
  ],
  "items": [
    { "identity": { "id": 245, "sku": "63777-5" }, "locations": [{ "id": 1, "quantity": 100 }] }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Locations array and top 5 inventory items |
| 500 | `error` | BC API error |

---

#### GET: Wipe inventory

**Status:** 🟢 Ready  
**Description:** Fetches up to 250 inventory items and sets every SKU/location pair to `0` via an absolute adjustment. Logs a warning if the store has more than 250 items (pagination not implemented).  
**Source:** BigCommerce

**Example request:**

```bash
curl http://localhost:3000/api/test/inventory/wipe
```

**Example response:**

```json
{
  "wiped": 12,
  "items": [
    { "identity": { "sku": "63777-5" }, "locations": [{ "id": 1, "quantity": 0 }] }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Count of wiped pairs and updated item records |
| 500 | `error` | BC API error |

---

#### GET: Set inventory

**Status:** 🟢 Ready  
**Description:** Applies an absolute or relative inventory adjustment across all items. `type` is `absolute` (overwrites) or `relative` (adds/subtracts). `value` is an integer or `rand` (resolves to a random integer in [1, 5]).  
**Source:** BigCommerce

**Example request:**

```bash
# Set all inventory to exactly 5
curl http://localhost:3000/api/test/inventory/set/absolute/5

# Add a random 1–5 units to all items
curl http://localhost:3000/api/test/inventory/set/relative/rand
```

**Example response:**

```json
{
  "updated": 12,
  "type": "absolute",
  "value": 5,
  "items": [
    { "identity": { "sku": "63777-5" }, "locations": [{ "id": 1, "quantity": 5 }] }
  ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Count of updated pairs, resolved value, and updated item records |
| 400 | `error` | Invalid `type` or unparseable `value` |
| 500 | `error` | BC API error |

---

#### GET: Extract sample customers

**Status:** 🟢 Ready  
**Description:** Fetches 3 hardcoded Shopify customer IDs and saves raw GraphQL JSON to `migration/customers/{id}.json`. Used to seed reference data for composing and validating migration payloads.  
**Source:** Shopify

```bash
curl http://localhost:3000/api/test/extract-customers
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Array of `{ id, found, email, filepath }` per customer |
| 500 | `error` | Shopify GraphQL error |

---

#### GET: Compose customer

**Status:** 🟢 Ready  
**Description:** Fetches a Shopify customer by ID, maps it to the full BC payload shape (customer body + addresses + metafields), and saves to `migration/customers/composed_{id}.json`. Does **not** write to BigCommerce — dry-run compose only.  
**Source:** Shopify

```bash
curl "http://localhost:3000/api/test/compose-customer?id=2852474519615"
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Composed BC payload saved and returned |
| 400 | `id query param is required` | Missing query param |
| 500 | `error` | Shopify GraphQL error |

---

#### GET: BC customer (full)

**Status:** 🟢 Ready  
**Description:** Fetches a BigCommerce customer by BC ID alongside their addresses and metafields in parallel. Useful for inspecting a migrated customer's state in BC.  
**Source:** BigCommerce

```bash
curl "http://localhost:3000/api/test/bc-customer?id=4"
```

**Example response:**

```json
{
  "customer": { "id": 4, "email": "...", "first_name": "...", "last_name": "..." },
  "addresses": [ { "id": 1, "address1": "...", "city": "..." } ],
  "metafields": [ { "namespace": "avatax_excise", "key": "customer_no", "value": "C0076325" } ]
}
```

| Status | Message | Description |
| ------ | ------- | ----------- |
| 200 | — | Customer + addresses + metafields |
| 400 | `id query param is required` | Missing query param |
| 500 | `error` | BC API error |

---

## Documentation

Internal reference docs live in `.docs/`. The BigCommerce directory covers the BC REST API; the Shopify directory covers the source data schema.

### BigCommerce

| Name | Description | Link |
| ---- | ----------- | ---- |
| Index | Base URL, quick-reference endpoint tables, service layer overview | [.docs/BigCommerce/README.md](.docs/BigCommerce/README.md) |
| Authentication | Store-level auth, where to find credentials, required OAuth scopes | [.docs/BigCommerce/authentication.md](.docs/BigCommerce/authentication.md) |
| Default Permissions | Full list of required API scopes for this project | [.docs/BigCommerce/default-permissions.md](.docs/BigCommerce/default-permissions.md) |
| Product Data Shape | Shopify → BC field mapping, CPG pattern, metafield mapping, customer group pricing | [.docs/BigCommerce/product-data-shape.md](.docs/BigCommerce/product-data-shape.md) |
| Customer Data Shape | Shopify → BC customer field mapping, address dedup, metafields, migrate function, output shape | [.docs/BigCommerce/customer-data-shape.md](.docs/BigCommerce/customer-data-shape.md) |
| Inventory | Multi-location inventory, absolute vs relative adjustments, location ID lookup | [.docs/BigCommerce/inventory.md](.docs/BigCommerce/inventory.md) |
| Image Migration | URL passthrough vs download+re-upload strategies, tradeoffs | [.docs/BigCommerce/image-migration.md](.docs/BigCommerce/image-migration.md) |
| Endpoint — Products | CRUD operations for `/v3/catalog/products` | [.docs/BigCommerce/endpoints/products.md](.docs/BigCommerce/endpoints/products.md) |
| Endpoint — Customers | CRUD + addresses + metafields for `/v3/customers` | [.docs/BigCommerce/endpoints/customers.md](.docs/BigCommerce/endpoints/customers.md) |
| Endpoint — Brands | CRUD for `/v3/catalog/brands` | [.docs/BigCommerce/endpoints/brands.md](.docs/BigCommerce/endpoints/brands.md) |
| Endpoint — Categories | CRUD for `/v3/catalog/categories` | [.docs/BigCommerce/endpoints/categories.md](.docs/BigCommerce/endpoints/categories.md) |
| Endpoint — Customer Groups | CRUD for `/v2/customer_groups` | [.docs/BigCommerce/endpoints/customer-groups.md](.docs/BigCommerce/endpoints/customer-groups.md) |
| Endpoint — Inventory | Locations + absolute/relative adjustments for `/v3/inventory` | [.docs/BigCommerce/endpoints/inventory.md](.docs/BigCommerce/endpoints/inventory.md) |
| Endpoint — Images | Product image upload via URL passthrough for `/v3/catalog/products/{id}/images` | [.docs/BigCommerce/endpoints/images.md](.docs/BigCommerce/endpoints/images.md) |

### Shopify

| Name | Description | Link |
| ---- | ----------- | ---- |
| Products | Source schema — GraphQL fields, variant structure, CPG pattern, metafield types, caveats | [.docs/Shopify/products.md](.docs/Shopify/products.md) |
| Customers | Source schema — GraphQL fields, addresses, marketing consent, metafields, caveats | [.docs/Shopify/customers.md](.docs/Shopify/customers.md) |
| Metafields | Metafield fetching strategies (aliased singular vs identifiers list), namespace patterns | [.docs/Shopify/metafields.md](.docs/Shopify/metafields.md) |
| Navigation | Menu GraphQL schema, item types, fetch pattern, migration mapping to BC categories | [.docs/Shopify/navigation.md](.docs/Shopify/navigation.md) |
| API Version | Current version (2026-04), compatibility matrix, what changed | [.docs/Shopify/api-version.md](.docs/Shopify/api-version.md) |
