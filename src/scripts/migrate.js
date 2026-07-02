const shopify = require("../graphql/products");
const { collectMetafields, getProductCollections } = shopify;
const { products, brands, categories, images, customerGroups } = require("@mipod/bigcommerce");
const { makeRequest } = require("../api/bigcommerce");
const CUSTOMER_GROUPS = require("../config/customer-groups");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

// Sites that use BC Price Lists for per-customer-group pricing (wholesale model).
// All other sites write the Shopify variant price directly onto the BC variant.
const PRICE_LIST_SITES = new Set(["B2B"]);

const MIGRATION_DIR = path.join(__dirname, "../../migration");

const saveJson = (filename, data) => {
  if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

// ── Helpers ──────────────────────────────────────────────────

const findOrCreatePriceList = async (site, name) => {
  const res = await makeRequest(site, "GET", "/v3/pricelists", { params: { name } });
  const match = res.data?.find((pl) => pl.name === name);
  if (match) return match.id;
  const created = await makeRequest(site, "POST", "/v3/pricelists", {
    data: { name, active: true },
  });
  return created.data.id;
};

const linkPriceListToGroup = async (site, priceListId, customerGroupId) => {
  const group = await customerGroups.getOne(site, customerGroupId);
  if (group.price_list_id === priceListId) return;
  await customerGroups.update(site, customerGroupId, { price_list_id: priceListId });
};

const setPriceRecord = async (site, priceListId, sku, price) => {
  await makeRequest(site, "PUT", `/v3/pricelists/${priceListId}/records`, {
    data: [{ sku, currency: "USD", price }],
  });
};

const findOrCreateBrand = async (site, name) => {
  if (!name) return null;
  const res = await brands.getList(site, { name });
  const match = res.data?.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (match) {
    logger.trace("migrate", `Brand found: "${name}" -> id ${match.id}`);
    return match.id;
  }
  const created = await brands.create(site, { name });
  logger.success("migrate", `Brand created: "${name}" -> id ${created.data.id}`);
  return created.data.id;
};

let _collectionMap = null;
let _collectionHandleMap = null;
const loadCollectionMap = () => {
  if (_collectionMap) return _collectionMap;
  const mapPath = path.join(MIGRATION_DIR, "data/collection-visibility-map.json");
  if (!fs.existsSync(mapPath)) return null;
  const { nav_collections, hidden_collections } = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const all = [...nav_collections, ...hidden_collections];
  _collectionMap = new Map(all.map((e) => [e.shopify_id, e]));
  _collectionHandleMap = new Map(all.map((e) => [e.handle, e]));
  return _collectionMap;
};

const COLLECTION_HREF_RE = /href="(?:[^"]*\/)?collections\/([a-z0-9-]+)([^"]*)"/gi;

const rewriteDescriptionUrls = (html, reqId) => {
  if (!html) return html;
  loadCollectionMap();
  const overrides = loadOverrides();

  let rewrites = 0;
  const result = html.replace(COLLECTION_HREF_RE, (_, handle, rest) => {
    const overrideUrl = overrides[handle]?.bc_url;
    if (overrideUrl) {
      rewrites++;
      return `href="${overrideUrl.replace(/\/$/, "")}${rest}"`;
    }

    const entry = _collectionHandleMap?.get(handle);
    const bcUrl = entry?.bc_match?.url;
    if (bcUrl) {
      rewrites++;
      return `href="${bcUrl.replace(/\/$/, "")}${rest}"`;
    }
    logger.warning(reqId ?? "migrate", `Description URL not in collection map: /collections/${handle}`);
    return `href="/collections/${handle}${rest}"`;
  });

  if (rewrites > 0) logger.info(reqId ?? "migrate", `Rewrote ${rewrites} collection URL(s) in description`);
  return result;
};

const OVERRIDE_FILE = path.join(MIGRATION_DIR, "tasks/override.json");
const loadOverrides = () => {
  if (!fs.existsSync(OVERRIDE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(OVERRIDE_FILE, "utf8")).collections ?? {};
  } catch {
    logger.warning("migrate", "Failed to parse override.json — overrides skipped");
    return {};
  }
};

const _createdCategories = new Map();
const NEW_CATEGORIES_FILE = path.join(MIGRATION_DIR, "data/new-categories.json");

const flushNewCategories = () => {
  if (_createdCategories.size === 0) return;
  const dataDir = path.join(MIGRATION_DIR, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(NEW_CATEGORIES_FILE, JSON.stringify([..._createdCategories.values()], null, 2));
};

const resolveCategories = async (site, productCollections, reqId) => {
  const collectionMap = loadCollectionMap();
  const overrides = loadOverrides();
  const categoryIds = [];

  for (const col of productCollections) {
    const override = overrides[col.handle];

    if (override?.skip) {
      logger.trace(reqId, `Skipping collection "${col.title}" (override: skip)`);
      continue;
    }

    if (override?.bc_id != null) {
      logger.trace(reqId, `Using override bc_id ${override.bc_id} for "${col.title}"`);
      categoryIds.push(override.bc_id);
      continue;
    }

    const entry = collectionMap?.get(col.id);

    if (entry?.bc_match) {
      if (override?.is_visible != null && entry.bc_match.is_visible !== override.is_visible) {
        logger.warning(reqId, `Updating visibility for "${col.title}" -> is_visible: ${override.is_visible} (override)`);
        await categories.update(site, entry.bc_match.id, { is_visible: override.is_visible });
      }
      logger.trace(reqId, `Category found: "${col.title}" -> bc_id ${entry.bc_match.id}`);
      categoryIds.push(entry.bc_match.id);
      continue;
    }

    if (_createdCategories.has(col.id)) {
      const cached = _createdCategories.get(col.id);
      logger.trace(reqId, `Category reused (created this run): "${col.title}" -> bc_id ${cached.bc_id}`);
      categoryIds.push(cached.bc_id);
      continue;
    }

    const isVisible = override?.is_visible ?? entry?.in_nav ?? false;
    logger.warning(reqId, `Category missing in BC: "${col.title}" — creating (is_visible: ${isVisible})`);
    const created = await categories.create(site, { name: col.title, parent_id: 0, is_visible: isVisible });
    const newId = created.data.id;
    logger.success(reqId, `Category created: "${col.title}" -> bc_id ${newId}`);
    categoryIds.push(newId);

    const newEntry = {
      shopify_id: col.id,
      handle: col.handle,
      title: col.title,
      bc_id: newId,
      is_visible: isVisible,
    };

    _createdCategories.set(col.id, newEntry);
    flushNewCategories();

    if (collectionMap) {
      collectionMap.set(col.id, {
        shopify_id: col.id,
        handle: col.handle,
        title: col.title,
        in_nav: isVisible,
        bc_match: { id: newId, name: col.title, is_visible: isVisible },
      });
    }
  }

  return categoryIds;
};

// ── Main ────────────────────────────────────────────────────

exports.migrateProduct = async (site, shopifyProductId, { outputJson = true } = {}) => {
  const reqId = "migrate";
  logger.notice(reqId, `Starting migration: ${shopifyProductId}`);

  // 1. Fetch from Shopify
  logger.info(reqId, "Fetching product from Shopify...");
  const data = await shopify.getOne(site, shopifyProductId);
  const p = data?.product;
  if (!p) throw new Error(`Shopify product not found: ${shopifyProductId}`);
  logger.success(reqId, `Fetched: "${p.title}"`);

  const variants = p.variants.edges.map((e) => e.node);
  const productImages = p.images.edges.map((e) => e.node);
  const metafields = collectMetafields(p);

  // 2. Brand & categories
  logger.info(reqId, `Resolving brand: "${p.vendor}"`);
  const brandId = await findOrCreateBrand(site, p.vendor);

  logger.info(reqId, `Fetching product collections from Shopify...`);
  const productCollections = await getProductCollections(site, shopifyProductId);
  logger.info(reqId, `Product is in ${productCollections.length} collection(s): ${productCollections.map((c) => c.title).join(", ") || "none"}`);

  const categoryIds = await resolveCategories(site, productCollections, reqId);

  // 3. Separate CPG option from physical variants
  const cpgOption = p.options.find((o) => o.position === 1);
  const pricingByGroup = {};
  const bcVariants = [];
  const seenSkus = new Set();

  for (const v of variants) {
    const cpgValue = v.selectedOptions.find((o) => o.name === cpgOption?.name)?.value;
    const physOpts = v.selectedOptions.filter((o) => o.name !== cpgOption?.name);
    const skuBase = physOpts.map((o) => o.value).join("-") || v.sku;

    if (cpgValue) {
      if (!pricingByGroup[cpgValue]) pricingByGroup[cpgValue] = [];
      pricingByGroup[cpgValue].push({ sku: v.sku, price: parseFloat(v.price) });
    }

    if (!seenSkus.has(skuBase)) {
      seenSkus.add(skuBase);
      bcVariants.push({
        sku: v.sku,
        price: PRICE_LIST_SITES.has(site) ? 0 : parseFloat(v.price),
        weight: 1,
        inventory_level: v.inventoryQuantity ?? 0,
        ...(v.image?.url ? { image_url: v.image.url } : {}),
        option_values: physOpts.map((o) => ({
          option_display_name: o.name,
          label: o.value,
        })),
      });
    }
  }

  // 4. Build product payload
  const isSimple = bcVariants.length === 1 && bcVariants[0].option_values.length === 0;

  const description = rewriteDescriptionUrls(p.descriptionHtml, reqId);

  const bcPayload = {
    name: p.title,
    type: "physical",
    price: PRICE_LIST_SITES.has(site) ? 0 : parseFloat(bcVariants[0]?.price ?? 0),
    weight: 1,
    brand_id: brandId,
    categories: categoryIds,
    description,
    is_visible: p.status === "ACTIVE",
    page_title: p.seo?.title || p.title,
    meta_description: p.seo?.description || "",
    custom_url: { url: `/${p.handle}`, is_customized: true },
    tags: p.tags.join(","),
    images: productImages.map((img, i) => ({
      image_url: img.url,
      description: img.altText || "",
      is_thumbnail: i === 0,
      sort_order: i,
    })),
    ...(isSimple
      ? {
          sku: bcVariants[0].sku,
          inventory_tracking: "product",
          inventory_level: bcVariants[0].inventory_level,
        }
      : {
          inventory_tracking: "variant",
          variants: bcVariants,
        }),
  };

  // 5. Create product in BC — or find + update if the URL already exists
  logger.info(reqId, `Creating ${isSimple ? "simple" : `${bcVariants.length}-variant`} product in BigCommerce: "${p.title}"`);

  let bcProductId;
  let action = "created";

  try {
    const productRes = await products.create(site, bcPayload);
    bcProductId = productRes.data.id;
    logger.success(reqId, `Product created -> bc_id: ${bcProductId}`);
  } catch (createErr) {
    if (!createErr.message.includes("[409]")) throw createErr;

    logger.warning(reqId, `Duplicate URL — searching for existing product with handle "/${p.handle}"...`);
    const searchRes = await products.getList(site, { name: p.title });
    const existing = (searchRes.data ?? []).find((prod) => prod.custom_url?.url === `/${p.handle}`);
    if (!existing) {
      throw new Error(`409 conflict but no existing product found for handle "/${p.handle}". Check BigCommerce manually.`);
    }

    bcProductId = existing.id;
    action = "updated";
    logger.notice(reqId, `Found existing product -> bc_id: ${bcProductId}. Updating...`);

    const { custom_url: _url, images: _img, variants: _v, ...updateFields } = bcPayload;
    await products.update(site, bcProductId, updateFields);
    logger.success(reqId, `Product updated -> bc_id: ${bcProductId}`);
  }

  // 6. Metafields
  const validMetafields = metafields.filter((m) => m.value !== null);
  if (validMetafields.length) {
    logger.info(reqId, `Writing ${validMetafields.length} metafields...`);

    let existingMfById = {};
    if (action === "updated") {
      const existingMfRes = await makeRequest(site, "GET", `/v3/catalog/products/${bcProductId}/metafields`);
      existingMfById = (existingMfRes.data ?? []).reduce((acc, m) => {
        acc[`${m.namespace}:${m.key}`] = m.id;
        return acc;
      }, {});
    }

    for (const m of validMetafields) {
      const existingId = existingMfById[`${m.namespace}:${m.key}`];
      if (existingId) {
        await makeRequest(site, "PUT", `/v3/catalog/products/${bcProductId}/metafields/${existingId}`, {
          data: { value: m.value },
        });
      } else {
        await makeRequest(site, "POST", `/v3/catalog/products/${bcProductId}/metafields`, {
          data: { namespace: m.namespace, key: m.key, value: m.value, permission_set: "read" },
        });
      }
    }
    logger.success(reqId, "Metafields written");
  }

  // 7. Customer group pricing via Price Lists (B2B only)
  const unresolvedGroups = [];
  let pricingGroupsSet = 0;

  if (PRICE_LIST_SITES.has(site) && Object.keys(pricingByGroup).length > 0) {
    for (const [groupName, entries] of Object.entries(pricingByGroup)) {
      const customerGroupId = CUSTOMER_GROUPS[groupName];
      if (customerGroupId == null) {
        unresolvedGroups.push(groupName);
        continue;
      }

      logger.info(reqId, `Price list: "${groupName}"...`);
      const priceListId = await findOrCreatePriceList(site, groupName);
      await linkPriceListToGroup(site, priceListId, customerGroupId);

      for (const { sku, price } of entries) {
        await setPriceRecord(site, priceListId, sku, price);
      }

      pricingGroupsSet++;
    }

    if (unresolvedGroups.length) {
      logger.warning(reqId, `Unresolved CPG groups (not in config): ${unresolvedGroups.join(", ")}`);
    }
    if (pricingGroupsSet) logger.success(reqId, `Pricing set for ${pricingGroupsSet} groups`);
  } else if (!PRICE_LIST_SITES.has(site)) {
    logger.info(reqId, `Site "${site}" does not use price lists — variant prices written directly`);
  }

  // 8. Save result
  const result = {
    shopify_id: shopifyProductId,
    bc_product_id: bcProductId,
    action,
    name: p.title,
    brand_id: brandId,
    category_ids: categoryIds,
    collections: productCollections.map((c) => ({ shopify_id: c.id, handle: c.handle, title: c.title })),
    is_simple: isSimple,
    variants_created: isSimple ? 0 : bcVariants.length,
    pricing_groups_set: pricingGroupsSet,
    metafields_written: validMetafields.length,
    unresolved_groups: unresolvedGroups,
  };

  if (outputJson) {
    const filepath = saveJson(`migrated_${bcProductId}.json`, result);
    logger.notice(reqId, `Done -> ${filepath}`);
  } else {
    logger.notice(reqId, "Done (outputJson disabled — no file written)");
  }

  return result;
};
