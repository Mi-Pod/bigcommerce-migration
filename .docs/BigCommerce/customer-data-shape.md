# Customer Data Shape — Shopify → BigCommerce

## Field Mapping

| Shopify Field | Shopify Location | BigCommerce Field | BC API | Notes |
|---|---|---|---|---|
| `firstName` | customer | `first_name` | customer body | Direct map |
| `lastName` | customer | `last_name` | customer body | Direct map |
| `email` | customer | `email` | customer body | Direct map |
| `phone` | customer | `phone` | customer body | E.164 format — BC accepts as-is |
| `defaultAddress.company` | address | `company` | customer body | Company lives on the address in Shopify; lifted to top-level in BC |
| `emailMarketingConsent.marketingState` | customer | `accepts_marketing_emails` | customer body | `SUBSCRIBED` → `true`; all others → `false` |
| `emailMarketingConsent.marketingState` | customer | `accepts_product_review_abandoned_cart_emails` | customer body | Same consent drives both BC email fields — "Receive ACS/review emails" in BC admin |
| — | — | `authentication.force_reset` | customer body | Always set `true`. **Note:** BC silently ignores this for new customers with no existing password — the UI will show "No". This is expected BC behavior; the customer uses "Forgot Password" on first login. |
| `storeCreditAccounts[].balance.amount` | customer (Plus) | `store_credit_amounts[].amount` | customer body | Sum all balances; omit if 0 |
| `metafields[avatax_excise.customer_type]` | customer metafield | metafield `avatax_excise.customer_type` | `/v3/customers/{id}/metafields` | Same namespace/key on both platforms. Null → omit. |
| `metafields[avatax_excise.customer_no]` | customer metafield | metafield `avatax_excise.customer_no` | `/v3/customers/{id}/metafields` | AvaTax exempt number. Null → omit. |
| `metafields[adv_reg.EIN-Field]` | customer metafield | metafield `adv_reg.EIN-Field` | `/v3/customers/{id}/metafields` | EIN. Key contains a hyphen — passed as-is. Null → omit. |
| `metafields[limits.exempt_order_limits]` | customer metafield | metafield `limits.exempt_order_limits` | `/v3/customers/{id}/metafields` | Order limit override. Null → omit. |
| `metafields[configuration.disable_cart_buttons]` | customer metafield | metafield `configuration.disable_cart_buttons` | `/v3/customers/{id}/metafields` | Cart button flag. Null → omit. |
| `metafields[custom.purchasing_list_subscription]` | customer metafield | metafield `custom.purchasing_list_subscription` | `/v3/customers/{id}/metafields` | Purchasing list sub. Null → omit. |
| `addresses` | customer addresses | addresses | `/v3/customers/addresses` | Deduplicate before creating; see below |
| customer group | — | (skip) | — | Not migrated — customers are assigned to groups manually post-migration |

---

## Migration Decisions

### Force Password Reset
All migrated customers are created with `authentication: { force_reset: true }`. This forces a password reset on first login, since no plaintext passwords are available from Shopify.

### Customer Groups
Customer groups are **not migrated automatically**. After migration, customers are assigned to their correct BC customer group manually or via a separate step that maps Shopify tags or order history.

### Store Credit
Only applicable for Shopify Plus stores. Sum the `balance.amount` values from all `storeCreditAccounts` and write as `store_credit_amounts: [{ amount: <total> }]`. If the store is not Shopify Plus or a customer has no credit, omit the field.

### Tax Exempt Code
Shopify's native `taxExempt: true` boolean is **not mapped** to BC. The AvaTax exempt number (`avatax_excise.customer_no` metafield) is what drives tax exemption in BC — write it as a customer metafield post-create.

---

## BigCommerce Customer POST Shape

Minimal payload for `POST /v3/customers` (body is wrapped in an array by the service):

```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jane@example.com",
  "phone": "+15551234567",
  "company": "ACME Inc.",
  "accepts_marketing_emails": false,
  "store_credit_amounts": [{ "amount": 25.00 }],
  "authentication": {
    "force_reset": true
  },
  "channel_ids": [1]
}
```

Fields omitted when empty/zero: `phone`, `company`, `store_credit_amounts`.

---

## Addresses

Addresses are created **after** the customer via `POST /v3/customers/addresses` (batch endpoint — send as array).

### BC Address Fields

| Field | Type | Source | Notes |
|---|---|---|---|
| `customer_id` | number | BC create response `id` | Required — links address to customer |
| `first_name` | string | `address.firstName` | Direct map |
| `last_name` | string | `address.lastName` | Direct map |
| `company` | string | `address.company` | Optional |
| `address1` | string | `address.address1` | Required |
| `address2` | string | `address.address2` | Optional |
| `city` | string | `address.city` | Required |
| `state_or_province` | string | `address.province` | Full name (e.g. `"Texas"`) |
| `state_or_province_code` | string | `address.provinceCode` | ISO 3166-2 (e.g. `"TX"`) |
| `country_code` | string | `address.countryCodeV2` | ISO 3166-1 alpha-2 (e.g. `"US"`) |
| `postal_code` | string | `address.zip` | Direct map |
| `phone` | string | `address.phone` | Optional |
| `address_type` | string | — | `"residential"` (default); use `"commercial"` if `company` is set |

> **Default address:** BC v3 does not have an explicit `is_default` flag on addresses. Create the Shopify `defaultAddress` first — it will be the first address on record and treated as default by BC's UI.

### Address POST Shape

```json
[
  {
    "customer_id": 1,
    "first_name": "Jane",
    "last_name": "Doe",
    "company": "ACME Inc.",
    "address1": "123 Main St",
    "address2": "Suite 400",
    "city": "Austin",
    "state_or_province": "Texas",
    "state_or_province_code": "TX",
    "country_code": "US",
    "postal_code": "78701",
    "phone": "+15551234567",
    "address_type": "commercial"
  }
]
```

---

## Address Deduplication

Shopify customers frequently have near-duplicate addresses saved with minor formatting differences (e.g. `"Suite 4"` vs `"Ste. 4"`, trailing spaces, capitalization mismatches). Normalize before comparing.

### Normalization Function

```js
function normalizeAddressKey(addr) {
  const clean = (s) =>
    (s || '')
      .toLowerCase()
      .trim()
      .replace(/[.,#]/g, '')           // strip punctuation
      .replace(/\bsuite\b/g, 'ste')    // normalize suite abbreviation
      .replace(/\bapartment\b/g, 'apt')
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\bboulevard\b/g, 'blvd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\broad\b/g, 'rd')
      .replace(/\blane\b/g, 'ln')
      .replace(/\s+/g, ' ')            // collapse internal whitespace
      .trim();

  const postal = (addr.zip || '').replace(/\s+/g, '').toUpperCase();
  const state  = (addr.provinceCode || addr.province || '').toUpperCase();
  const country = (addr.countryCodeV2 || '').toUpperCase();

  return [
    clean(addr.address1),
    clean(addr.city),
    state,
    postal,
    country,
  ].join('|');
}
```

### Deduplication Pattern

```js
function deduplicateAddresses(addresses) {
  const seen = new Set();
  const result = [];

  for (const addr of addresses) {
    const key = normalizeAddressKey(addr);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(addr);
    }
  }

  return result;
}
```

**Usage:** Run `deduplicateAddresses` on the full `addresses` connection before creating BC addresses. The `defaultAddress` should be first in the input array so it survives deduplication and is created first.

> **Caveat:** This key does not include `address2` intentionally — `"Suite 4"` and `"Ste 4"` at the same street address are the same physical location. If a customer has two genuinely different units at the same building, they will be deduped incorrectly. This is an acceptable trade-off for the expected data.

---

## Customer Metafield POST Shape

Written after customer creation, one call per metafield:

**Endpoint:** `POST /v3/customers/{customerId}/metafields`

```json
{
  "namespace": "avatax_excise",
  "key": "customer_no",
  "value": "E1234567",
  "permission_set": "read"
}
```

Only write a metafield if the Shopify source value is non-null. All 6 metafields use `permission_set: "read"` and preserve the same `namespace` and `key` as Shopify.

---

## Composed Output Shape (`composed_{id}.json`)

`composeCustomer()` in `src/scripts/customers.js` saves to `migration/customers/composed_{id}.json`:

```json
{
  "_source_customer_id": "gid://shopify/Customer/2852474519615",
  "_shopify_numeric_id": 2852474519615,
  "_composed_at": "2026-06-25T00:00:00.000Z",
  "customer": {
    "first_name": "Dylan",
    "last_name": "Walters",
    "email": "user@example.com",
    "phone": "+18001234567",
    "company": "ACME Inc.",
    "accepts_marketing_emails": true,
    "store_credit_amounts": [{ "amount": 30 }],
    "authentication": { "force_reset": true },
    "channel_ids": [1]
  },
  "addresses": [
    {
      "first_name": "Dylan",
      "last_name": "Walters",
      "company": "ACME Inc.",
      "address1": "123 Main St",
      "city": "Phoenix",
      "state_or_province": "Arizona",
      "state_or_province_code": "AZ",
      "country_code": "US",
      "postal_code": "85001",
      "address_type": "commercial"
    }
  ],
  "metafields": [
    { "namespace": "avatax_excise", "key": "customer_no", "value": "C0076325", "permission_set": "read" }
  ]
}
```

---

## Migrate Function

`migrateCustomer(shopifyCustomerId)` in `src/scripts/customers.js` orchestrates the full flow:

1. Calls `composeCustomer()` internally (fetches Shopify data, saves `composed_{id}.json`)
2. Checks BC for existing customer by email — returns `{ _action: "skipped" }` if found (idempotent re-runs)
3. Creates customer via `customerService.create()` → captures `bc_customer_id`
4. Creates addresses via `POST /v3/customers/addresses` (batch, all at once)
5. Creates each metafield individually via `POST /v3/customers/{id}/metafields` (BC requires one call per metafield)
6. Saves `migration/customers/migrated_{shopifyNumericId}.json` with full BC response data
7. Returns the saved result object

**Route:** `POST /api/migrate/customers/single` — body `{ shopifyCustomerId: "2147081748549" }`

**Output file structure:**
```json
{
  "_source_customer_id": "gid://shopify/Customer/2147081748549",
  "_shopify_numeric_id": 2147081748549,
  "_migrated_at": "2026-06-25T00:00:00.000Z",
  "_action": "created",
  "bc_customer_id": 42,
  "customer": { ... },
  "addresses": [ ... ],
  "metafields": [ ... ]
}
```

---

## Complete Migration Flow (per customer)

1. Fetch Shopify customer (fields above)
2. Extract company from `defaultAddress.company`
3. Resolve marketing consent from `emailMarketingConsent.marketingState`
4. Sum store credit from `storeCreditAccounts` (if available)
5. `POST /v3/customers` → get `id` from response
6. Deduplicate and order addresses (default first)
7. `POST /v3/customers/addresses` → create all addresses in one batch call
8. For each of the 6 metafields that is non-null: `POST /v3/customers/{id}/metafields`
