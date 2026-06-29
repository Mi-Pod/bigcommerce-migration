// src/scripts/export-redirects.js
//
// Generates a URL redirect mapping CSV for the Shopify → BigCommerce migration.
//
// Covers:
//   products    — fetched from Shopify GraphQL; BC URL = /{handle} (set by migrate.js)
//   collections — from migration/data/collection-visibility-map.json + new-categories.json
//   pages       — from exports/.default/pages/index.csv; BC URL matched via BC pages API
//   articles    — fetched from Shopify GraphQL; BC URL matched via BC blog posts API
//
// Output: exports/redirects/url-redirects.csv
//
// Usage: node src/scripts/export-redirects.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { makeRequest } = require("../api/bigcommerce");
const productsGql = require("../graphql/products");
const articlesGql = require("../graphql/articles");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");
const EXPORTS_DIR = path.join(__dirname, "../../exports");
const OUTPUT_DIR = path.join(EXPORTS_DIR, "redirects");
const OUTPUT_CSV = path.join(OUTPUT_DIR, "url-redirects.csv");
const PAGES_CSV = path.join(EXPORTS_DIR, ".default/pages/index.csv");
const COLLECTION_MAP_FILE = path.join(MIGRATION_DIR, "data/collection-visibility-map.json");
const NEW_CATEGORIES_FILE = path.join(MIGRATION_DIR, "data/new-categories.json");

// ── CSV helpers ──────────────────────────────────────────────

function csvEscape(val) {
  const str = val == null ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(...fields) {
  return fields.map(csvEscape).join(",") + "\n";
}

// ── Shopify fetchers ─────────────────────────────────────────

async function fetchShopifyProducts() {
  logger.notice("redirects", "Fetching Shopify products...");
  const products = [];
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await productsGql.getPage(250, cursor);
    products.push(...page.nodes);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  logger.success("redirects", `Shopify products: ${products.length}`);
  return products;
}

async function fetchShopifyArticles() {
  logger.notice("redirects", "Fetching Shopify articles...");
  const articles = [];
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await articlesGql.getPage(250, cursor);
    articles.push(...page.nodes);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  logger.success("redirects", `Shopify articles: ${articles.length}`);
  return articles;
}

// ── BigCommerce fetchers ─────────────────────────────────────

// Returns a Map of category_id → custom_url path.
async function fetchBcCategories() {
  logger.notice("redirects", "Fetching BigCommerce categories...");
  const idToUrl = new Map();
  let page = 1;
  while (true) {
    const res = await makeRequest("GET", "/v3/catalog/categories", { params: { limit: 250, page } });
    const items = res?.data ?? [];
    for (const cat of items) {
      if (cat.custom_url?.url) idToUrl.set(cat.id, cat.custom_url.url);
    }
    if (items.length < 250) break;
    page++;
  }
  logger.success("redirects", `BC categories fetched: ${idToUrl.size}`);
  return idToUrl;
}

// Returns a Map of handle → BC page url (strips leading/trailing slashes for matching).
async function fetchBcPages() {
  logger.notice("redirects", "Fetching BigCommerce pages...");
  const handleToUrl = new Map();
  try {
    let page = 1;
    while (true) {
      const res = await makeRequest("GET", "/v2/pages", { params: { limit: 250, page } });
      if (!Array.isArray(res) || res.length === 0) break;
      for (const p of res) {
        if (!p.url) continue;
        // Derive a handle from the URL: /contact-us/ → contact-us
        const slug = p.url.replace(/^\/|\/$/g, "").split("/").pop();
        if (slug) handleToUrl.set(slug, p.url);
      }
      if (res.length < 250) break;
      page++;
    }
    logger.success("redirects", `BC pages fetched: ${handleToUrl.size}`);
  } catch (err) {
    logger.warning("redirects", `BC pages unavailable (${err.message.split("—")[0].trim()}) — pages will be listed without BC URL`);
  }
  return handleToUrl;
}

// Returns a Map of article handle/slug → BC blog post url.
async function fetchBcBlogPosts() {
  logger.notice("redirects", "Fetching BigCommerce blog posts...");
  const handleToUrl = new Map();
  try {
    let page = 1;
    while (true) {
      const res = await makeRequest("GET", "/v2/blog/posts", { params: { limit: 250, page } });
      if (!Array.isArray(res) || res.length === 0) break;
      for (const post of res) {
        if (!post.url) continue;
        const slug = post.url.replace(/^\/|\/$/g, "").split("/").pop();
        if (slug) handleToUrl.set(slug, post.url);
      }
      if (res.length < 250) break;
      page++;
    }
    logger.success("redirects", `BC blog posts fetched: ${handleToUrl.size}`);
  } catch (err) {
    logger.warning("redirects", `BC blog posts unavailable (${err.message.split("—")[0].trim()}) — articles will be listed without BC URL`);
  }
  return handleToUrl;
}

// ── Pages CSV parser ─────────────────────────────────────────
// Handles both the 8-column (current) and 9-column (with author) header variants.
// Fields by position in data rows: id, title, handle, is_published, ...

function readPagesCsv() {
  if (!fs.existsSync(PAGES_CSV)) {
    logger.warning("redirects", `Pages CSV not found at ${PAGES_CSV} — skipping pages`);
    return [];
  }

  const lines = fs.readFileSync(PAGES_CSV, "utf8").trim().split(/\r?\n/);
  const pages = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line — the only quoted field is title (field 1).
    // Pattern: id,"title",handle,is_published,...  OR  id,title,handle,is_published,...
    let id, title, handle, isPublished;

    const quotedMatch = line.match(/^([^,]+),"((?:[^"]|"")*)",([^,]+),([^,]*),/);
    if (quotedMatch) {
      [, id, title, handle, isPublished] = quotedMatch;
      title = title.replace(/""/g, '"');
    } else {
      const parts = line.split(",");
      [id, title, handle, isPublished] = parts;
    }

    if (handle) {
      pages.push({
        id: (id || "").trim(),
        title: (title || "").trim(),
        handle: handle.trim(),
        isPublished: isPublished?.trim() === "true",
      });
    }
  }

  return pages;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load existing collection map + newly created categories
  logger.notice("redirects", "Loading collection map...");
  const { nav_collections, hidden_collections } = JSON.parse(fs.readFileSync(COLLECTION_MAP_FILE, "utf8"));
  const allCollections = [...nav_collections, ...hidden_collections];

  const newCategories = fs.existsSync(NEW_CATEGORIES_FILE)
    ? JSON.parse(fs.readFileSync(NEW_CATEGORIES_FILE, "utf8"))
    : [];
  const newCatByHandle = new Map(newCategories.map((c) => [c.handle, c]));

  // Fetch BC data for URL resolution
  const [bcCategoryUrlMap, bcPageHandleMap, bcBlogHandleMap] = await Promise.all([
    fetchBcCategories(),
    fetchBcPages(),
    fetchBcBlogPosts(),
  ]);

  // Fetch Shopify data
  const [shopifyProducts, shopifyArticles] = await Promise.all([
    fetchShopifyProducts(),
    fetchShopifyArticles(),
  ]);

  const shopifyPages = readPagesCsv();
  logger.success("redirects", `Shopify pages (from CSV): ${shopifyPages.length}`);

  // Write CSV
  const header = csvRow("type", "shopify_url", "bc_url", "title", "shopify_status", "notes");
  fs.writeFileSync(OUTPUT_CSV, header);

  let totalRows = 0;
  let mappedRows = 0;

  const writeRow = (type, shopifyUrl, bcUrl, title, status, notes = "") => {
    fs.appendFileSync(OUTPUT_CSV, csvRow(type, shopifyUrl, bcUrl, title, status, notes));
    totalRows++;
    if (bcUrl) mappedRows++;
  };

  // ── Collections ──────────────────────────────────────────
  logger.notice("redirects", "Writing collection redirects...");
  for (const col of allCollections) {
    const shopifyUrl = `/collections/${col.handle}`;
    const status = col.in_nav ? "nav" : "hidden";

    // Resolve BC URL: use existing bc_match id first, then new-categories fallback
    let bcUrl = "";
    let notes = "";

    if (col.bc_match?.id) {
      bcUrl = bcCategoryUrlMap.get(col.bc_match.id) || col.bc_match.url || "";
    } else {
      const newCat = newCatByHandle.get(col.handle);
      if (newCat?.bc_id) {
        bcUrl = bcCategoryUrlMap.get(newCat.bc_id) || "";
        if (bcUrl) notes = "created during migration";
      }
    }

    if (!bcUrl) notes = "no BC category match — needs manual redirect";

    writeRow("collection", shopifyUrl, bcUrl, col.title, status, notes);
  }

  // ── Products ─────────────────────────────────────────────
  // BC product URL = /{handle} (set by migrate.js custom_url)
  logger.notice("redirects", "Writing product redirects...");
  for (const prod of shopifyProducts) {
    const shopifyUrl = `/products/${prod.handle}`;
    const bcUrl = `/${prod.handle}`;
    const status = prod.status === "ACTIVE" ? "active" : prod.status?.toLowerCase() || "unknown";
    writeRow("product", shopifyUrl, bcUrl, prod.title, status);
  }

  // ── Pages ────────────────────────────────────────────────
  logger.notice("redirects", "Writing page redirects...");
  for (const page of shopifyPages) {
    const shopifyUrl = `/pages/${page.handle}`;
    const bcUrl = bcPageHandleMap.get(page.handle) || "";
    const status = page.isPublished ? "published" : "draft";
    const notes = bcUrl ? "" : "not yet migrated to BC or different URL — verify manually";
    writeRow("page", shopifyUrl, bcUrl, page.title, status, notes);
  }

  // ── Articles ─────────────────────────────────────────────
  logger.notice("redirects", "Writing article redirects...");
  for (const article of shopifyArticles) {
    const blogHandle = article.blog?.handle || "news";
    const shopifyUrl = `/blogs/${blogHandle}/${article.handle}`;
    const bcUrl = bcBlogHandleMap.get(article.handle) || "";
    const status = article.isPublished ? "published" : "draft";
    const notes = bcUrl ? "" : "not yet migrated to BC — verify manually";
    writeRow("article", shopifyUrl, bcUrl, article.title, status, notes);
  }

  // ── Summary ───────────────────────────────────────────────
  const unmapped = totalRows - mappedRows;
  logger.notice("redirects", `\nDone! → ${OUTPUT_CSV}`);
  logger.info("redirects", `Total: ${totalRows} | Mapped: ${mappedRows} | Unmapped: ${unmapped}`);
  console.log(`\nOutput: ${OUTPUT_CSV}`);

  return { total: totalRows, mapped: mappedRows, unmapped, output: OUTPUT_CSV };
}

main().catch((err) => {
  logger.failure("redirects", "Export failed", err);
  process.exit(1);
});
