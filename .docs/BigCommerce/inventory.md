# Inventory Management — BigCommerce

## Tracking Modes

Set `inventory_tracking` on the product during creation:

| Value | Behaviour |
|---|---|
| `"none"` | No inventory tracked (default) |
| `"product"` | Single quantity for the whole product |
| `"variant"` | Separate quantity per variant ← used in migration |

All migrated products are created with `inventory_tracking: "variant"`.  
Each variant carries `inventory_level` (stock count) from `inventoryQuantity` in Shopify.

---

## Store Locations

Fetched: 2026-06-24 via `GET /v3/inventory/locations`

| Field | Value |
|---|---|
| **id** | `1` |
| **code** | `BC-LOCATION-1` |
| **label** | Default location |
| **type** | PHYSICAL |
| **enabled** | true |
| **country** | US |
| **storefront_visibility** | true |
| **managed_by_external_source** | false |

Use `location_id: 1` in all inventory adjustment calls.

---

## Inventory API (v3)

Service: `src/services/bigcommerce/inventory.service.js`

### Locations

BC supports multi-location inventory. The default location is always **id: 1**.

```
GET /v3/inventory/locations
```

### Get Inventory Levels

```
GET /v3/inventory/items?sku=ABC-001
GET /v3/inventory/items?location_id=1
```

### Set Absolute Level (overwrite)

Use this after migration to correct any drift, or when receiving a full stock count.

```
PUT /v3/inventory/adjustments/absolute
{
  "items": [
    { "sku": "ABC-001", "location_id": 1, "quantity": 50 }
  ]
}
```

### Relative Adjustment (add / subtract)

Use for receiving stock (+) or writing off shrinkage (-).

```
POST /v3/inventory/adjustments/relative
{
  "items": [
    { "sku": "ABC-001", "location_id": 1, "quantity": -5 }
  ]
}
```

---

## Migration Behaviour

During `migrateProduct()`:

1. Product is created with `inventory_tracking: "variant"`
2. Each physical variant is created with `inventory_level` from Shopify's `inventoryQuantity`
3. No separate inventory API call is needed — BC picks up the level from the variant payload

After initial migration, use `setAbsolute` to sync inventory from your source of truth.

---

## Backlog

- Multi-location support: if fulfilling from multiple warehouses, run `GET /v3/inventory/locations` and pass the correct `location_id` per adjustment
- Low-stock alerting: set `inventory_warning_level` on variants to trigger BC's built-in low stock notifications
