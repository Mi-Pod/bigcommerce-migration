const express = require("express");
const router = express.Router();

router.use("/customers", require("./customers"));
router.use("/products", require("./products"));
router.use("/navigation", require("./navigation"));
router.use("/shopify", require("./shopify"));

module.exports = router;
