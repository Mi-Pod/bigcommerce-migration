# Shopify Blog Posts (Articles) — API Reference (2026-04)

Shopify's content model separates **Blogs** (containers) from **Articles** (individual posts). The `articles` root query lets you paginate across all articles in all blogs without needing to iterate blogs first.

---

## Key Concepts

- **Blog** — a named collection (e.g. "News", "Tips & Tricks"); identified by `id` and `handle`
- **Article** — an individual post belonging to one blog
- `isPublished` — boolean; `true` means visible to storefront customers
- `body` — HTML string (may contain Liquid tags if the theme renders them; export as-is)
- `author` — sub-object with `name` only (`email` field does not exist on `ArticleAuthor` in Admin GraphQL)
- `image` — optional hero image; `url` and `altText`
- `tags` — array of strings
- `publishedAt` — ISO 8601 string; null if not yet published
- `bodySummary` — **does not exist** on `Article` type in Admin GraphQL; omit from queries

---

## Count Articles

```graphql
query ArticlesCount {
  articlesCount { count }
}
```

---

## Paginate Articles (All Blogs)

```graphql
query GetArticlesPage($first: Int!, $after: String) {
  articles(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        handle
        isPublished
        publishedAt
        createdAt
        updatedAt
        tags
        body
        author { name }
        image { url altText }
        blog { id handle title }
      }
    }
  }
}
```

Max page size: **250**

---

## Fetch Single Article by GID

```graphql
query GetArticle($id: ID!) {
  article(id: $id) {
    id
    title
    handle
    isPublished
    publishedAt
    createdAt
    updatedAt
    tags
    body
    author { name }
    image { url altText }
    blog { id handle title }
  }
}
```

GID format: `gid://shopify/Article/123456789`

---

## List Blogs (for reference/mapping)

```graphql
query GetBlogs($first: Int!, $after: String) {
  blogs(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        handle
        title
      }
    }
  }
}
```

---

## Export Strategy

1. Call `articlesCount` for total count.
2. Paginate with `articles(first: 250, after:)` — this spans all blogs automatically.
3. Save each article as `exports/content/blog_posts/data/{handle}.json`.
4. Append a row to `exports/content/blog_posts/index.csv` including `blog_handle` for grouping.

---

## Notes

- `article(id:)` is a root query field — no need to scope through `blog.articles`.
- `body` is HTML; preserve it verbatim for BigCommerce content migration.
- `bodySummary` is capped at 255 characters by Shopify.
- `tags` is an array — join with `|` or `","` in CSV exports to avoid column collisions.
- Articles can be in a `DRAFT` state (`isPublished: false`) even with a `publishedAt` date — check `isPublished`, not just `publishedAt`, to determine visibility.
- The `author.email` field is only populated if the author has a staff account; it may be empty for imported/legacy posts.
