# BigCommerce API — Index

This directory contains documentation for interacting with the BigCommerce REST API in this project.

## Contents

| File | Description |
|------|-------------|
| [authentication.md](./authentication.md) | How authentication works, where to find credentials, required env vars |
| [endpoints/products.md](./endpoints/products.md) | CRUD operations for the Catalog Products endpoint |
| [endpoints/customers.md](./endpoints/customers.md) | CRUD operations for the Customers endpoint |

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
