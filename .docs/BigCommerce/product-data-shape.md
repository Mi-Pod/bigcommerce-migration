# Product Data Shape — Shopify → BigCommerce

## Backlog

| # | Item | Context |
|---|---|---|
| 1 | **Price visibility for non-group members** | `price: 0` on all products is intentional — this site is exclusively wholesale. Configure BC store to hide prices / require login for customers not assigned to a price group. Check: **Settings → Display → Price display** and customer group category access rules. |
| 2 | **Weight is a placeholder (`1`)** | BC requires a non-null weight for physical products. Shopify `weightUnit` is `OUNCES` by default. Verify the BC store weight unit matches (**Settings → Shipping → Units**), then backfill real weights when product data is available. |

---

## Key Pattern: Customer Price Group

In Shopify, **Option 1** on every product is `Customer Price Group`. This is a pricing dimension — not a physical product attribute. It drives wholesale pricing by making each price tier a separate variant (same SKU root, different price).

**BigCommerce equivalent:** Customer Group Pricing via `POST /v3/catalog/products/{id}/customer_group_pricing`. Each CPG group name must be mapped to a BigCommerce `customer_group_id` after the product is created.

This means the migration has a two-pass requirement:
1. Create the product + physical variants (excluding CPG as a variant option)
2. Apply customer group pricing rules using the new product ID

---

## Field Mapping

| Shopify Field | Shopify Type | BigCommerce Field | BC API Location | Notes |
|---|---|---|---|---|
| `title` | string | `name` | product body | Direct map |
| `descriptionHtml` | string (HTML) | `description` | product body | Direct map |
| `status` | `ACTIVE` \| `DRAFT` \| `ARCHIVED` | `is_visible` | product body | `ACTIVE` → `true`, others → `false` |
| `productType` | string | `categories` | product body | Requires manual lookup — map to BC category ID |
| `vendor` | string | `brand_id` | product body | Requires manual lookup — match to BC Brand |
| `handle` | string | `custom_url.url` | product body | Prepend `/` — e.g. `my-product` → `/my-product` |
| `tags` | string[] | `tags` | product body | Join array to comma-separated string |
| `seo.title` | string | `page_title` | product body | Direct map |
| `seo.description` | string | `meta_description` | product body | Direct map |
| `images[].url` | string | `images[].image_url` | product body | Direct map |
| `images[].altText` | string | `images[].description` | product body | Direct map |
| First image | — | `images[].is_thumbnail: true` | product body | Set on index 0 |
| `variants[].sku` | string | `variants[].sku` | product body | CPG variants deduplicated to one physical variant |
| `variants[].price` | string | `variants[].price` | product body | Parse float |
| `variants[].selectedOptions` | array | `variants[].option_values` | product body | Exclude CPG option; map `name` → `option_display_name`, `value` → `label` |

---

## Metafield Mapping

Each Shopify metafield becomes a separate POST to `/v3/catalog/products/{id}/metafields`.

| Shopify Metafield | Namespace | Key | BC `permission_set` |
|---|---|---|---|
| `order_limits.order_maximum` | `order_limits` | `order_maximum` | `read` |
| `filter.built_in_usa` | `filter` | `built_in_usa` | `read` |
| `filter.product_category` | `filter` | `product_category` | `read` |
| `filter.flavor` | `filter` | `flavor` | `read` |
| `filter.type` | `filter` | `type` | `read` |
| `filter.product_brand` | `filter` | `product_brand` | `read` |
| `filter.product_line` | `filter` | `product_line` | `read` |
| `custom.contains` | `custom` | `contains` | `read` |

---

## Customer Group Pricing

After identifying the CPG option variants, apply pricing per group:

**Endpoint:** `PUT /v3/catalog/products/{product_id}/customer_group_pricing`

```json
[
  {
    "customer_group_id": 0,
    "type": "fixed",
    "price": 19.99
  }
]
```

`customer_group_id: 0` = all customers (default/retail price).

### Known Customer Groups (BigCommerce)

ID map is codified in `src/config/customer-groups.js`.

| ID | Group Name |
|---|---|
| 1 | Wholesale A |
| 2 | Wholesale B (Low) |
| 3 | Chain Store |
| 4 | Distro A |
| 5 | Distro B (Low) |
| 6 | Master Distro Price |

`customer_group_id: 0` = all customers (catch-all / unpriced retail). Not used as a named group here.

---

## Manual Mapping Requirements

These two fields require a one-time lookup against the BigCommerce store before bulk migration:

### Brand
`GET /v3/catalog/brands` — build a map of `{ [vendor_name]: brand_id }`.  
If a brand doesn't exist, `POST /v3/catalog/brands` to create it first.

### Categories
`GET /v3/catalog/categories` — build a map of `{ [productType]: category_id }`.  
If a category doesn't exist, `POST /v3/catalog/categories` to create it first.

---

## BigCommerce Product POST Shape

Minimal payload structure produced by `translateProduct()`:

```json
{
  "name": "...",
  "type": "physical",
  "description": "<p>...</p>",
  "is_visible": true,
  "page_title": "...",
  "meta_description": "...",
  "custom_url": { "url": "/my-product", "is_customized": true },
  "tags": "tag1,tag2,tag3",
  "images": [
    { "image_url": "https://...", "description": "Alt text", "is_thumbnail": true, "sort_order": 0 }
  ],
  "variants": [
    {
      "sku": "MP-001",
      "price": 19.99,
      "option_values": [
        { "option_display_name": "Size", "label": "Medium" }
      ]
    }
  ]
}
```
