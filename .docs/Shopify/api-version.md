# Shopify Admin API — Version Reference

**Current version:** `2026-04`  
**Configured via:** `SHOPIFY_API_VERSION` in `.env`  
**Used in:** `src/api/shopify.js` → endpoint `https://{store}.myshopify.com/admin/api/2026-04/graphql.json`

Shopify releases API versions quarterly (January, April, July, October). Each version is supported for 12 months after release. See [Shopify API versioning](https://shopify.dev/docs/api/usage/versioning).

---

## 2026-04 Compatibility — This Project

Everything this project queries via GraphQL is confirmed working in 2026-04.

| Feature / Query | Status | Notes |
|---|---|---|
| `customer(id)` | ✅ | No changes |
| `customer.emailMarketingConsent` | ✅ | No changes |
| `customer.smsMarketingConsent` | ✅ | No changes |
| `customer.addresses` | ✅ | No changes |
| `customer.defaultAddress` | ✅ | No changes |
| `customer.storeCreditAccounts` | ✅ | No changes (Shopify Plus only) |
| `customer.taxExempt` | ✅ | No changes |
| `product(id)`, `products(...)` | ✅ | No changes to read queries |
| `product.variants`, `product.options` | ✅ | No changes |
| `product.metafield(namespace, key)` (aliased) | ✅ | Confirmed — this project's approach |
| `menus(first: N)`, `menu(id)` | ✅ | No changes |
| Menu create/update/delete mutations | ✅ | No changes |
| `shopifyQl()` helper / GraphQL endpoint | ✅ | URL structure unchanged |

---

## What Changed in 2026-04 (Relevant to This Project)

### Metafields — `identifiers` Batch Query Now Available

In versions prior to ~2023-10, the only way to fetch specific metafields was the aliased singular `metafield(namespace, key)` pattern. The `metafields(identifiers: [...])` batch approach is now confirmed available in 2026-04.

**This project continues to use the aliased singular approach** — it works for metafields of any ownership (including third-party app metafields like `avatax_excise`), whereas `identifiers` may not reliably surface cross-app metafields depending on scopes. No code change is needed. See [metafields.md](metafields.md) for details.

### Metafield Translations (New)

A `translations` field is now available on the `Metafield` type:

```graphql
metafield(namespace: "...", key: "...") {
  value
  translations(locale: "fr") {
    value
    locale
  }
}
```

Not used by this migration project (single-locale store), documented for awareness.

### JSON Metafield Write Cap: 128KB

Writes to `json`-type metafields are now capped at **128KB**. This project does not write any JSON-type metafields — all migrated metafields are `single_line_text_field` or `number_integer`. The large yotpo JSON metafields on products are explicitly excluded from migration. No action needed.

### Metafield `analyticsQueryable` Capability (New)

Metafield definitions can now be flagged as `analyticsQueryable` to surface them in Shopify Analytics. Not used by this project.

---

## What Changed in 2026-04 (Not Relevant to This Project)

| Change | Why Not Relevant |
|---|---|
| Checkout metafields removed from UI extensions | This project has no checkout customization |
| `inventoryAdjustQuantities` and 17 other mutations now require `@idempotent` directive | This project uses the REST inventory API, not GraphQL mutations |
| `productVariantCreate`, `productVariantUpdate`, `productVariantDelete` (single) mutations removed | This project creates products and variants via REST (`POST /v3/catalog/products`), not GraphQL mutations |
| `SubscriptionBillingAttempt.errorCode` / `errorMessage` hidden | No subscription billing |
| REST `pre_tax_price` removed from order line items (AvaTax 1.0 stores only) | We query via GraphQL Admin API, not REST orders |
| New discount API fields (`purchaseType`, `recurringCycleLimit`) | No discount mutations |
| `OnlineStorePage` / `OnlineStoreArticle` / `OnlineStoreBlog` types deprecated (since 2024-10) | Navigation item `type: PAGE` still works — it uses `resourceId` pointing to a Page GID, not the deprecated `OnlineStorePage` type directly |

---

## Version History (This Project)

| Date | Version | Notes |
|---|---|---|
| 2026-06 | `2026-04` | Current. Upgraded from prior version. |
