# Endpoint — Customers

**Base path:** `/v3/customers`  
**Service:** `src/services/bigcommerce/customer.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-management/customers

---

> **v3 note:** Unlike most REST APIs, BigCommerce v3 customers use a batch pattern — `create` and `update` send arrays, and `getOne`/`remove` use an `id:in` query parameter instead of a path segment.

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
  authentication: { new_password: "SecurePass1!" },
});
// result.data → array with created customer object
```

**POST** `/v3/customers`

The body is sent as an array — the service wrapper handles this automatically.

| Field | Type | Required | Description |
|---|---|---|---|
| `first_name` | string | Yes | First name |
| `last_name` | string | Yes | Last name |
| `email` | string | Yes | Must be unique |
| `phone` | string | No | Phone number |
| `company` | string | No | Company name |
| `authentication` | object | No | `{ new_password }` to set a password |

---

## update — Update Customer

```js
const { update } = require("./services/bigcommerce/customer.service");

const result = await update(customerId, { phone: "555-1234" });
// result.data → array with updated customer object
```

**PUT** `/v3/customers`

The body is sent as an array with the `id` merged in — the service wrapper handles this automatically. Only send fields you want to change.

---

## remove — Delete Customer

```js
const { remove } = require("./services/bigcommerce/customer.service");

await remove(customerId);
// Returns 204 No Content on success
```

**DELETE** `/v3/customers?id:in={customerId}`

> **Warning:** Deletion is permanent. The customer's order history is preserved but the account cannot be recovered.
