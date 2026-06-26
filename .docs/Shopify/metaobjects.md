# Shopify Metaobjects — API Reference (2026-04)

Metaobjects are merchant-defined custom data structures. Each has a **definition** (schema) and any number of **instances**.

---

## Key Concepts

- **Definition** — declares the `type` slug and its field schema (key, type, validations)
- **Instance** — one record of a given definition type; accessed by `type` or by GID
- `type` is a string slug (e.g. `"faq_item"`, `"testimonial"`)
- `handle` is unique within a type; stable across updates
- `displayName` is the human-readable label resolved from the definition's `displayNameKey`
- Field `value` is always a string (JSON-encoded for complex types like `json`, `list.*`, `rich_text`)
- Field `type` mirrors the definition's field type (e.g. `"single_line_text_field"`, `"json"`, `"file_reference"`)

---

## List All Definitions

```graphql
query GetMetaobjectDefinitions($first: Int!, $after: String) {
  metaobjectDefinitions(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        type
        name
        displayNameKey
        fieldDefinitions {
          key
          type { name }
          required
          validations { name value }
        }
      }
    }
  }
}
```

Variables: `{ first: 50 }`

---

## Count Instances of a Type

```graphql
query CountMetaobjects($type: String!) {
  metaobjectsCount(type: $type) { count }
}
```

---

## Paginate Instances of a Type

```graphql
query GetMetaobjectPage($type: String!, $first: Int!, $after: String) {
  metaobjects(type: $type, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        type
        handle
        displayName
        updatedAt
        fields { key value type }
      }
    }
  }
}
```

Variables: `{ type: "faq_item", first: 250, after: null }`  
Max page size: **250**

---

## Fetch Single Instance by GID

```graphql
query GetMetaobject($id: ID!) {
  metaobject(id: $id) {
    id
    type
    handle
    displayName
    updatedAt
    fields { key value type }
  }
}
```

GID format: `gid://shopify/Metaobject/123456789`

---

## Field Types Reference

| Shopify field type | `value` format |
|--------------------|----------------|
| `single_line_text_field` | plain string |
| `multi_line_text_field` | string with newlines |
| `rich_text` | JSON string (Shopify rich text schema) |
| `number_integer` | `"42"` |
| `number_decimal` | `"3.14"` |
| `boolean` | `"true"` / `"false"` |
| `date` | `"2026-06-25"` |
| `date_time` | ISO 8601 string |
| `url` | plain URL string |
| `json` | JSON-encoded string (up to 128 KB in 2026-04) |
| `file_reference` | GID of a File object |
| `product_reference` | GID of a Product |
| `collection_reference` | GID of a Collection |
| `metaobject_reference` | GID of another Metaobject |
| `list.single_line_text_field` | JSON array of strings |
| `list.file_reference` | JSON array of GIDs |

---

## Export Strategy

1. Call `metaobjectDefinitions` to discover all `type` slugs in the store.
2. For each type, call `metaobjectsCount` then loop `metaobjects(type:, first: 250, after:)` until exhausted.
3. Save each instance as `exports/content/metaobjects/data/{handle}.json`.
4. Append a row to `exports/content/metaobjects/index.csv` per instance.

---

## Notes

- `metaobjectsCount` requires the `type` argument — there is no global count across all types.
- `displayName` may be empty string if the definition's `displayNameKey` points to an unset field.
- `fields` always returns all defined field keys; unset fields have `value: null`.
- The 2026-04 API introduced `metafield identifiers` batch queries, but metaobject field access via `fields { key value }` remains the recommended approach for export.
