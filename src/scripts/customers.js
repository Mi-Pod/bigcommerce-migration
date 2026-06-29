const fs = require("fs");
const path = require("path");
const shopify = require("../graphql/customers");
const customerService = require("../services/bigcommerce/customer.service");
const { makeRequest } = require("../api/bigcommerce");
const logger = require("../utils/logger");

function normalizeAddressKey(addr) {
  const clean = (s) =>
    (s || "")
      .toLowerCase()
      .trim()
      .replace(/[.,#]/g, "")
      .replace(/\bsuite\b/g, "ste")
      .replace(/\bapartment\b/g, "apt")
      .replace(/\bstreet\b/g, "st")
      .replace(/\bavenue\b/g, "ave")
      .replace(/\bboulevard\b/g, "blvd")
      .replace(/\bdrive\b/g, "dr")
      .replace(/\broad\b/g, "rd")
      .replace(/\blane\b/g, "ln")
      .replace(/\s+/g, " ")
      .trim();

  return [
    clean(addr.address1),
    clean(addr.city),
    (addr.provinceCode || addr.province || "").toUpperCase(),
    (addr.zip || "").replace(/\s+/g, "").toUpperCase(),
    (addr.countryCodeV2 || "").toUpperCase(),
  ].join("|");
}

// Split a Shopify name into BC first/last components.
// Shopify allows firstName to hold a full name when lastName is blank.
function resolveName(firstName, lastName) {
  if (lastName) return { first_name: firstName || "", last_name: lastName };
  const name = (firstName || "").trim();
  const space = name.indexOf(" ");
  if (space !== -1) return { first_name: name.slice(0, space), last_name: name.slice(space + 1) };
  // Single token and no lastName — duplicate it; BC requires both fields non-empty.
  return { first_name: name || ".", last_name: name || "." };
}

function deduplicateAddresses(addresses) {
  const seen = new Set();
  return addresses.filter((addr) => {
    const key = normalizeAddressKey(addr);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const SAMPLE_CUSTOMER_IDS = [2852474519615, 3096525045823, 6113125040191];
const MIGRATION_DIR = path.join(__dirname, "../../migration/customers");

const ensureDir = () => fs.mkdirSync(MIGRATION_DIR, { recursive: true });

const saveJson = (filename, data) => {
  ensureDir();
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

// ─────────────────────────────────────────────────────────────
// COMPOSE CUSTOMER — Build BC payload from Shopify source data
//    Fetches a single customer, maps fields, deduplicates
//    addresses, collects metafields, and saves the result to
//    migration/customers/composed_{id}.json
// ─────────────────────────────────────────────────────────────
exports.composeCustomer = async (shopifyCustomerId, { save = true } = {}) => {
  const reqId = "compose-customer";
  logger.notice(reqId, `Composing BC payload for Shopify customer: ${shopifyCustomerId}`);

  const data = await shopify.getOne(shopifyCustomerId);
  const c = data?.customer;
  if (!c) throw new Error(`Customer not found: ${shopifyCustomerId}`);

  logger.info(reqId, `Customer: ${c.firstName} ${c.lastName} (${c.email})`);

  // --- Customer body ---
  // Company lives on addresses in Shopify — prefer defaultAddress, fall back to first address with one.
  const company =
    c.defaultAddress?.company ||
    (c.addresses ?? []).find((a) => a.company)?.company ||
    null;
  const acceptsMarketing = c.emailMarketingConsent?.marketingState === "SUBSCRIBED";

  const creditTotal = (c.storeCreditAccounts?.edges ?? []).reduce(
    (sum, { node }) => sum + parseFloat(node.balance.amount || 0),
    0
  );

  const { first_name, last_name } = resolveName(c.firstName, c.lastName);
  const bcCustomer = {
    first_name,
    last_name,
    email: c.email,
    ...(c.phone && { phone: c.phone }),
    ...(company && { company }),
    accepts_marketing_emails: acceptsMarketing,
    accepts_product_review_abandoned_cart_emails: acceptsMarketing,
    ...(creditTotal > 0 && { store_credit_amounts: [{ amount: creditTotal }] }),
    authentication: { force_reset: true },
    channel_ids: [1],
  };

  // --- Addresses: default first, then dedup ---
  const allAddresses = c.addresses ?? [];
  const defaultId = c.defaultAddress?.id;
  const sorted = defaultId
    ? [
        allAddresses.find((a) => a.id === defaultId),
        ...allAddresses.filter((a) => a.id !== defaultId),
      ].filter(Boolean)
    : allAddresses;

  const deduped = deduplicateAddresses(sorted);

  const bcAddresses = deduped.map((addr) => {
    const { first_name: addrFirst, last_name: addrLast } = resolveName(addr.firstName, addr.lastName);
    return {
      first_name: addrFirst,
      last_name: addrLast,
      ...(addr.company && { company: addr.company }),
      address1: addr.address1 || "",
      ...(addr.address2 && { address2: addr.address2 }),
      city: addr.city || "",
      state_or_province: addr.province || "",
      state_or_province_code: addr.provinceCode || "",
      country_code: addr.countryCodeV2 || "",
      postal_code: addr.zip || "",
      ...(addr.phone && { phone: addr.phone }),
      address_type: addr.company ? "commercial" : "residential",
    };
  });

  // --- Metafields: non-null Shopify values → BC metafield shape ---
  const bcMetafields = shopify
    .collectMetafields(c)
    .filter((m) => m.value != null)
    .map((m) => ({
      namespace: m.namespace,
      key: m.key,
      value: m.value,
      permission_set: "read",
    }));

  const numericId = String(c.id).split("/").pop();

  const composed = {
    _source_customer_id: c.id,
    _shopify_numeric_id: Number(numericId),
    _composed_at: new Date().toISOString(),
    customer: bcCustomer,
    addresses: bcAddresses,
    metafields: bcMetafields,
  };

  if (save) {
    const filepath = saveJson(`composed_${numericId}.json`, composed);
    logger.success(reqId, `Saved → ${filepath}`);
  }
  logger.info(
    reqId,
    `Addresses: ${allAddresses.length} raw → ${deduped.length} after dedup | Metafields: ${bcMetafields.length}`
  );

  return composed;
};

// ─────────────────────────────────────────────────────────────
// MIGRATE CUSTOMER — Execute full Shopify → BigCommerce migration
//    Composes payload, checks for existing BC customer by email,
//    creates customer + addresses + metafields, saves result JSON.
// ─────────────────────────────────────────────────────────────
exports.migrateCustomer = async (shopifyCustomerId, { save = true } = {}) => {
  const reqId = "migrate-customer";
  logger.notice(reqId, `Migrating Shopify customer: ${shopifyCustomerId}`);

  // Compose payload (fetches from Shopify + optionally saves composed JSON)
  const composed = await exports.composeCustomer(shopifyCustomerId, { save });
  const { customer: bcCustomer, addresses, metafields } = composed;
  const numericId = String(composed._shopify_numeric_id);

  // Check for existing BC customer by email — skip if found
  const existingRes = await customerService.getList({ "email:in": bcCustomer.email });
  if (existingRes.data?.length) {
    const e = existingRes.data[0];
    logger.warning(reqId, `Already exists in BC: id ${e.id} (${e.email}) — skipping`);
    return {
      _action: "skipped",
      _reason: "customer_exists",
      bc_customer_id: e.id,
      email: e.email,
    };
  }

  // Create customer
  logger.info(reqId, `Creating customer: ${bcCustomer.email}`);
  const createRes = await customerService.create(bcCustomer);
  const bcId = createRes.data[0].id;
  logger.success(reqId, `Customer created — BC id ${bcId}`);

  // Sync addresses — chunked to respect BC's 10-item batch limit
  const addrSync = await exports.syncCustomerAddresses(shopifyCustomerId, bcId);

  // Create metafields — one POST per entry (BC requires individual calls)
  const bcMetafields = [];

  // Migration mapping — stores Shopify ID in BC for reverse lookup
  try {
    const mfRes = await makeRequest("POST", `/v3/customers/${bcId}/metafields`, {
      data: { namespace: "shopify", key: "customer_id", value: numericId, permission_set: "read" },
    });
    bcMetafields.push(mfRes.data);
    logger.trace(reqId, `Metafield: shopify.customer_id = ${numericId}`);
  } catch (err) {
    logger.warning(reqId, `Metafield shopify.customer_id skipped: ${err.message}`);
  }

  for (const m of metafields) {
    try {
      const mfRes = await makeRequest("POST", `/v3/customers/${bcId}/metafields`, { data: m });
      bcMetafields.push(mfRes.data);
      logger.trace(reqId, `Metafield: ${m.namespace}.${m.key}`);
    } catch (err) {
      logger.warning(reqId, `Metafield ${m.namespace}.${m.key} skipped: ${err.message}`);
    }
  }

  const result = {
    _source_customer_id: composed._source_customer_id,
    _shopify_numeric_id: composed._shopify_numeric_id,
    _migrated_at: new Date().toISOString(),
    _action: "created",
    bc_customer_id: bcId,
    customer: createRes.data[0],
    addresses: addrSync.addresses,
    metafields: bcMetafields,
  };

  if (save) {
    const filepath = saveJson(`migrated_${numericId}.json`, result);
    logger.notice(reqId, `Complete — BC id ${bcId} | ${filepath}`);
  } else {
    logger.notice(reqId, `Complete — BC id ${bcId}`);
  }

  return result;
};

// ─────────────────────────────────────────────────────────────
// SYNC CUSTOMER ADDRESSES
//    Fetches addresses from Shopify, deduplicates, and upserts to BC
//    in chunks of ≤10 (BC batch limit). Resolves BC customer from the
//    shopify_customer_id metafield mapping when bcCustomerId is omitted.
// ─────────────────────────────────────────────────────────────
const ADDRESS_BATCH_LIMIT = 10;

exports.syncCustomerAddresses = async (shopifyCustomerId, bcCustomerId = null) => {
  const reqId = "sync-customer-addresses";

  const data = await shopify.getOne(shopifyCustomerId);
  const c = data?.customer;
  if (!c) throw new Error(`Customer not found: ${shopifyCustomerId}`);

  // Resolve BC customer ID — look up by email when not provided
  if (!bcCustomerId) {
    const existingRes = await customerService.getList({ "email:in": c.email });
    if (!existingRes.data?.length) throw new Error(`No BC customer found for email: ${c.email}`);
    bcCustomerId = existingRes.data[0].id;
    logger.info(reqId, `Resolved BC customer id ${bcCustomerId} via email (${c.email})`);
  }

  // Compose and deduplicate addresses
  const allAddresses = c.addresses ?? [];
  const defaultId = c.defaultAddress?.id;
  const sorted = defaultId
    ? [allAddresses.find((a) => a.id === defaultId), ...allAddresses.filter((a) => a.id !== defaultId)].filter(Boolean)
    : allAddresses;
  const deduped = deduplicateAddresses(sorted);

  const bcAddresses = deduped.map((addr) => {
    const { first_name, last_name } = resolveName(addr.firstName, addr.lastName);
    return {
      customer_id: bcCustomerId,
      first_name,
      last_name,
      ...(addr.company && { company: addr.company }),
      address1: addr.address1 || "",
      ...(addr.address2 && { address2: addr.address2 }),
      city: addr.city || "",
      state_or_province: addr.province || "",
      state_or_province_code: addr.provinceCode || "",
      country_code: addr.countryCodeV2 || "",
      postal_code: addr.zip || "",
      ...(addr.phone && { phone: addr.phone }),
      address_type: addr.company ? "commercial" : "residential",
    };
  });

  // POST in chunks of ≤10 to respect BC's batch size limit
  const created = [];
  for (let i = 0; i < bcAddresses.length; i += ADDRESS_BATCH_LIMIT) {
    const chunk = bcAddresses.slice(i, i + ADDRESS_BATCH_LIMIT);
    const res = await makeRequest("POST", "/v3/customers/addresses", { data: chunk });
    created.push(...(res.data ?? []));
  }

  logger.success(reqId, `${created.length} address(es) synced for BC customer ${bcCustomerId}`);
  return { bc_customer_id: bcCustomerId, addresses_created: created.length, addresses: created };
};

// ─────────────────────────────────────────────────────────────
// COUNT CUSTOMERS
// ─────────────────────────────────────────────────────────────
exports.countCustomers = async () => {
  const count = await shopify.getCount();
  logger.notice("bulk-migrate-customers", `Shopify customer count: ${count}`);
  return { count };
};

// ─────────────────────────────────────────────────────────────
// IMPORT CUSTOMERS — Cursor-paginated bulk migration
//    Iterates all Shopify customers in batches, calls migrateCustomer
//    for each, skips DISABLED accounts, saves bulk results JSON.
// ─────────────────────────────────────────────────────────────
exports.importCustomers = async ({ batch_size = 50, skip = 0, max_batches = 0, save = true } = {}) => {
  const reqId = "bulk-migrate-customers";

  logger.notice(reqId, `Starting bulk import — batch_size: ${batch_size}, skip: ${skip}, max_batches: ${max_batches || "∞"}`);

  let cursor = null;
  if (skip > 0) {
    logger.info(reqId, `Advancing cursor past ${skip} customers...`);
    cursor = await shopify.advanceCursor(skip);
    logger.info(reqId, `Cursor advanced — starting from customer ${skip + 1}`);
  }

  const results = [];
  let batchNum = 0;
  let hasNextPage = true;
  let totalDisabled = 0;
  let totalZeroSpend = 0;

  // Customers created after this date are always migrated regardless of spend
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  while (hasNextPage) {
    if (max_batches > 0 && batchNum >= max_batches) {
      logger.info(reqId, `Reached max_batches limit (${max_batches}) — stopping`);
      break;
    }

    batchNum++;
    logger.info(reqId, `Batch ${batchNum}${max_batches ? `/${max_batches}` : ""} — fetching ${batch_size} customer stubs...`);

    const page = await shopify.getPage(batch_size, cursor);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;

    const active = page.nodes.filter((n) => n.state !== "DISABLED");
    const skippedDisabled = page.nodes.length - active.length;
    totalDisabled += skippedDisabled;
    if (skippedDisabled > 0) logger.info(reqId, `Batch ${batchNum}: skipping ${skippedDisabled} disabled customer(s)`);

    const eligible = active.filter((n) => {
      const hasSpend = parseFloat(n.amountSpent?.amount || 0) > 0;
      const isRecent = new Date(n.createdAt) >= sixMonthsAgo;
      return hasSpend || isRecent;
    });
    const skippedZeroSpend = active.length - eligible.length;
    totalZeroSpend += skippedZeroSpend;
    if (skippedZeroSpend > 0) logger.info(reqId, `Batch ${batchNum}: skipping ${skippedZeroSpend} customer(s) with $0 spend`);
    logger.info(reqId, `Batch ${batchNum}: ${eligible.length} customers to migrate`);

    for (const stub of eligible) {
      const label = `${stub.firstName} ${stub.lastName}`.trim() || stub.email;
      logger.info(reqId, `  Migrating: "${label}" (${stub.id})`);
      try {
        const result = await exports.migrateCustomer(stub.id, { save });
        results.push({
          status: "success",
          shopify_id: stub.id,
          email: stub.email,
          bc_customer_id: result.bc_customer_id,
          action: result._action,
        });
        logger.success(reqId, `  ✓ "${label}" → bc_id ${result.bc_customer_id} (${result._action})`);
      } catch (err) {
        results.push({ status: "failed", shopify_id: stub.id, email: stub.email, error: err.message });
        logger.failure(reqId, `  ✗ "${label}"`, err);
      }
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  logger.notice(reqId, `Bulk import complete — ${succeeded} succeeded, ${failed} failed, ${totalDisabled} disabled skipped, ${totalZeroSpend} zero-spend skipped across ${batchNum} batch(es)`);

  const summary = {
    params: { batch_size, skip, max_batches },
    batches_processed: batchNum,
    total_processed: results.length,
    succeeded,
    failed,
    disabled_skipped: totalDisabled,
    zero_spend_skipped: totalZeroSpend,
    last_cursor: cursor,
    results,
  };

  if (save) {
    saveJson("bulk-import-results.json", summary);
    logger.success(reqId, `Results saved → migration/customers/bulk-import-results.json`);
  }

  return summary;
};

// ─────────────────────────────────────────────────────────────
// EXTRACT SAMPLE CUSTOMERS
//    Fetches the 3 hardcoded test customer IDs from Shopify and
//    saves each as raw GraphQL JSON to migration/customers/{id}.json
// ─────────────────────────────────────────────────────────────
exports.extractSampleCustomers = async () => {
  const reqId = "extract-sample-customers";
  logger.notice(reqId, `Extracting ${SAMPLE_CUSTOMER_IDS.length} sample customers from Shopify`);

  const results = [];

  for (const id of SAMPLE_CUSTOMER_IDS) {
    logger.info(reqId, `Fetching customer: ${id}`);

    try {
      const data = await shopify.getOne(id);
      const customer = data?.customer;

      if (!customer) {
        logger.warning(reqId, `Customer not found: ${id}`);
        results.push({ id, found: false });
        continue;
      }

      logger.success(
        reqId,
        `Retrieved: ${customer.firstName} ${customer.lastName} (${customer.email})`
      );

      const filepath = saveJson(`${id}.json`, data);
      logger.info(reqId, `Saved → ${filepath}`);

      results.push({ id, found: true, email: customer.email, filepath });
    } catch (err) {
      logger.failure(reqId, `Failed to fetch customer ${id}`, err);
      results.push({ id, found: false, error: err.message });
    }
  }

  const found = results.filter((r) => r.found).length;
  logger.notice(reqId, `Extraction complete — ${found}/${SAMPLE_CUSTOMER_IDS.length} found`);

  return results;
};
