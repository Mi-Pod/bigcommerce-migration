const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

// Sections to omit from the BC category tree entirely — non-product nav content.
const SKIP_SECTIONS = new Set(["Vendors"]);

// Sections that are product placeholders but have no collections yet.
// Created with is_visible: false so they don't appear in the storefront until ready.
const HIDDEN_SECTIONS = new Set(["Energy"]);

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

const toKebab = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Returns a skip reason string if this item cannot become a BC category, otherwise null.
const skipReason = (item) => {
  if (item.type === "PRODUCT") return "PRODUCT_LINK";
  if (item.type === "ARTICLE") return "ARTICLE_LINK";
  if (item.type === "HTTP" && item.url !== "#") return "EXTERNAL_LINK";
  return null;
};

const skipNote = (reason, item) => {
  if (reason === "PRODUCT_LINK")
    return "Direct product link — cannot be a BC category. Use a featured product widget or custom nav link on BC Page.";
  if (reason === "ARTICLE_LINK")
    return "Blog article — create equivalent BC Blog post, link via custom theme nav.";
  if (reason === "EXTERNAL_LINK")
    return `External link (${item.url}) — custom theme nav link or BC Page.`;
  return null;
};

// Process a single nav item. Pushes to categories[] or skipped[].
// Returns the _ref string if included, null if skipped.
const processItem = (item, parentRef, sortOrder, isVisible, categories, skipped) => {
  const reason = skipReason(item);
  if (reason) {
    skipped.push({
      title: item.title.trim(),
      reason,
      _shopify_type: item.type,
      _shopify_url: item.url,
      ...(item.resourceId ? { _shopify_resource_id: item.resourceId } : {}),
      _note: skipNote(reason, item),
    });
    return null;
  }

  const ref = parentRef
    ? `${parentRef}-${toKebab(item.title)}`
    : toKebab(item.title);

  const entry = {
    _ref: ref,
    _parent_ref: parentRef ?? null,
    _shopify_type: item.type,
    ...(item.resourceId ? { _shopify_resource_id: item.resourceId } : {}),
    ...(item.url !== "#" ? { _shopify_url: item.url } : {}),
    ...(item.url === "#" ? { _note: "Shopify stub — becomes BC empty category" } : {}),
    name: item.title.trim(),
    parent_id: parentRef ? `{{${parentRef}}}` : 0,
    sort_order: sortOrder,
    is_visible: isVisible,
  };

  categories.push(entry);
  return ref;
};

// ─────────────────────────────────────────────────────────────
// COMPOSE NAV
//   Reads both extracted nav files, maps items to BC category
//   create payloads, and flags items that need special handling.
//   Output: migration/composed-nav.json
// ─────────────────────────────────────────────────────────────
exports.composeNav = async () => {
  const reqId = "nav-compose";

  const dskPath = path.join(MIGRATION_DIR, "nav-dsk-nav-21.json");
  const sidePath = path.join(MIGRATION_DIR, "nav-sidebar-menu.json");

  if (!fs.existsSync(dskPath) || !fs.existsSync(sidePath)) {
    throw new Error(
      "Nav JSON files not found — run GET /api/test/nav-validate first to extract them"
    );
  }

  const dskMenu = JSON.parse(fs.readFileSync(dskPath, "utf8"));
  const sideMenu = JSON.parse(fs.readFileSync(sidePath, "utf8"));

  logger.notice(reqId, `Composing BC nav payload from ${dskMenu.items.length} desktop + ${sideMenu.items.length} mobile top-level items`);

  const categories = [];
  const skipped = [];

  for (let i = 0; i < dskMenu.items.length; i++) {
    const item = dskMenu.items[i];

    // Skip non-product nav sections entirely
    if (SKIP_SECTIONS.has(item.title)) {
      logger.warning(reqId, `Skipping "${item.title}" (NON_PRODUCT_SECTION) — ${item.items.length} children omitted`);
      skipped.push({
        title: item.title,
        reason: "NON_PRODUCT_SECTION",
        _note: "Non-product nav section — omit from BC category tree; handle as BC Pages or theme links if needed",
        _children_omitted: item.items.map((c) => c.title),
      });
      continue;
    }

    const isVisible = !HIDDEN_SECTIONS.has(item.title);
    if (!isVisible) {
      logger.warning(reqId, `"${item.title}" has no collections — creating as is_visible: false placeholder`);
    }

    const topRef = processItem(item, null, i, isVisible, categories, skipped);
    if (!topRef) continue;

    // Vape Pods: desktop is all stubs. Supplement with mobile's COLLECTION children
    // and upgrade the top-level entry to use mobile's COLLECTION resource.
    if (item.title === "Vape Pods") {
      const mobilePods = sideMenu.items.find((m) => m.title === "Vape Pods");
      if (mobilePods?.type === "COLLECTION") {
        const podEntry = categories.find((c) => c._ref === topRef);
        if (podEntry) {
          podEntry._shopify_type = mobilePods.type;
          podEntry._shopify_resource_id = mobilePods.resourceId;
          podEntry._shopify_url = mobilePods.url;
          delete podEntry._note;
          logger.info(reqId, `  Upgraded "Vape Pods" to COLLECTION from mobile nav`);
        }

        const existingTitles = new Set(item.items.map((c) => c.title.toLowerCase().trim()));
        const supplementChildren = mobilePods.items.filter(
          (c) => !existingTitles.has(c.title.toLowerCase().trim())
        );

        // Desktop children first
        for (let j = 0; j < item.items.length; j++) {
          const childRef = processItem(item.items[j], topRef, j, isVisible, categories, skipped);
          if (childRef && item.items[j].items?.length) {
            for (let k = 0; k < item.items[j].items.length; k++) {
              processItem(item.items[j].items[k], childRef, k, isVisible, categories, skipped);
            }
          }
        }
        // Mobile-only COLLECTION children appended after
        for (let j = 0; j < supplementChildren.length; j++) {
          const childRef = processItem(supplementChildren[j], topRef, item.items.length + j, isVisible, categories, skipped);
          if (childRef && supplementChildren[j].items?.length) {
            for (let k = 0; k < supplementChildren[j].items.length; k++) {
              processItem(supplementChildren[j].items[k], childRef, k, isVisible, categories, skipped);
            }
          }
        }

        logger.info(reqId, `  Vape Pods: ${item.items.length} desktop + ${supplementChildren.length} mobile-only children`);
        continue;
      }
    }

    // Standard child processing — 2nd level then 3rd level
    for (let j = 0; j < item.items.length; j++) {
      const childRef = processItem(item.items[j], topRef, j, isVisible, categories, skipped);
      if (childRef && item.items[j].items?.length) {
        for (let k = 0; k < item.items[j].items.length; k++) {
          processItem(item.items[j].items[k], childRef, k, isVisible, categories, skipped);
        }
      }
    }
  }

  logger.success(reqId, `${categories.length} categories composed, ${skipped.length} items skipped`);
  categories.forEach((c) =>
    logger.trace(reqId, `  [${c.is_visible ? "visible" : "hidden"}] ${c._parent_ref ? "  └─ " : ""}${c.name} (${c._shopify_type})`)
  );

  const result = {
    _source_menus: ["dsk-nav-21", "sidebar-menu"],
    categories,
    skipped,
  };

  const filepath = saveJson("composed-nav.json", result);
  logger.success(reqId, `Saved → ${filepath}`);

  return result;
};
