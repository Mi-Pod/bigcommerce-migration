# Shopify Metafields

## How to Query Specific Metafields

Shopify's GraphQL API has three metafield query approaches:

| Approach | Returns | Notes |
|---|---|---|
| `metafields(first: N)` | Connection (`edges/node`) | Only returns metafields **owned by the querying app** — third-party and admin-set metafields are silently absent |
| `metafields(identifiers: [...])` | Flat array | Available in 2026-04. May not surface cross-app metafields depending on API scopes. |
| `metafield(namespace, key)` ← **this project** | Single object or `null` | Works for any metafield regardless of ownership — used via field aliases |

**This project uses the aliased singular `metafield` approach.** While `metafields(identifiers: [...])` is available in 2026-04, the aliased approach reliably returns metafields of any ownership (including third-party app metafields like `avatax_excise`) without scope constraints. No code change is needed.

Use the **singular `metafield` field with GraphQL field aliases** — one alias per metafield:

```graphql
product(id: $id) {
  mf_filter_product_category: metafield(namespace: "filter", key: "product_category") {
    namespace key value type
  }
  mf_filter_flavor: metafield(namespace: "filter", key: "flavor") {
    namespace key value type
  }
  # ... one per metafield
}
```

Each alias returns a single `{ namespace, key, value, type }` object, or `null` if not set on the product.

The aliases and collection logic live in `src/graphql/shopify/products.js` (`METAFIELD_DEFS` + `collectMetafields`). Call `collectMetafields(product)` after fetching to get a flat array of set metafields.

```js
const { collectMetafields } = require("../graphql/shopify/products");
const metafields = collectMetafields(p); // [{ namespace, key, value, type }, ...]
```

---

## Targeted Metafields (Migrated to BigCommerce)

These 8 metafields are explicitly requested in `src/graphql/shopify/products.js` and written to BC after product creation.

| Namespace | Key | Shopify Type | Always Populated | Example Value |
|---|---|---|---|---|
| `filter` | `product_category` | `single_line_text_field` | Yes | `"Disposable Vapes"` |
| `filter` | `flavor` | `list.single_line_text_field` | Yes | `'["Peach Ice"]'` |
| `filter` | `type` | `single_line_text_field` | Yes | `"Foger Bit 35K"` |
| `filter` | `product_brand` | `single_line_text_field` | Yes | `"Foger"` |
| `filter` | `product_line` | `single_line_text_field` | Yes | `"Foger Bit"` |
| `filter` | `built_in_usa` | `single_line_text_field` | No | `null` |
| `order_limits` | `order_maximum` | `number_integer` | No | `null` |
| `custom` | `contains` | `list.single_line_text_field` | Yes | `'["Nicotine Option"]'` |

### `list.*` Type Note

`list.single_line_text_field` values are **JSON-encoded strings**, not native arrays. The raw `value` from GraphQL is a string:

```js
m.value // → '["Peach Ice", "Mango"]'
JSON.parse(m.value) // → ["Peach Ice", "Mango"]
```

Values are passed to BigCommerce as-is (string). Parse only if you need array access in migration logic.

---

## Excluded Metafields

These metafields exist on Shopify products but are **not migrated**:

| Namespace | Key | Reason |
|---|---|---|
| `global` | `description_tag` | Duplicates `seo.description` — already mapped to BC `meta_description` |
| `yotpo` | `preloaded_bottomline` | Review snapshot — Yotpo repopulates dynamically once BC domain is configured |
| `yotpo` | `preloaded_reviews` | Same |
| `yotpo` | `preloaded_star_distribution` | Same |
| `yotpo` | `preloaded_product_filters` | Same |
| `yotpo` | `llm_schema_html` | Same |

---

## BigCommerce Write Pattern

Each metafield is written individually after the product is created.

**On create** — POST directly:
```
POST /v3/catalog/products/{id}/metafields
{ "namespace": "filter", "key": "product_category", "value": "...", "permission_set": "read" }
```

**On update** — upsert to avoid 409 duplicates:
1. `GET /v3/catalog/products/{id}/metafields` — fetch existing, build `namespace:key → id` map
2. If found → `PUT /v3/catalog/products/{id}/metafields/{existingId}` with `{ value }`
3. If not found → `POST` as above

All metafields are written with `permission_set: "read"` — visible to storefront but not writable via storefront API.

---

## Adding a New Metafield

1. Add an entry to `METAFIELD_DEFS` in `src/graphql/shopify/products.js` (or `CUSTOMER_METAFIELD_DEFS` in `customers.js`) — `{ alias, namespace, key }`
2. Add a row to the **Targeted Metafields** table above
3. No changes needed in `migrate.js` — the write loop handles all entries generically

---

## 2026-04 Notes

| Feature | Status |
|---|---|
| Aliased `metafield(namespace, key)` | ✅ Confirmed working |
| `metafields(identifiers: [...])` batch query | ✅ Now available (project does not use it) |
| `Metafield.translations` field | ✅ New — query localized metafield values by locale. Not used (single-locale store). |
| `analyticsQueryable` on metafield definitions | ✅ New — surface custom metafields in Shopify Analytics. Not used. |
| JSON-type metafield write cap | ⚠️ **128KB limit** enforced. All migrated metafields are `single_line_text_field` or `number_integer` — unaffected. Excluded yotpo JSON metafields would be at risk if ever migrated. |
