# Shopify Files — API Reference (2026-04)

The `files` root query exposes the store's File Manager — images, videos, and generic files uploaded via Shopify admin or app APIs.

---

## Key Concepts

- Files are a **union type**: `MediaImage | Video | GenericFile`
- Every file has a common `id`, `alt`, `createdAt`, `updatedAt`, `fileStatus`
- `fileStatus` values: `UPLOADED`, `PROCESSING`, `READY`, `FAILED`
- Only `READY` files have resolvable URLs; `PROCESSING`/`FAILED` files may have no URL yet
- `MediaImage` exposes the `image` sub-object with `url`, `width`, `height`
- `Video` exposes `sources[]` (multiple renditions at different qualities)
- `GenericFile` exposes a direct `url` and `mimeType`

---

## Count Files

```graphql
query FilesCount {
  filesCount { count }
}
```

No arguments needed.

---

## Paginate Files

```graphql
query GetFilesPage($first: Int!, $after: String) {
  files(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        alt
        createdAt
        updatedAt
        fileStatus
        ... on MediaImage {
          mimeType
          image { url width height }
        }
        ... on Video {
          filename
          mimeType
          sources { url mimeType format height width }
        }
        ... on GenericFile {
          url
          mimeType
          originalFileSize
        }
      }
    }
  }
}
```

Max page size: **250**

---

## Fetch Single File by GID

```graphql
query GetFile($id: ID!) {
  node(id: $id) {
    ... on MediaImage {
      id alt createdAt updatedAt fileStatus mimeType
      image { url width height }
    }
    ... on Video {
      id alt createdAt updatedAt fileStatus filename mimeType
      sources { url mimeType format height width }
    }
    ... on GenericFile {
      id alt createdAt updatedAt fileStatus url mimeType originalFileSize
    }
  }
}
```

GID format examples:
- `gid://shopify/MediaImage/123456789`
- `gid://shopify/Video/123456789`
- `gid://shopify/GenericFile/123456789`

> Use the `node(id:)` interface for single-file fetch since there is no dedicated `file(id:)` root query.

---

## Filtering

The `files` query supports an optional `query` argument for server-side filtering:

```graphql
files(first: 250, query: "status:READY")
files(first: 250, query: "media_type:IMAGE")
```

Useful filter keys: `status`, `media_type` (`IMAGE`, `VIDEO`, `DOCUMENT`, `GENERIC_FILE`), `filename`

---

## Export Strategy

1. Call `filesCount` to get total.
2. Paginate with `files(first: 250, after:)` until exhausted.
3. Determine file type from the `__typename` or inline-fragment presence.
4. Save each file record as `exports/content/files/data/{id-slug}.json`.
5. Append a row to `exports/content/files/index.csv`.

---

## Notes

- There is no `file(id:)` root query — use `node(id:)` for single-file fetches.
- `MediaImage.image.url` may include a CDN path with transform parameters; strip query params for the canonical URL.
- `Video.sources` typically returns 3–4 renditions; store all for downstream selection.
- `originalFileSize` on `GenericFile` is in bytes.
- Files with `fileStatus: FAILED` should be noted but not treated as exported.
