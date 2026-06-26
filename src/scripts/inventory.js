const inventoryService = require("../services/bigcommerce/inventory.service");
const logger = require("../utils/logger");

// ── Get Inventory ────────────────────────────────────────────
// Fetches all locations and the top 5 inventory items.
exports.getInventory = async () => {
  const reqId = "inventory-get";
  logger.notice(reqId, "Fetching inventory locations and top 5 items...");

  logger.info(reqId, "Fetching locations...");
  const locationsRes = await inventoryService.getLocations();
  const locations = locationsRes.data ?? [];
  logger.success(reqId, `${locations.length} location(s) found`);
  locations.forEach((l) => logger.trace(reqId, `Location: [${l.id}] ${l.label} (${l.code})`));

  logger.info(reqId, "Fetching top 5 inventory items...");
  const itemsRes = await inventoryService.getItems({ limit: 5 });
  const items = itemsRes.data ?? [];
  logger.success(reqId, `${items.length} item(s) retrieved`);
  items.forEach((item) => {
    const sku = item.identity?.sku ?? "—";
    (item.locations ?? []).forEach((loc) =>
      logger.trace(reqId, `SKU: ${sku} | Location: ${loc.location_id} | Qty: ${loc.quantity}`)
    );
  });

  logger.notice(reqId, "Done");
  return { locations, items };
};

// ── Wipe Inventory ───────────────────────────────────────────
// Fetches all inventory items and sets every SKU/location pair to 0.
exports.wipeInventory = async () => {
  const reqId = "inventory-wipe";
  logger.notice(reqId, "Starting inventory wipe — setting all quantities to 0...");

  logger.info(reqId, "Fetching all inventory items...");
  const itemsRes = await inventoryService.getItems({ limit: 250 });
  const items = itemsRes.data ?? [];
  const total = itemsRes.meta?.pagination?.total ?? items.length;

  if (total > 250) {
    logger.warning(reqId, `${total} total items — only wiping first 250 (pagination not implemented)`);
  }

  if (items.length === 0) {
    logger.warning(reqId, "No inventory items found — nothing to wipe");
    return { wiped: 0, items: [] };
  }

  const adjustments = items.flatMap((item) =>
    (item.locations ?? []).map((loc) => {
      const id = item.identity?.variant_id
        ? { variant_id: item.identity.variant_id }
        : item.identity?.sku
          ? { sku: item.identity.sku }
          : null;
      if (!id) return null;
      return { ...id, location_id: loc.location_id, quantity: 0 };
    }).filter(Boolean)
  );

  logger.info(reqId, `Zeroing ${adjustments.length} SKU/location pair(s)...`);
  const result = await inventoryService.setAbsolute(adjustments);
  logger.success(reqId, `Wipe complete — ${adjustments.length} pair(s) set to 0`);

  return { wiped: adjustments.length, items: result.data ?? [] };
};

// ── Set Inventory ────────────────────────────────────────────
// Applies an absolute or relative inventory adjustment across all items.
//   type: "absolute" — sets every SKU/location to `value` exactly
//   type: "relative" — adjusts by `value` delta (positive or negative)
//   value: number, or "rand" to pick a random integer in [1, 5]
exports.setInventory = async ({ type, value }) => {
  const reqId = "inventory-set";

  const resolved = value === "rand"
    ? Math.floor(Math.random() * 5) + 1
    : parseInt(value, 10);

  if (isNaN(resolved)) {
    throw new Error(`Invalid value: "${value}" — must be a number or "rand"`);
  }
  if (type !== "absolute" && type !== "relative") {
    throw new Error(`Invalid type: "${type}" — must be "absolute" or "relative"`);
  }

  logger.notice(
    reqId,
    `Setting inventory — type: ${type}, value: ${resolved}${value === "rand" ? " (random)" : ""}`
  );

  logger.info(reqId, "Fetching all inventory items...");
  const itemsRes = await inventoryService.getItems({ limit: 250 });
  const items = itemsRes.data ?? [];

  if (items.length === 0) {
    logger.warning(reqId, "No inventory items found — nothing to update");
    return { updated: 0, type, value: resolved, items: [] };
  }

  const adjustments = items.flatMap((item) =>
    (item.locations ?? []).map((loc) => {
      const id = item.identity?.variant_id
        ? { variant_id: item.identity.variant_id }
        : item.identity?.sku
          ? { sku: item.identity.sku }
          : null;
      if (!id) return null;
      return { ...id, location_id: loc.location_id, quantity: resolved };
    }).filter(Boolean)
  );

  logger.info(reqId, `Applying ${type} (${resolved}) to ${adjustments.length} SKU/location pair(s)...`);

  const result = type === "absolute"
    ? await inventoryService.setAbsolute(adjustments)
    : await inventoryService.adjustRelative(adjustments);

  logger.success(reqId, `Done — ${adjustments.length} pair(s) updated`);
  return { updated: adjustments.length, type, value: resolved, items: result.data ?? [] };
};
