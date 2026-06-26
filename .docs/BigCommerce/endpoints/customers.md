# Endpoint — Customers

**Base path:** `/v3/customers`  
**Service:** `src/services/bigcommerce/customer.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-management/customers

---

> **v3 batch pattern:** Unlike most REST APIs, BC v3 customers use a batch pattern — `create` and `update` send arrays, and `getOne`/`remove` use an `id:in` query parameter instead of a path segment. The service wrapper handles this automatically.

---

## getList — List Customers

```js
const { getList } = require("./services/bigcommerce/customer.service");

const result = await getList({ limit: 5, page: 1 });
// result.data → array of customer objects
// result.meta → pagination info
```

**GET** `/v3/customers`

| Query Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page (max 250, default 50) |
| `page` | number | Page number |
| `email:in` | string | Comma-separated email addresses |
| `id:in` | string | Comma-separated customer IDs |
| `name:like` | string | Partial name match |
| `include` | string | Sub-resources: `addresses`, `storecredit`, `attributes`, `formfields` |

---

## getOne — Get Single Customer

```js
const { getOne } = require("./services/bigcommerce/customer.service");

const result = await getOne(customerId);
// result.data → array with one customer object
```

**GET** `/v3/customers?id:in={customerId}`

---

## create — Create Customer

```js
const { create } = require("./services/bigcommerce/customer.service");

const result = await create({
  first_name: "Jane",
  last_name: "Doe",
  email: "jane.doe@example.com",
  phone: "+15551234567",
  company: "ACME Inc.",
  accepts_marketing_emails: true,
  store_credit_amounts: [{ amount: 25.00 }],
  authentication: { force_reset: true },
  channel_ids: [1],
});
// result.data → array with created customer object
```

**POST** `/v3/customers`

Body is sent as an array — the service wrapper handles this automatically.

| Field | Type | Required | Description |
|---|---|---|---|
| `first_name` | string | Yes | First name |
| `last_name` | string | Yes | Last name |
| `email` | string | Yes | Must be unique |
| `phone` | string | No | Phone number (E.164 accepted) |
| `company` | string | No | Company name |
| `customer_group_id` | number | No | ID of BC customer group (0 = no group) |
| `notes` | string | No | Internal admin notes |
| `tax_exempt_category` | string | No | BC native tax category code — leave blank; use AvaTax metafield instead |
| `accepts_marketing_emails` | boolean | No | Email marketing consent — "Marketing emails" in admin |
| `accepts_product_review_abandoned_cart_emails` | boolean | No | ACS (abandoned cart) + review email consent — "Receive ACS/review emails" in admin. Set to the same value as `accepts_marketing_emails` for migrated customers. |
| `store_credit_amounts` | `[{ amount: number }]` | No | Store credit to apply on creation |
| `authentication` | object | No | `{ force_reset: true }` to require password reset on next login |
| `channel_ids` | `[number]` | No | Channel to associate customer with (default channel ID is `1`) |

---

## update — Update Customer

```js
const { update } = require("./services/bigcommerce/customer.service");

const result = await update(customerId, { phone: "555-1234" });
// result.data → array with updated customer object
```

**PUT** `/v3/customers`

Body is sent as an array with `id` merged in — the service wrapper handles this. Send only fields to change.

---

## remove — Delete Customer

```js
const { remove } = require("./services/bigcommerce/customer.service");

await remove(customerId);
// Returns 204 No Content
```

**DELETE** `/v3/customers?id:in={customerId}`

> **Warning:** Deletion is permanent. Order history is preserved but the account cannot be recovered.

---

## Addresses

Customer addresses live under a separate batch endpoint. Addresses must be created **after** the customer — the `customer_id` from the create response is required.

### Create Addresses

**POST** `/v3/customers/addresses`

Body is an array of address objects.

```js
await makeRequest("POST", "/v3/customers/addresses", {
  data: [
    {
      customer_id: 1,
      first_name: "Jane",
      last_name: "Doe",
      company: "ACME Inc.",
      address1: "123 Main St",
      address2: "Suite 400",
      city: "Austin",
      state_or_province: "Texas",
      state_or_province_code: "TX",
      country_code: "US",
      postal_code: "78701",
      phone: "+15551234567",
      address_type: "commercial",
    },
  ],
});
```

| Field | Type | Required | Description |
|---|---|---|---|
| `customer_id` | number | Yes | ID of the owning customer |
| `first_name` | string | Yes | First name |
| `last_name` | string | Yes | Last name |
| `address1` | string | Yes | Street line 1 |
| `city` | string | Yes | City |
| `state_or_province` | string | Yes | Full state/province name |
| `state_or_province_code` | string | No | ISO 3166-2 code (e.g. `"TX"`) |
| `country_code` | string | Yes | ISO 3166-1 alpha-2 (e.g. `"US"`) |
| `postal_code` | string | No | Postal/ZIP code |
| `company` | string | No | Company name |
| `address2` | string | No | Unit/suite/apt |
| `phone` | string | No | Phone number |
| `address_type` | string | No | `"residential"` (default) or `"commercial"` |

> **Default address:** BC v3 does not expose an explicit `is_default` flag. Create the intended default address first — it will be the first on record.

### List Addresses

**GET** `/v3/customers/addresses?customer_id:in={customerId}`

### Delete Address

**DELETE** `/v3/customers/addresses?id:in={addressId}`

---

## Metafields

Customer metafields are per-customer. Write after the customer is created.

### Create Metafield

**POST** `/v3/customers/{customerId}/metafields`

```js
await makeRequest("POST", `/v3/customers/${customerId}/metafields`, {
  data: {
    namespace: "avatax_excise",
    key: "customer_no",
    value: "E1234567",
    permission_set: "read",
  },
});
```

| Field | Type | Required | Description |
|---|---|---|---|
| `namespace` | string | Yes | Logical grouping (e.g. `"avatax_excise"`) |
| `key` | string | Yes | Field name within the namespace |
| `value` | string | Yes | The value to store (always a string) |
| `permission_set` | string | Yes | `"read"` (storefront read-only) or `"write"` |

### List Metafields

**GET** `/v3/customers/{customerId}/metafields`

### Delete Metafield

**DELETE** `/v3/customers/{customerId}/metafields/{metafieldId}`
