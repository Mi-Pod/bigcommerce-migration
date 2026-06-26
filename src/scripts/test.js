const fs = require("fs");
const path = require("path");
const shopify = require("../graphql/shopify/products");
const { collectMetafields } = shopify;
const imageService = require("../services/bigcommerce/image.service");
const CUSTOMER_GROUPS = require("../config/customer-groups");
const logger = require("../utils/logger");

const PRODUCT_ID = `gid://shopify/Product/8191177064511`;
const MIGRATION_DIR = path.join(__dirname, "../../migration");

const ensureMigrationDir = () => {
  if (!fs.existsSync(MIGRATION_DIR)) {
    fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  }
};

const saveJson = (filename, data) => {
  ensureMigrationDir();
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

const detectType = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

// ─────────────────────────────────────────────────────────────
// 1. FIELD VALIDATION
//    Pulls a single Shopify product and documents every required
//    field as { type, example, populated }.
//    Output: migration/validation.json
// ─────────────────────────────────────────────────────────────
exports.fieldValidation = async () => {
  const reqId = "field-validation";
  logger.notice(reqId, `Fetching Shopify product: ${PRODUCT_ID}`);

  const data = await shopify.getOne(PRODUCT_ID);
  const p = data.product;

  if (!p) throw new Error(`Product not found: ${PRODUCT_ID}`);

  logger.info(reqId, `Product retrieved: "${p.title}"`);

  const variants = p.variants.edges.map((e) => e.node);
  const images = p.images.edges.map((e) => e.node);
  const metafields = collectMetafields(p);

  const field = (value) => ({
    type: detectType(value),
    example: Array.isArray(value) ? value.slice(0, 2) : value,
    populated: value !== null && value !== undefined && value !== "",
  });

  const validation = {
    _product_id: PRODUCT_ID,
    _retrieved_at: new Date().toISOString(),

    // Core fields
    title:        field(p.title),
    description:  field(p.descriptionHtml),
    status:       field(p.status),
    productType:  field(p.productType),
    vendor:       field(p.vendor),
    handle:       field(p.handle),
    tags:         field(p.tags),

    // SEO
    "seo.title":       field(p.seo?.title),
    "seo.description": field(p.seo?.description),

    // Images
    images: {
      type: "array",
      count: images.length,
      example: images.slice(0, 1).map((i) => ({ url: i.url, altText: i.altText })),
      populated: images.length > 0,
    },

    // Options
    options: {
      type: "array",
      count: p.options.length,
      example: p.options,
      populated: p.options.length > 0,
    },

    // Variants
    variants: {
      type: "array",
      count: variants.length,
      example: variants.slice(0, 2).map((v) => ({
        sku: v.sku,
        price: v.price,
        selectedOptions: v.selectedOptions,
      })),
      populated: variants.length > 0,
    },

    // Metafields
    metafields: Object.fromEntries(
      [
        "order_limits.order_maximum",
        "filter.built_in_usa",
        "filter.product_category",
        "filter.flavor",
        "filter.type",
        "filter.product_brand",
        "filter.product_line",
        "custom.contains",
      ].map((key) => {
        const [namespace, metaKey] = key.split(".");
        const match = metafields.find(
          (m) => m.namespace === namespace && m.key === metaKey
        );
        return [
          key,
          {
            type: match?.type || "null",
            example: match?.value || null,
            populated: !!match,
          },
        ];
      })
    ),
  };

  const unpopulated = Object.entries(validation)
    .filter(([, v]) => typeof v === "object" && v !== null && v.populated === false)
    .map(([k]) => k);

  if (unpopulated.length > 0) {
    logger.warning(reqId, `Unpopulated fields: ${unpopulated.join(", ")}`);
  }

  const filepath = saveJson("validation.json", validation);
  logger.success(reqId, `Saved field validation → ${filepath}`);

  return validation;
};

// ─────────────────────────────────────────────────────────────
// 2. TRANSLATE PRODUCT
//    Pulls a single Shopify product and maps it to the
//    BigCommerce v3 POST /catalog/products payload shape.
//    Output: migration/translated_product.json
// ─────────────────────────────────────────────────────────────
exports.translateProduct = async () => {
  const reqId = "translate-product";
  logger.notice(reqId, `Translating Shopify product: ${PRODUCT_ID}`);

  const data = await shopify.getOne(PRODUCT_ID);
  const p = data.product;

  if (!p) throw new Error(`Product not found: ${PRODUCT_ID}`);

  logger.info(reqId, `Product retrieved: "${p.title}"`);

  const variants = p.variants.edges.map((e) => e.node);
  const images = p.images.edges.map((e) => e.node);
  const metafields = collectMetafields(p);

  // Shopify option 1 (position 1) is "Customer Price Group" — a pricing
  // dimension, not a physical attribute. Separate it before building BC variants.
  const cpgOption = p.options.find((o) => o.position === 1);
  const physicalOptions = p.options.filter((o) => o.position !== 1);

  logger.info(
    reqId,
    cpgOption
      ? `Customer Price Group option detected: "${cpgOption.name}" (${cpgOption.values.join(", ")})`
      : "No Customer Price Group option found"
  );

  // Group variants by CPG value to extract pricing tiers
  const pricingByGroup = {};
  const bcVariants = [];
  const seenSkus = new Set();

  for (const v of variants) {
    const cpgValue = v.selectedOptions.find(
      (o) => o.name === cpgOption?.name
    )?.value;
    const physicalOptions_ = v.selectedOptions.filter(
      (o) => o.name !== cpgOption?.name
    );
    const skuBase = physicalOptions_.map((o) => o.value).join("-") || v.sku;

    if (cpgValue) {
      if (!pricingByGroup[cpgValue]) pricingByGroup[cpgValue] = [];
      pricingByGroup[cpgValue].push({ sku: v.sku, price: parseFloat(v.price) });
    }

    // Only create one BC variant per unique physical option combination
    if (!seenSkus.has(skuBase)) {
      seenSkus.add(skuBase);
      bcVariants.push({
        sku: v.sku,
        price: parseFloat(v.price),
        weight: 1,
        option_values: physicalOptions_.map((o) => ({
          option_display_name: o.name,
          label: o.value,
        })),
      });
    }
  }

  // Weight unit note for reference only — not sent to BC
  const weightUnit = variants[0]?.weightUnit ?? "OUNCES";

  // BigCommerce product payload (POST /v3/catalog/products)
  const bcProduct = {
    name: p.title,
    type: "physical",
    price: 0,    // wholesale only — real prices set via customer group pricing
    weight: 1,
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
    _weight_unit_note: `Shopify weightUnit: ${weightUnit} — verify BC store unit matches`,
  };

  // Metafields (POST /v3/catalog/products/{id}/metafields per entry)
  const bcMetafields = metafields
    .filter((m) => m.value !== null)
    .map((m) => ({
      namespace: m.namespace,
      key: m.key,
      value: m.value,
      permission_set: "read",
    }));

  const translated = {
    _source_product_id: PRODUCT_ID,
    _translated_at: new Date().toISOString(),

    // Direct POST body for /v3/catalog/products
    product: bcProduct,

    // POST each to /v3/catalog/products/{id}/metafields after product creation
    metafields: bcMetafields,

    // POST to /v3/catalog/products/{id}/customer_group_pricing after creation
    customer_group_pricing: Object.entries(pricingByGroup).map(([groupName, entries]) => {
      const customer_group_id = CUSTOMER_GROUPS[groupName];
      return {
        customer_group_id: customer_group_id ?? null,
        _group_name: groupName,
        _unresolved: customer_group_id == null,
        type: "fixed",
        price: entries[0]?.price ?? 0,
      };
    }),

    // Fields requiring manual lookup (IDs not available without BC store query)
    _manual_mapping_required: {
      brand_id: `Shopify vendor: "${p.vendor}" — match to BigCommerce Brand`,
      categories: `Shopify productType: "${p.productType}" — match to BigCommerce Category ID`,
    },
  };

  const filepath = saveJson("translated_product.json", translated);
  logger.success(reqId, `Saved translated product → ${filepath}`);

  return translated;
};

// ─────────────────────────────────────────────────────────────
// 3. MIGRATE IMAGES
//    Uploads Shopify product images to BigCommerce via URL
//    passthrough and returns the BC CDN URLs.
//    Requires an existing BC product ID.
//    Output: migration/images.json
// ─────────────────────────────────────────────────────────────
exports.migrateImages = async (bcProductId) => {
  const reqId = "migrate-images";

  if (!bcProductId) throw new Error("bcProductId is required");

  logger.notice(reqId, `Fetching Shopify product images: ${PRODUCT_ID}`);

  const data = await shopify.getOne(PRODUCT_ID);
  const p = data?.product;

  if (!p) throw new Error(`Product not found: ${PRODUCT_ID}`);

  const images = p.images.edges.map((e) => e.node);
  logger.info(reqId, `Found ${images.length} images to migrate`);

  const results = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    logger.info(reqId, `Uploading image ${i + 1}/${images.length}: ${img.url}`);

    try {
      const result = await imageService.uploadFromUrl(bcProductId, {
        image_url: img.url,
        description: img.altText || "",
        is_thumbnail: i === 0,
        sort_order: i,
      });

      const bcUrl = result.data?.url_standard;
      logger.success(reqId, `Uploaded → ${bcUrl}`);
      results.push({ shopify_url: img.url, bc_url: bcUrl, bc_image_id: result.data?.id });
    } catch (err) {
      logger.failure(reqId, `Failed to upload image ${i + 1}`, err);
      results.push({ shopify_url: img.url, bc_url: null, error: err.message });
    }
  }

  const summary = {
    bc_product_id: bcProductId,
    total: images.length,
    succeeded: results.filter((r) => r.bc_url).length,
    failed: results.filter((r) => !r.bc_url).length,
    images: results,
  };

  const filepath = saveJson("images.json", summary);
  logger.notice(reqId, `Image migration complete — ${summary.succeeded}/${summary.total} uploaded → ${filepath}`);

  return summary;
};
