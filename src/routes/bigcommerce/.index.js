const express = require("express");
const router = express.Router();

router.use("/customers", require("./customers"));
router.use("/customer-groups", require("./customer-groups"));
router.use("/categories", require("./categories"));
router.use("/brands", require("./brands"));
router.use("/inventory", require("./inventory"));

module.exports = router;
