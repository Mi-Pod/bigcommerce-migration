# Shopify Product Source Schema

**API version:** `2026-04` — all fields below confirmed compatible. See [api-version.md](api-version.md).  
Source data fetched via the Shopify Admin GraphQL API (`/admin/api/2026-04/graphql.json`).

---

## GraphQL Fields Fetched

Two queries are used: `listAll` (bulk enumeration) and `getOne` (single product, full detail).

`getOne` is the authoritative fetch used during migration — it includes `productType`, `vendor`, `metafields`, and an exact variant count prefetch to avoid pagination truncation. `listAll` omits those fields and is used for catalogue discovery only.

```graphql
product(id: $id) {
  id
  handle
  title
  descriptionHtml
  status
  productType
  vendor
  tags
  seo {
    title
    description
  }
  images(first: 20) {
    edges {
      node {
        id
        url
        altText
      }
    }
  }
  options {
    name
    position
    values
  }
  variants(first: $variantCount) {   # count pre-fetched to avoid truncation
    edges {
      node {
        id
        sku
        price
        inventoryQuantity
        selectedOptions {
          name
          value
        }
      }
    }
  }
  # Aliased singular metafields — generated from METAFIELD_DEFS in products.js
  mf_order_limits_order_maximum: metafield(namespace: "order_limits", key: "order_maximum") { namespace key value type }
  mf_filter_built_in_usa: metafield(namespace: "filter", key: "built_in_usa") { namespace key value type }
  mf_filter_product_category: metafield(namespace: "filter", key: "product_category") { namespace key value type }
  mf_filter_flavor: metafield(namespace: "filter", key: "flavor") { namespace key value type }
  mf_filter_type: metafield(namespace: "filter", key: "type") { namespace key value type }
  mf_filter_product_brand: metafield(namespace: "filter", key: "product_brand") { namespace key value type }
  mf_filter_product_line: metafield(namespace: "filter", key: "product_line") { namespace key value type }
  mf_custom_contains: metafield(namespace: "custom", key: "contains") { namespace key value type }
}
```

---

## Product Fields

| Field | GraphQL Type | Always Populated | Example | Notes |
|---|---|---|---|---|
| `id` | `ID` | Yes | `gid://shopify/Product/8191177064511` | Global Shopify GID |
| `handle` | `String` | Yes | `frozen-peach-foger-bit-35k` | URL slug |
| `title` | `String` | Yes | `Frozen Peach FOGER BIT 35K` | Product name |
| `descriptionHtml` | `String` | Yes | `<h3>...</h3>` | Rich HTML — may contain inline styles and Shopify-relative hrefs |
| `status` | `ProductStatus` | Yes | `ACTIVE` | Enum: `ACTIVE`, `DRAFT`, `ARCHIVED` |
| `productType` | `String` | Yes | `Disposables - Foger Bit` | Maps to BC Category. Format is `"Category - Subcategory"` |
| `vendor` | `String` | Yes | `Foger` | Maps to BC Brand |
| `tags` | `[String]` | Yes | `["Brand_Foger", "disposable"]` | Array from GraphQL; comma-joined for BC |
| `seo.title` | `String` | No | `null` | Often unpopulated; maps to BC `page_title` |
| `seo.description` | `String` | Yes | `"The wholesale Frozen Peach..."` | Maps to BC `meta_description` |

---

## Images

Up to 20 images fetched per product.

| Field | Type | Notes |
|---|---|---|
| `images[].id` | `ID` | Shopify image GID — not forwarded to BC |
| `images[].url` | `String` | Full Shopify CDN URL (e.g. `https://cdn.shopify.com/s/files/...`) |
| `images[].altText` | `String` | Alt text; maps to BC `images[].description` |

The first image (`index 0`) is set as `is_thumbnail: true` in BigCommerce.

---

## Options

Products always have at least one option. **Option at `position: 1` is always `Customer Group`** — this is a pricing dimension, not a physical attribute. See [Customer Price Group pattern](#customer-price-group-pattern) below.

| Field | Type | Notes |
|---|---|---|
| `options[].name` | `String` | Option label (e.g. `"Customer Group"`, `"Nicotine"`, `"Size"`) |
| `options[].position` | `Int` | 1-indexed. Position 1 = Customer Group (always) |
| `options[].values` | `[String]` | All values for this option |

**Example options for a typical product:**

```json
[
  { "name": "Customer Group", "position": 1, "values": ["Wholesale A", "Wholesale B (Low)", "Chain Store", "Distro A", "Distro B (Low)", "Master Distro Price"] },
  { "name": "Nicotine",       "position": 2, "values": ["50mg"] },
  { "name": "Size",           "position": 3, "values": ["5 Pack"] }
]
```

---

## Variants

Shopify generates one variant per combination of all option values. Because `Customer Group` has 6 values and represents a pricing tier, a product with 1 physical variant produces **6 Shopify variants** (one per CPG group), all sharing the same SKU.

| Field | Type | Notes |
|---|---|---|
| `variants[].id` | `ID` | Shopify variant GID — not forwarded to BC |
| `variants[].sku` | `String` | Same value across all CPG variants for a given physical variant |
| `variants[].price` | `String` (numeric) | Price for this CPG tier — parse to float for BC |
| `variants[].inventoryQuantity` | `Int` | Stock on hand |
| `variants[].selectedOptions` | `[{name, value}]` | All option selections including `Customer Group` |

**Example variant set for one physical SKU across 6 CPG groups:**

| SKU | Customer Group | Price |
|---|---|---|
| `63777-5` | Wholesale A | $55.00 |
| `63777-5` | Wholesale B (Low) | $55.00 |
| `63777-5` | Chain Store | $52.50 |
| `63777-5` | Distro A | $52.50 |
| `63777-5` | Distro B (Low) | $52.50 |
| `63777-5` | Master Distro Price | $52.50 |

---

## Customer Price Group Pattern

This is the most important schema quirk. **`Customer Group` is Shopify Option 1 on every product.** It encodes wholesale pricing tiers as variant permutations rather than using a native pricing feature.

**What this means for migration:**
- Variants must be deduplicated by physical options only (excluding `Customer Group`)
- Per-SKU pricing per group is extracted separately and written to BC via customer group pricing
- The physical variant count is: `total_variants / 6` (assuming all 6 CPG groups are present)

**CPG group → BigCommerce `customer_group_id` mapping** (from `src/config/customer-groups.js`):

| Shopify Option Value | BC `customer_group_id` |
|---|---|
| `Wholesale A` | `1` |
| `Wholesale B (Low)` | `2` |
| `Chain Store` | `3` |
| `Distro A` | `4` |
| `Distro B (Low)` | `5` |
| `Master Distro Price` | `6` |

---

## Metafields

Fetched via `metafields(identifiers: [...])`. Returns a **flat array** (not a connection) — one entry per identifier, or `null` in that position if the metafield isn't set on the product. See [`.docs/Shopify/metafields.md`](metafields.md) for the full reference.

### Known Metafield Schema

| Namespace | Key | Shopify Type | Always Populated | Example Value |
|---|---|---|---|---|
| `filter` | `product_category` | `single_line_text_field` | Yes | `"Disposable Vapes"` |
| `filter` | `flavor` | `list.single_line_text_field` | Yes | `'["Peach"]'` (JSON string) |
| `filter` | `type` | `single_line_text_field` | Yes | `"Foger Bit 35K"` |
| `filter` | `product_brand` | `single_line_text_field` | Yes | `"Foger"` |
| `filter` | `product_line` | `single_line_text_field` | Yes | `"Foger Bit"` |
| `filter` | `built_in_usa` | `single_line_text_field` | No | `null` |
| `order_limits` | `order_maximum` | `number_integer` | No | `null` |
| `custom` | `contains` | `list.single_line_text_field` | Yes | `'["Nicotine Option"]'` |
| `global` | `description_tag` | `single_line_text_field` | Yes | SEO description text |
| `yotpo` | `preloaded_bottomline` | `json` | Yes | `{"bottomline": {...}}` |
| `yotpo` | `preloaded_reviews` | `json` | Yes | Full review widget payload |
| `yotpo` | `preloaded_star_distribution` | `json` | Yes | `{"1":0,"2":0,...,"5":0}` |
| `yotpo` | `preloaded_product_filters` | `json` | Yes | Yotpo filter metadata |
| `yotpo` | `llm_schema_html` | `single_line_text_field` | Yes | HTML review block for LLMs |

**Notes:**
- `list.*` types store their values as **JSON-encoded strings** (e.g. `'["Peach"]'`), not native arrays. The raw `value` from GraphQL is a string and must be parsed if array access is needed.
- `yotpo` metafields are review widget preload data. They carry a snapshot of review state at the time of migration and will become stale — Yotpo re-populates dynamically once the domain is configured on BC.
- All metafields are written to BC with `permission_set: "read"`.

---

## Source Data Caveats

- **Weight is not fetched.** `weightUnit` is documented as `OUNCES` on Shopify but weight values are not queried. BC requires a non-null weight for physical products; migration uses a placeholder of `1`. Real weights need to be backfilled.
- **`seo.title` is frequently null.** Expect `page_title` to be empty string on most BC products post-migration.
- **`descriptionHtml` contains Shopify-relative links** (e.g. `/collections/...`). These will point to the old Shopify store after migration and should be updated or stripped.
- **Variant cap:** `listAll` hardcodes `variants(first: 100)`. `getOne` pre-fetches the exact count to avoid truncation (Shopify max is 250 per request). Products with more than 250 total variants would need cursor-based pagination (not currently implemented).
- **Image cap:** `images(first: 20)` — products with more than 20 images will be silently truncated.
- **Metafields use aliased singular queries.** Adding a new metafield requires adding an entry to `METAFIELD_DEFS` in `src/graphql/products.js` and documenting it in `.docs/Shopify/metafields.md`.

---

## 2026-04 Notes

| Topic | Status |
|---|---|
| All product read fields (`id`, `title`, `variants`, `options`, `images`, `metafields`, etc.) | ✅ Unchanged |
| Aliased `metafield(namespace, key)` approach | ✅ Confirmed working |
| `productVariantCreate` / `productVariantUpdate` / `productVariantDelete` (single) mutations | ❌ Removed — this project uses REST (`POST /v3/catalog/products`), not these mutations. No action needed. |
| JSON-type metafield writes | ⚠️ Capped at **128KB**. Migrated metafields are all `single_line_text_field` or `number_integer` — unaffected. Excluded yotpo JSON metafields would hit this limit if ever migrated. |
