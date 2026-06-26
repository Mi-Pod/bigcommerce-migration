const express = require("express");
const router = express.Router();

router.use("/test", require("./test"));
router.use("/bigcommerce", require("./bigcommerce/.index"));
router.use("/migrate", require("./migrate/.index"));
router.use("/content", require("./content/.index"));

module.exports = router;
