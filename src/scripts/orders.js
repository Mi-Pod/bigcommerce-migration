const fs = require("fs");
const path = require("path");
const shopify = require("../graphql/orders");
const { customers, products } = require("@mipod/bigcommerce");
const { makeRequest } = require("../api/bigcommerce");
const { resolveStatusId } = require("../config/order-status-map");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration/orders");

const ensureDir = () => fs.mkdirSync(MIGRATION_DIR, { recursive: true });

const saveJson = (filename, data) => {
  ensureDir();
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

const numericId = (gid) => String(gid).split("/").pop();

const migratedFilePath = (id) => path.join(MIGRATION_DIR, `migrated_${id}.json`);

function resolveAddress(addr) {
  if (!addr) return null;
  return {
    first_name: addr.firstName || "",
    last_name: addr.lastName || "",
    ...(addr.company && { company: addr.company }),
    street_1: addr.address1 || "",
    ...(addr.address2 && { street_2: addr.address2 }),
    city: addr.city || "",
    state: addr.province || "",
    zip: addr.zip || "",
    country: addr.country || "",
    country_iso2: addr.countryCodeV2 || "",
    ...(addr.phone && { phone: addr.phone }),
  };
}

function isSkippable(stub) {
  if (stub.cancelledAt) return "cancelled";
  if (stub.test) return "test_order";
  if (parseFloat(stub.currentTotalPriceSet?.shopMoney?.amount || 0) === 0) return "zero_total";
  return null;
}

// ─────────────────────────────────────────────────────────────
// VALIDATE ORDERS
// ─────────────────────────────────────────────────────────────
exports.validateOrders = async (site, { batch_size = 50, max_batches = 1 } = {}) => {
  const reqId = "validate-orders";
  logger.notice(reqId, `Validating up to ${max_batches} batch(es) of ${batch_size} order(s)...`);

  let cursor = null;
  let hasNextPage = true;
  let batchNum = 0;

  const orderReports = [];
  let skippedCancelledOrTest = 0;
  let missingCustomer = 0;
  let unresolvedSkuCount = 0;

  while (hasNextPage && batchNum < max_batches) {
    batchNum++;
    logger.info(reqId, `Batch ${batchNum}/${max_batches} — fetching ${batch_size} order stub(s)...`);

    const page = await shopify.getPage(site, batch_size, cursor);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;

    for (const stub of page.nodes) {
      const skipReason = isSkippable(stub);
      if (skipReason) {
        skippedCancelledOrTest++;
        orderReports.push({ shopify_id: stub.id, name: stub.name, skip_reason: skipReason });
        continue;
      }

      const data = await shopify.getOne(site, stub.id);
      const o = data?.order;
      if (!o) {
        orderReports.push({ shopify_id: stub.id, name: stub.name, error: "not_found" });
        continue;
      }

      const email = o.customer?.email;
      let bcCustomerId = null;
      if (email) {
        const existing = await customers.getList(site, { "email:in": email });
        bcCustomerId = existing.data?.[0]?.id ?? null;
      }
      if (!bcCustomerId) missingCustomer++;

      const lineItems = o.lineItems.edges.map((e) => e.node);
      const unresolvedSkus = [];
      for (const li of lineItems) {
        if (!li.sku) {
          unresolvedSkus.push({ sku: null, title: li.title });
          continue;
        }
        const found = await products.getList(site, { "sku:in": li.sku });
        if (!found.data?.length) unresolvedSkus.push({ sku: li.sku, title: li.title });
      }
      unresolvedSkuCount += unresolvedSkus.length;

      logger.info(
        reqId,
        `  "${o.name}" — customer ${bcCustomerId ? `resolved (bc_id ${bcCustomerId})` : "MISSING"}, ${unresolvedSkus.length} unresolved SKU(s) of ${lineItems.length}`
      );

      orderReports.push({
        shopify_id: o.id,
        name: o.name,
        email,
        bc_customer_id: bcCustomerId,
        line_item_count: lineItems.length,
        unresolved_skus: unresolvedSkus,
      });
    }
  }

  const summary = {
    validated_at: new Date().toISOString(),
    params: { batch_size, max_batches },
    batches_processed: batchNum,
    total_orders: orderReports.length,
    skipped_cancelled_or_test: skippedCancelledOrTest,
    missing_customer: missingCustomer,
    unresolved_sku_count: unresolvedSkuCount,
    orders: orderReports,
  };

  const filepath = saveJson("validation-report.json", summary);
  logger.notice(
    reqId,
    `Validation complete — ${summary.total_orders} order(s) checked, ${missingCustomer} missing customer, ${unresolvedSkuCount} unresolved SKU(s) → ${filepath}`
  );

  return summary;
};

// ─────────────────────────────────────────────────────────────
// COMPOSE ORDER
// ─────────────────────────────────────────────────────────────
exports.composeOrder = async (site, shopifyOrderId, { save = true } = {}) => {
  const reqId = "compose-order";
  logger.notice(reqId, `Composing BC payload for Shopify order: ${shopifyOrderId}`);

  const data = await shopify.getOne(site, shopifyOrderId);
  const o = data?.order;
  if (!o) throw new Error(`Order not found: ${shopifyOrderId}`);

  logger.info(reqId, `Order: "${o.name}" (${o.displayFinancialStatus}/${o.displayFulfillmentStatus})`);

  let bcCustomerId = null;
  if (o.customer?.email) {
    const existing = await customers.getList(site, { "email:in": o.customer.email });
    bcCustomerId = existing.data?.[0]?.id ?? null;
    if (!bcCustomerId) {
      logger.warning(reqId, `No BC customer found for ${o.customer.email} — migrating as guest order`);
    }
  }

  const lineItems = o.lineItems.edges.map((e) => e.node);
  const bcProducts = [];
  const unresolvedSkus = [];

  for (const li of lineItems) {
    if (!li.sku) {
      unresolvedSkus.push({ sku: null, title: li.title });
      logger.warning(reqId, `  Line item "${li.title}" has no SKU — dropping from order`);
      continue;
    }
    const found = await products.getList(site, { "sku:in": li.sku });
    const match = found.data?.[0];
    if (!match) {
      unresolvedSkus.push({ sku: li.sku, title: li.title });
      logger.warning(reqId, `  SKU "${li.sku}" not found in BC — dropping from order`);
      continue;
    }
    bcProducts.push({
      product_id: match.id,
      sku: li.sku,
      quantity: li.quantity,
      price_ex_tax: parseFloat(li.originalUnitPriceSet?.shopMoney?.amount || 0),
    });
  }

  const statusId = resolveStatusId(o.displayFinancialStatus, o.displayFulfillmentStatus);

  const billingAddress = resolveAddress(o.billingAddress) || resolveAddress(o.shippingAddress);
  const shippingAddress = resolveAddress(o.shippingAddress);

  const bcOrder = {
    status_id: statusId,
    ...(bcCustomerId && { customer_id: bcCustomerId }),
    ...(billingAddress && { billing_address: billingAddress }),
    ...(shippingAddress && { shipping_addresses: [shippingAddress] }),
    products: bcProducts,
    staff_notes: `Migrated from Shopify order ${o.name} (${o.id})`,
  };

  const id = numericId(o.id);
  const composed = {
    _source_order_id: o.id,
    _shopify_numeric_id: Number(id),
    _composed_at: new Date().toISOString(),
    order: bcOrder,
    unresolved_skus: unresolvedSkus,
  };

  if (save) {
    const filepath = saveJson(`composed_${id}.json`, composed);
    logger.success(reqId, `Saved → ${filepath}`);
  }
  logger.info(reqId, `Line items: ${lineItems.length} total → ${bcProducts.length} resolved, ${unresolvedSkus.length} dropped`);

  return composed;
};

// ─────────────────────────────────────────────────────────────
// MIGRATE ORDER
// ─────────────────────────────────────────────────────────────
exports.migrateOrder = async (site, shopifyOrderId, { save = true } = {}) => {
  const reqId = "migrate-order";
  logger.notice(reqId, `Migrating Shopify order: ${shopifyOrderId}`);

  const composed = await exports.composeOrder(site, shopifyOrderId, { save });
  const id = String(composed._shopify_numeric_id);

  if (fs.existsSync(migratedFilePath(id))) {
    logger.warning(reqId, `Order ${id} already migrated — skipping`);
    return { _action: "skipped", _reason: "already_migrated", _shopify_numeric_id: composed._shopify_numeric_id };
  }

  if (!composed.order.products.length) {
    logger.warning(reqId, `Order ${id} has no resolvable line items — skipping`);
    return {
      _action: "skipped",
      _reason: "no_resolvable_line_items",
      _shopify_numeric_id: composed._shopify_numeric_id,
    };
  }

  logger.info(reqId, `Creating order — ${composed.order.products.length} line item(s), status_id ${composed.order.status_id}`);
  const createRes = await makeRequest(site, "POST", "/v2/orders", { data: composed.order });
  const bcOrderId = createRes.id;
  logger.success(reqId, `Order created — BC id ${bcOrderId}`);

  const result = {
    _source_order_id: composed._source_order_id,
    _shopify_numeric_id: composed._shopify_numeric_id,
    _migrated_at: new Date().toISOString(),
    _action: "created",
    bc_order_id: bcOrderId,
    order: createRes,
    unresolved_skus: composed.unresolved_skus,
  };

  if (save) {
    const filepath = saveJson(`migrated_${id}.json`, result);
    logger.notice(reqId, `Complete — BC id ${bcOrderId} | ${filepath}`);
  } else {
    logger.notice(reqId, `Complete — BC id ${bcOrderId}`);
  }

  return result;
};

// ─────────────────────────────────────────────────────────────
// COUNT ORDERS
// ─────────────────────────────────────────────────────────────
exports.countOrders = async (site) => {
  const count = await shopify.getCount(site);
  logger.notice("bulk-migrate-orders", `Shopify order count: ${count}`);
  return { count };
};

// ─────────────────────────────────────────────────────────────
// IMPORT ORDERS
// ─────────────────────────────────────────────────────────────
exports.importOrders = async (site, { batch_size = 50, skip = 0, max_batches = 0, save = true } = {}) => {
  const reqId = "bulk-migrate-orders";

  logger.notice(reqId, `Starting bulk import — batch_size: ${batch_size}, skip: ${skip}, max_batches: ${max_batches || "∞"}`);

  let cursor = null;
  if (skip > 0) {
    logger.info(reqId, `Advancing cursor past ${skip} orders...`);
    cursor = await shopify.advanceCursor(site, skip);
    logger.info(reqId, `Cursor advanced — starting from order ${skip + 1}`);
  }

  const results = [];
  let batchNum = 0;
  let hasNextPage = true;
  let totalSkipped = 0;

  while (hasNextPage) {
    if (max_batches > 0 && batchNum >= max_batches) {
      logger.info(reqId, `Reached max_batches limit (${max_batches}) — stopping`);
      break;
    }

    batchNum++;
    logger.info(reqId, `Batch ${batchNum}${max_batches ? `/${max_batches}` : ""} — fetching ${batch_size} order stub(s)...`);

    const page = await shopify.getPage(site, batch_size, cursor);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;

    const eligible = [];
    for (const stub of page.nodes) {
      const skipReason = isSkippable(stub);
      if (skipReason) {
        totalSkipped++;
        results.push({ status: "skipped", shopify_id: stub.id, name: stub.name, reason: skipReason });
      } else {
        eligible.push(stub);
      }
    }
    logger.info(reqId, `Batch ${batchNum}: ${eligible.length} order(s) to migrate, ${page.nodes.length - eligible.length} skipped`);

    for (const stub of eligible) {
      logger.info(reqId, `  Migrating: "${stub.name}" (${stub.id})`);
      try {
        const result = await exports.migrateOrder(site, stub.id, { save });
        results.push({
          status: result._action === "skipped" ? "skipped" : "success",
          shopify_id: stub.id,
          name: stub.name,
          bc_order_id: result.bc_order_id ?? null,
          reason: result._reason,
        });
        logger.success(reqId, `  ✓ "${stub.name}" → ${result._action}${result.bc_order_id ? ` (bc_id ${result.bc_order_id})` : ""}`);
      } catch (err) {
        results.push({ status: "failed", shopify_id: stub.id, name: stub.name, error: err.message });
        logger.failure(reqId, `  ✗ "${stub.name}"`, err);
      }
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  logger.notice(reqId, `Bulk import complete — ${succeeded} succeeded, ${failed} failed, ${skipped} skipped across ${batchNum} batch(es)`);

  const summary = {
    params: { batch_size, skip, max_batches },
    batches_processed: batchNum,
    total_processed: results.length,
    succeeded,
    failed,
    skipped,
    last_cursor: cursor,
    results,
  };

  if (save) {
    saveJson("bulk-import-results.json", summary);
    logger.success(reqId, `Results saved → migration/orders/bulk-import-results.json`);
  }

  return summary;
};
