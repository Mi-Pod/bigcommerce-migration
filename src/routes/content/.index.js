const express = require("express");
const router = express.Router();

router.use("/metaobjects", require("./metaobjects"));
router.use("/files",       require("./files"));
router.use("/articles",    require("./articles"));
router.use("/pages",       require("./pages"));
router.use("/menus",       require("./menus"));

module.exports = router;
