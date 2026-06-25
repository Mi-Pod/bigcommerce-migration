const express = require("express");
const router = express.Router();

router.use("/test", require("./test"));
router.use("/bigcommerce", require("./bigcommerce"));
router.use("/migrate", require("./migrate"));

module.exports = router;
