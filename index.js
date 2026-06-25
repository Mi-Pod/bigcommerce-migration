const express = require("express");

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const logger = require("./src/utils/logger.js");
const apiRouter = require("./src/routes/index.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/api", apiRouter);

app.listen(PORT, async () => {
  console.clear();
  logger.success(
    "SYSTEM",
    "Server is started on:",
    `http://localhost:${PORT}/api`,
  );

  process.on("SIGINT", async () => {
    logger.warning("system", "SIGINT received. Shutting down server");
    process.exit(0);
  });
});
