# Endpoint — Inventory

**Base paths:** `/v3/inventory/locations`, `/v3/inventory/items`, `/v3/inventory/adjustments`  
**Service:** `src/services/bigcommerce/inventory.service.js`  
**API docs:** https://developer.bigcommerce.com/docs/rest-management/inventory

---

> **Location ID:** This store has one location — **id: `1`** (Default location, `BC-LOCATION-1`). Use `location_id: 1` in all adjustment calls.

---

## getLocations — List Inventory Locations

```js
const { getLocations } = require("./services/bigcommerce/inventory.service");

const result = await getLocations();
// result.data → array of location objects
```

**GET** `/v3/inventory/locations`

| Query Param | Type | Description |
|---|---|---|
| `limit` | number | Results per page |
| `page` | number | Page number |
| `location_code` | string | Filter by location code |
| `is_active` | boolean | Filter by active status |

### Location Object Shape

```json
{
  "id": 1,
  "code": "BC-LOCATION-1",
  "label": "Default location",
  "type": "PHYSICAL",
  "enabled": true,
  "country_code": "US",
  "storefront_visibility": true,
  "managed_by_external_source": false
}
```

---

## getItems — Get Inventory Levels

```js
const { getItems } = require("./services/bigcommerce/inventory.service");

const result = await getItems({ sku: "ABC-001" });
// result.data → array of inventory item objects
```

**GET** `/v3/inventory/items`

| Query Param | Type | Description |
|---|---|---|
| `sku` | string | Filter by variant SKU |
| `location_id` | number | Filter by location |
| `limit` | number | Results per page |
| `page` | number | Page number |

### Inventory Item Shape

```json
{
  "identity": {
    "sku": "ABC-001",
    "variant_id": 5,
    "product_id": 1
  },
  "locations": [
    {
      "location_id": 1,
      "location_code": "BC-LOCATION-1",
      "location_enabled": true,
      "available_to_sell": 50,
      "total_inventory_onhand": 50,
      "bin_picking_number": "",
      "warning_level": 0,
      "safety_stock": 0
    }
  ]
}
```

---

## setAbsolute — Set Inventory Level (overwrite)

Overwrites the current quantity with an exact value. Use for initial sync or full stock counts.

```js
const { setAbsolute } = require("./services/bigcommerce/inventory.service");

await setAbsolute([
  { sku: "ABC-001", location_id: 1, quantity: 50 },
  { sku: "ABC-002", location_id: 1, quantity: 12 },
]);
```

**PUT** `/v3/inventory/adjustments/absolute`

```json
{
  "items": [
    {
      "sku": "ABC-001",
      "location_id": 1,
      "quantity": 50
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sku` | string | Yes* | Variant SKU to adjust |
| `variant_id` | number | Yes* | Alternative to `sku` |
| `location_id` | number | Yes | Location to set quantity for |
| `quantity` | number | Yes | New absolute quantity (must be ≥ 0) |

> *One of `sku` or `variant_id` is required per item.

---

## adjustRelative — Adjust Inventory Level (delta)

Adds or subtracts from the current quantity. Use for receiving stock or writing off shrinkage.

```js
const { adjustRelative } = require("./services/bigcommerce/inventory.service");

await adjustRelative([
  { sku: "ABC-001", location_id: 1, quantity: -5 },  // subtract 5
  { sku: "ABC-002", location_id: 1, quantity: 10 },  // add 10
]);
```

**POST** `/v3/inventory/adjustments/relative`

```json
{
  "items": [
    {
      "sku": "ABC-001",
      "location_id": 1,
      "quantity": -5
    }
  ]
}
```

Same fields as absolute — `quantity` is a signed delta (positive = add, negative = subtract).

---

## Migration Behaviour

During product migration, inventory is **not set via this endpoint**. Instead, `inventory_level` is written directly on each variant in the product `POST` body, and BC applies it to the default location automatically.

Use `setAbsolute` after migration to resync inventory from an authoritative source if levels drift.
