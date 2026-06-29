# Navigation — Shopify

Shopify navigation is built from explicit **Menu** objects — separate from collections, products, or pages. Each menu has a `handle` (e.g. `main-menu`, `footer`) and a list of typed `items` that link to storefront resources or arbitrary URLs.

Menus are managed via the **GraphQL Admin API only** — there is no REST endpoint. Read and write operations use the same `shopifyQl()` helper as all other Shopify queries.

**API:** `/admin/api/{version}/graphql.json`  
**Helper:** `src/api/shopify.js` → `shopifyQl(query, variables)`

---

## Menu Item Types

| `type` | Description | `resourceId` |
|---|---|---|
| `COLLECTION` | Links to a collection page | Shopify collection GID |
| `PRODUCT` | Links to a product page | Shopify product GID |
| `PAGE` | Links to a CMS page | Shopify page GID |
| `BLOG` | Links to a blog index | Shopify blog GID |
| `ARTICLE` | Links to a single blog post | Shopify article GID |
| `HTTP` | Custom URL (internal or external) | `null` — use `url` field |
| `FRONTPAGE` | Links to the store homepage | `null` |
| `SEARCH` | Links to the search results page | `null` |
| `SHOP_POLICY` | Links to a store policy page | Shopify policy GID |

---

## Fetch a Single Menu

> **Note:** The `menu` field requires an `id` argument (GID) — `handle` is not accepted. Build the GID from the numeric menu ID: `gid://shopify/Menu/{id}`.

> **Depth:** Shopify menus support 3 levels of item nesting (`items > items > items`). The query in `src/graphql/navigation.js` fetches all 3. Fetching fewer levels silently drops the deepest tier — 3rd-level items (e.g. sub-categories under Disposables) were missed in the initial extraction because the original query only went 2 levels deep. Any `nav-*.json` files extracted before this fix must be re-extracted.

```js
const { shopifyQl } = require("./api/shopify");

const GET_MENU = `
  query getMenu($id: ID!) {
    menu(id: $id) {
      id
      title
      handle
      items {
        id title url type resourceId
        items {
          id title url type resourceId
          items {
            id title url type resourceId
          }
        }
      }
    }
  }
`;

const getMenu = async (id) => {
  const res = await shopifyQl(GET_MENU, { id });
  return res.data.menu;
};

const mainMenu = await getMenu("gid://shopify/Menu/113748344895");
```

**Response shape:**

```json
{
  "id": "gid://shopify/Menu/123456",
  "title": "Main menu",
  "handle": "main-menu",
  "items": [
    {
      "id": "gid://shopify/MenuItem/1",
      "title": "Disposables",
      "url": "/collections/disposables",
      "type": "COLLECTION",
      "resourceId": "gid://shopify/Collection/987654321",
      "items": [
        {
          "id": "gid://shopify/MenuItem/2",
          "title": "Foger Bit",
          "url": "/collections/foger-bit",
          "type": "COLLECTION",
          "resourceId": "gid://shopify/Collection/111222333",
          "items": []
        }
      ]
    },
    {
      "id": "gid://shopify/MenuItem/3",
      "title": "About",
      "url": "/pages/about",
      "type": "PAGE",
      "resourceId": "gid://shopify/Page/444555666",
      "items": []
    }
  ]
}
```

---

## List All Menus

```graphql
query {
  menus(first: 10) {
    edges {
      node {
        id
        title
        handle
      }
    }
  }
}
```

---

## Create / Update / Delete

```graphql
mutation menuCreate($input: MenuCreateInput!) {
  menuCreate(input: $input) {
    menu { id handle title }
    userErrors { field message }
  }
}

mutation menuUpdate($id: ID!, $input: MenuUpdateInput!) {
  menuUpdate(id: $id, input: $input) {
    menu { id handle title }
    userErrors { field message }
  }
}

mutation menuDelete($id: ID!) {
  menuDelete(id: $id) {
    deletedMenuId
    userErrors { field message }
  }
}
```

`MenuCreateInput` and `MenuUpdateInput` accept: `title`, `handle`, `items[]` (each with `title`, `url`, `type`, `resourceId`, and nested `items[]`).

> **Note:** Shopify menu mutations have been available since API version **2022-04** and are confirmed working in **2026-04** (current). The `OnlineStorePage`, `OnlineStoreArticle`, and `OnlineStoreBlog` resource types are deprecated as of 2024-10 — but this does not affect navigation extraction. Nav item `type: PAGE` items still resolve correctly via `resourceId` pointing to a Page GID.

---

## Extract Numeric ID from GID

Shopify `resourceId` values are GIDs (`gid://shopify/Collection/987654321`). Strip to the numeric ID for any downstream lookup:

```js
const numericId = (gid) => gid?.split("/").pop();
// "gid://shopify/Collection/987654321" → "987654321"
```

---

## Migration Notes

When migrating Shopify nav to BigCommerce:

- `type: COLLECTION` items → BC categories (`parent_id: 0` for top-level, `parent_id: <parent>` for nested dropdowns)
- `type: PAGE` items → BC Pages (separate effort; no API automation planned yet)
- `type: HTTP` items → custom links with no BC category equivalent (manual review)
- `type: FRONTPAGE` / `type: SEARCH` → no direct BC analog; skip or handle via storefront theme

`url` is always populated and gives the resolved path (e.g. `/collections/disposables`) — useful for matching against BC category URL slugs when the `title` alone isn't unique.

See [`.docs/BigCommerce/navigation.md`](../BigCommerce/navigation.md) for how to create the corresponding BC category tree.

---

## Known Menus

The two navigation menus active on this store:

| Handle | Shopify ID | Role |
|---|---|---|
| `sidebar-menu` | `113748344895` | Mobile Main Nav |
| `dsk-nav-21` | `179918012479` | Desktop Main Nav |

Query by GID using `getMenu("gid://shopify/Menu/{id}")` in `src/graphql/navigation.js`. The `extractNav(handle)` script helper resolves handle → GID automatically via the `KNOWN_MENUS` table in `src/scripts/navigation.js`.

Use `GET /api/test/nav-validate` to fetch both menus, log a type breakdown, and save raw JSON to `migration/nav-validation.json`. Individual menus can be fetched via `GET /api/test/nav/:handle`.
