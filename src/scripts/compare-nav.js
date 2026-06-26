const fs = require("fs");
const path = require("path");
const { makeRequest } = require("../api/bigcommerce");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

// Flatten the BC /v2/catalog/categories/tree nested response into a plain array.
// Each entry carries its depth and full path string for readability.
const flattenBcTree = (nodes, parentName = null, depth = 0) => {
  const result = [];
  for (const node of nodes) {
    const nodePath = parentName ? `${parentName} > ${node.name}` : node.name;
    result.push({ id: node.id, name: node.name, parent_name: parentName, depth, path: nodePath });
    if (node.children?.length) {
      result.push(...flattenBcTree(node.children, node.name, depth + 1));
    }
  }
  return result;
};

// Match key: parentName (lowercased) + "|" + name (lowercased).
// Using parent name avoids false matches on repeated labels like "By Type".
const bcMatchKey = (cat) =>
  `${(cat.parent_name ?? "").toLowerCase().trim()}|${cat.name.toLowerCase().trim()}`;

const composedMatchKey = (cat, refToName) => {
  const parentName = cat._parent_ref ? (refToName[cat._parent_ref] ?? "") : "";
  return `${parentName.toLowerCase().trim()}|${cat.name.toLowerCase().trim()}`;
};

// ── Compare Nav ──────────────────────────────────────────────────
// Fetches the live BC category tree and diffs it against
// migration/composed-nav.json. Reports:
//   matched       — in both composed and BC
//   missing_from_bc — in composed but not found in BC
//   extra_in_bc   — in BC but not in composed (manually created, pre-existing, or 3rd-level)
// Output: migration/nav-comparison.json
exports.compareNav = async () => {
  const reqId = "nav-compare";

  // Fetch live BC category tree
  logger.info(reqId, "Fetching BC category tree...");
  const treeRes = await makeRequest("GET", "/v2/catalog/categories/tree");
  const bcTree = Array.isArray(treeRes) ? treeRes : [];
  const bcFlat = flattenBcTree(bcTree);
  logger.info(reqId, `BC has ${bcFlat.length} total categories (${bcTree.length} top-level)`);

  // Load composed-nav.json
  const composedPath = path.join(MIGRATION_DIR, "composed-nav.json");
  if (!fs.existsSync(composedPath)) {
    throw new Error("composed-nav.json not found — run GET /api/migrate/navigation/compose first");
  }
  const { categories: composed } = JSON.parse(fs.readFileSync(composedPath, "utf8"));

  // Build ref → display name map for parent resolution
  const refToName = Object.fromEntries(composed.map((c) => [c._ref, c.name]));

  // Build lookup maps
  const bcByKey = new Map(bcFlat.map((c) => [bcMatchKey(c), c]));
  const composedKeys = new Set(composed.map((c) => composedMatchKey(c, refToName)));

  const matched = [];
  const missingFromBc = [];

  for (const cat of composed) {
    const key = composedMatchKey(cat, refToName);
    if (bcByKey.has(key)) {
      matched.push({ composed: cat, bc: bcByKey.get(key) });
    } else {
      missingFromBc.push(cat);
    }
  }

  const extraInBc = bcFlat.filter((c) => !composedKeys.has(bcMatchKey(c)));

  // Log summary
  logger.notice(
    reqId,
    `Composed: ${composed.length} | BC: ${bcFlat.length} | ` +
      `Matched: ${matched.length} | Missing from BC: ${missingFromBc.length} | Extra in BC: ${extraInBc.length}`
  );

  if (missingFromBc.length) {
    logger.warning(reqId, `${missingFromBc.length} composed item(s) not found in BC:`);
    missingFromBc.forEach((c) =>
      logger.trace(reqId, `  MISSING  "${c.name}" (ref: ${c._ref}, parent: ${c._parent_ref ?? "root"})`)
    );
  }

  if (extraInBc.length) {
    logger.info(reqId, `${extraInBc.length} BC item(s) not in composed (manual additions or pre-existing):`);
    extraInBc.forEach((c) =>
      logger.trace(reqId, `  EXTRA    [depth ${c.depth}] "${c.path}" (BC id: ${c.id})`)
    );
  }

  const result = {
    bc_total: bcFlat.length,
    composed_total: composed.length,
    matched: matched.length,
    missing_from_bc: missingFromBc,
    extra_in_bc: extraInBc,
    bc_tree: bcTree,
  };

  const filepath = path.join(MIGRATION_DIR, "nav-comparison.json");
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  logger.success(reqId, `Comparison saved → ${filepath}`);

  return result;
};
