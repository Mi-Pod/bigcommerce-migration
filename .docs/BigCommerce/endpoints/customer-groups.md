# Endpoint — Customer Groups

**Base path:** `/v2/customer_groups`  
**Service:** `src/services/bigcommerce/customer-group.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-management/customer-groups

---

> **v2 API:** Customer groups use the v2 REST API, not v3. The URL structure uses path segments for individual resources (no `id:in` batch pattern).

---

## getList — List Customer Groups

```js
const { getList } = require("./services/bigcommerce/customer-group.service");

const result = await getList({ limit: 250, page: 1 });
// result → array of customer group objects (v2 returns array directly, no .data wrapper)
```

**GET** `/v2/customer_groups`

| Query Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page (max 250, default 50) |
| `page` | number | Page number |
| `name` | string | Filter by exact group name |
| `is_default` | boolean | Filter for the default group |

---

## getOne — Get Single Customer Group

```js
const { getOne } = require("./services/bigcommerce/customer-group.service");

const result = await getOne(groupId);
// result → customer group object
```

**GET** `/v2/customer_groups/{groupId}`

---

## create — Create Customer Group

```js
const { create } = require("./services/bigcommerce/customer-group.service");

const result = await create({
  name: "Wholesale A",
  is_default: false,
  discount_rules: [],
});
// result → created customer group object
```

**POST** `/v2/customer_groups`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Group name — must be unique |
| `is_default` | boolean | No | Whether new customers are auto-assigned here |
| `category_access` | object | No | `{ type: "all" \| "specific" \| "none", categories: [] }` |
| `discount_rules` | array | No | Price rules applied to this group |

### Known Groups (this store)

The ID mapping is codified in `src/config/customer-groups.js`.

| ID | Name |
|---|---|
| `1` | Wholesale A |
| `2` | Wholesale B (Low) |
| `3` | Chain Store |
| `4` | Distro A |
| `5` | Distro B (Low) |
| `6` | Master Distro Price |

---

## update — Update Customer Group

```js
const { update } = require("./services/bigcommerce/customer-group.service");

const result = await update(groupId, { name: "Wholesale A (Updated)" });
// result → updated customer group object
```

**PUT** `/v2/customer_groups/{groupId}`

Send only the fields to change.

---

## remove — Delete Customer Group

```js
const { remove } = require("./services/bigcommerce/customer-group.service");

await remove(groupId);
// Returns 204 No Content
```

**DELETE** `/v2/customer_groups/{groupId}`

> **Warning:** Deleting a group does not delete customers in it. Customers lose their group assignment (`customer_group_id` becomes `0`).
