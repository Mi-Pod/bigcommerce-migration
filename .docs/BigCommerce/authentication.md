# BigCommerce REST API — Authentication

## Overview

This project uses **Store-level API Account** authentication. Every request to the BigCommerce REST API is authenticated via a static access token passed in the `X-Auth-Token` header — no OAuth flow is needed for server-side migration work.

## Required Credentials

| Env Variable | Description |
|---|---|
| `BIGCOMMERCE_STORE_HASH` | Unique identifier for the store (e.g. `store-abc123`) |
| `BIGCOMMERCE_CLIENT_ID` | App client ID from the API account |
| `BIGCOMMERCE_CLIENT_SECRET` | App client secret from the API account |
| `BIGCOMMERCE_CLIENT_ACCESS_TOKEN` | The token sent with every request |

Copy `.env.example` to `.env` and fill in all four values.

## How to Find Your Credentials

**Store Hash**
Log into the BigCommerce control panel. The store hash is in the URL:
```
https://store-{hash}.mybigcommerce.com/manage/...
```

**API Credentials**
Go to **Settings → API → Store-level API Accounts**. Create or view an account to get the Client ID, Client Secret, and Access Token.

## How Requests Are Authenticated

Every outgoing request is made through `src/api/bigcommerce.js`. The access token is set in the default headers once at startup:

```js
const defaultHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Auth-Token": process.env.BIGCOMMERCE_CLIENT_ACCESS_TOKEN,
};
```

All calls to `makeRequest()` automatically include these headers — no per-request token handling needed.

## API Versions

BigCommerce exposes two active API versions. This project uses:

| Version | Used For |
|---------|----------|
| `v3` | Products (`/v3/catalog/products`) |
| `v3` | Customers (`/v3/customers`) |

Prefer v3 over v2 for new work — v2 is in maintenance mode.

## Required API Scopes

When creating a Store-level API Account, enable at least the following scopes:

| Resource | Permission |
|----------|------------|
| Products | Read-only (migration source) or Modify (migration target) |
| Customers | Read-only (migration source) or Modify (migration target) |

## Error Handling

Authentication errors return HTTP `401 Unauthorized`. The `makeRequest` wrapper surfaces the status and message:

```
BigCommerce API error [401]: Unauthorized
```

Check that `BIGCOMMERCE_CLIENT_ACCESS_TOKEN` is set correctly and the API account has not been deleted or revoked.
