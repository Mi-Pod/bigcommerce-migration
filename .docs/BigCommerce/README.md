# BigCommerce API — Index

This directory contains documentation for interacting with the BigCommerce REST API in this project.

## Contents

| File | Description |
|------|-------------|
| [authentication.md](./authentication.md) | How authentication works, where to find credentials, required env vars |
| [endpoints/brands.md](./endpoints/brands.md) | CRUD for `/v3/catalog/brands` |
| [endpoints/categories.md](./endpoints/categories.md) | CRUD for `/v3/catalog/categories` |
| [endpoints/customer-groups.md](./endpoints/customer-groups.md) | CRUD for `/v2/customer_groups`; known group ID map |
| [endpoints/customers.md](./endpoints/customers.md) | CRUD for `/v3/customers`, addresses, and metafields |
| [endpoints/images.md](./endpoints/images.md) | Create/delete for `/v3/catalog/products/{id}/images` |
| [endpoints/inventory.md](./endpoints/inventory.md) | Locations, item levels, absolute/relative adjustments |
| [endpoints/products.md](./endpoints/products.md) | CRUD for `/v3/catalog/products` |
| [customer-data-shape.md](./customer-data-shape.md) | Field mapping (Shopify → BC), address deduplication, migration flow |
| [product-data-shape.md](./product-data-shape.md) | Field mapping (Shopify → BC), Customer Price Group pattern |

## Base URL

```
https://api.bigcommerce.com/stores/{store_hash}
```

The `store_hash` comes from `BIGCOMMERCE_STORE_HASH` in `.env`.

## Quick Reference

### Products

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v3/catalog/products` | List products |
| `GET` | `/v3/catalog/products/:id` | Get single product |
| `POST` | `/v3/catalog/products` | Create product |
| `PUT` | `/v3/catalog/products/:id` | Update product |
| `DELETE` | `/v3/catalog/products/:id` | Delete product |

### Customers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v3/customers` | List customers |
| `GET` | `/v3/customers?id:in=:id` | Get single customer |
| `POST` | `/v3/customers` | Create customer |
| `PUT` | `/v3/customers` | Update customer |
| `DELETE` | `/v3/customers?id:in=:id` | Delete customer |

## Service Layer

All requests go through `src/api/bigcommerce.js` → `makeRequest(method, path, { params, data })`.

Service wrappers live in `src/services/bigcommerce/`:
- `product.service.js`
- `customer.service.js`
