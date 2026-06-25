const shopify = require("../graphql/shopify/products");
const productService = require("../services/bigcommerce/product.service");
const brandService = require("../services/bigcommerce/brand.service");
const categoryService = require("../services/bigcommerce/category.service");
const { makeRequest } = require("../api/bigcommerce");
const CUSTOMER_GROUPS = require("../config/customer-groups");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

const saveJson = (filename, data) => {
  if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

// ── Helpers ──────────────────────────────────────────────────

// Find or create a Price List by name, then link it to a customer group.
// BC uses Price Lists as the mechanism for per-SKU, per-group fixed pricing.
const findOrCreatePriceList = async (name) => {
  const res = await makeRequest("GET", "/v3/pricelists", { params: { name } });
  const match = res.data?.find((pl) => pl.name === name);
  if (match) return match.id;
  const created = await makeRequest("POST", "/v3/pricelists", {
    data: { name, active: true },
  });
  return created.data.id;
};

const linkPriceListToGroup = async (priceListId, customerGroupId) => {
  const group = await makeRequest("GET", `/v2/customer_groups/${customerGroupId}`);
  if (group.price_list_id === priceListId) return;
  await makeRequest("PUT", `/v2/customer_groups/${customerGroupId}`, {
    data: { price_list_id: priceListId },
  });
};

const setPriceRecord = async (priceListId, sku, price) => {
  await makeRequest("PUT", `/v3/pricelists/${priceListId}/records`, {
    data: [{ sku, currency: "USD", price }],
  });
};

const findOrCreateBrand = async (name) => {
  if (!name) return null;
  const res = await brandService.getList({ name });
  const match = res.data?.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (match) {
    logger.trace("migrate", `Brand found: "${name}" -> id ${match.id}`);
    return match.id;
  }
  const created = await brandService.create({ name });
  logger.success("migrate", `Brand created: "${name}" -> id ${created.data.id}`);
  return created.data.id;
};

const findOrCreateCategory = async (name) => {
  if (!name) return null;
  const res = await categoryService.getList({ name });
  const match = res.data?.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) {
    logger.trace("migrate", `Category found: "${name}" -> id ${match.id}`);
    return match.id;
  }
  const created = await categoryService.create({ name, parent_id: 0 });
  logger.success("migrate", `Category created: "${name}" -> id ${created.data.id}`);
  return created.data.id;
};

// ── Main ────────────────────────────────────────────────────

exports.migrateProduct = async (shopifyProductId) => {
  const reqId = "migrate";
  logger.notice(reqId, `Starting migration: ${shopifyProductId}`);

  // 1. Fetch from Shopify
  logger.info(reqId, "Fetching product from Shopify...");
  const data = await shopify.getOne(shopifyProductId);
  const p = data?.product;
  if (!p) throw new Error(`Shopify product not found: ${shopifyProductId}`);
  logger.success(reqId, `Fetched: "${p.title}"`);

  const variants = p.variants.edges.map((e) => e.node);
  const images = p.images.edges.map((e) => e.node);
  const metafields = p.metafields?.edges?.map((e) => e.node) ?? [];

  // 2. Brand & category -- find in BC or create
  logger.info(reqId, `Resolving brand: "${p.vendor}"`);
  const brandId = await findOrCreateBrand(p.vendor);

  logger.info(reqId, `Resolving category: "${p.productType}"`);
  const categoryId = await findOrCreateCategory(p.productType);

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
        price: 0,
        weight: 1,
        inventory_level: v.inventoryQuantity ?? 0,
        option_values: physOpts.map((o) => ({
          option_display_name: o.name,
          label: o.value,
        })),
      });
    }
  }

  // 4. Build product payload
  const bcPayload = {
    name: p.title,
    type: "physical",
    price: 0,
    weight: 1,
    inventory_tracking: "variant",
    brand_id: brandId,
    categories: categoryId ? [categoryId] : [],
    description: p.descriptionHtml,
    is_visible: p.status === "ACTIVE",
    page_title: p.seo?.title || "",
    meta_description: p.seo?.description || "",
    custom_url: { url: `/${p.handle}`, is_customized: true },
    tags: p.tags.join(","),
    images: images.map((img, i) => ({
      image_url: img.url,
      description: img.altText || "",
      is_thumbnail: i === 0,
      sort_order: i,
    })),
    variants: bcVariants,
  };

  // 5. Create product in BC
  logger.info(reqId, `Creating product in BigCommerce: "${p.title}"`);
  const productRes = await productService.create(bcPayload);
  const bcProductId = productRes.data.id;
  logger.success(reqId, `Product created -> bc_id: ${bcProductId}`);

  // 6. Metafields
  const validMetafields = metafields.filter((m) => m.value !== null);
  if (validMetafields.length) {
    logger.info(reqId, `Writing ${validMetafields.length} metafields...`);
    for (const m of validMetafields) {
      await makeRequest("POST", `/v3/catalog/products/${bcProductId}/metafields`, {
        data: { namespace: m.namespace, key: m.key, value: m.value, permission_set: "read" },
      });
    }
    logger.success(reqId, "Metafields written");
  }

  // 7. Customer group pricing via Price Lists
  // Each CPG group gets its own Price List. The list is linked to the BC customer
  // group once, then per-SKU price records are upserted for every product.
  const unresolvedGroups = [];
  let pricingGroupsSet = 0;

  for (const [groupName, entries] of Object.entries(pricingByGroup)) {
    const customerGroupId = CUSTOMER_GROUPS[groupName];
    if (customerGroupId == null) {
      unresolvedGroups.push(groupName);
      continue;
    }

    logger.info(reqId, `Price list: "${groupName}"...`);
    const priceListId = await findOrCreatePriceList(groupName);
    await linkPriceListToGroup(priceListId, customerGroupId);

    for (const { sku, price } of entries) {
      await setPriceRecord(priceListId, sku, price);
    }

    pricingGroupsSet++;
  }

  if (unresolvedGroups.length) {
    logger.warning(reqId, `Unresolved CPG groups (not in config): ${unresolvedGroups.join(", ")}`);
  }
  if (pricingGroupsSet) logger.success(reqId, `Pricing set for ${pricingGroupsSet} groups`);

  // 8. Save result
  const result = {
    shopify_id: shopifyProductId,
    bc_product_id: bcProductId,
    name: p.title,
    brand_id: brandId,
    category_id: categoryId,
    variants_created: bcVariants.length,
    pricing_groups_set: pricingGroupsSet,
    metafields_written: validMetafields.length,
    unresolved_groups: unresolvedGroups,
  };

  const filepath = saveJson(`migrated_${bcProductId}.json`, result);
  logger.notice(reqId, `Done -> ${filepath}`);

  return result;
};
