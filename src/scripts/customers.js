const fs = require("fs");
const path = require("path");
const shopify = require("../graphql/shopify/customers");
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
exports.composeCustomer = async (shopifyCustomerId) => {
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

  const filepath = saveJson(`composed_${numericId}.json`, composed);
  logger.success(reqId, `Saved → ${filepath}`);
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
exports.migrateCustomer = async (shopifyCustomerId) => {
  const reqId = "migrate-customer";
  logger.notice(reqId, `Migrating Shopify customer: ${shopifyCustomerId}`);

  // Compose payload (fetches from Shopify + saves composed JSON)
  const composed = await exports.composeCustomer(shopifyCustomerId);
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

  // Create addresses
  let bcAddresses = [];
  if (addresses.length) {
    logger.info(reqId, `Creating ${addresses.length} address(es)`);
    const addrRes = await makeRequest("POST", "/v3/customers/addresses", {
      data: addresses.map((a) => ({ ...a, customer_id: bcId })),
    });
    bcAddresses = addrRes.data ?? [];
    logger.success(reqId, `${bcAddresses.length} address(es) created`);
  }

  // Create metafields — one POST per entry (BC requires individual calls)
  const bcMetafields = [];
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
    addresses: bcAddresses,
    metafields: bcMetafields,
  };

  const filepath = saveJson(`migrated_${numericId}.json`, result);
  logger.notice(reqId, `Complete — BC id ${bcId} | ${filepath}`);

  return result;
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
