const colors = require("colors");

// Configuration
const config = {
  enableColors: process.env.LOG_COLORS !== "false",
  enableTimestamps: process.env.LOG_TIMESTAMPS !== "false",
  logLevel: process.env.LOG_LEVEL || "info", // error, warn, info, debug
};

// Log levels hierarchy
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Formats additional data (objects, arrays, errors)
 * @param {*} data - Data to format
 * @returns {string} Formatted data
 */
const formatData = (data) => {
  if (data === null || data === undefined || data === "") return "";

  if (data instanceof Error) {
    return `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
  }

  if (typeof data === "object") {
    try {
      return `\n  ${JSON.stringify(data, null, 2)}`;
    } catch (err) {
      return `\n  [Unable to stringify object]`;
    }
  }

  return ` ${data}`;
};

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {Function} colorFn - Color function to apply
 */
const log = (level, req_id, message, target, colorFn) => {
  // Check if this log level should be output
  const currentLevel = LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;
  const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.info;

  if (messageLevel > currentLevel) return;

  req_id = req_id || "system";
  const formattedData = formatData(target);
  const logMessage = `[${req_id}] ${message}${formattedData}`;

  if (config.enableColors && colorFn) {
    console.log(colorFn(logMessage));
  } else {
    console.log(logMessage);
  }
};

// ============================================================================
// Cyan based - Informational messages
// ============================================================================

/**
 * Notice - Important informational message (bold cyan)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.notice = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.cyan.bold);
};

/**
 * Info - Standard informational message (cyan)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.info = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.cyan);
};

// ============================================================================
// Green based - Success messages
// ============================================================================

/**
 * Success - Important success message (bold green)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.success = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.green.bold);
};

/**
 * Complete - Operation completed message (green)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.complete = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.green);
};

// ============================================================================
// Red based - Error messages
// ============================================================================

/**
 * Failure - Critical failure message (bold red)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log (can be Error object)
 */
exports.failure = (req_id = "system", message, target = null) => {
  log("error", req_id, message, target, (msg) => msg.red.bold);
};

/**
 * Error - Standard error message (red)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log (can be Error object)
 */
exports.error = (req_id = "system", message, target = null) => {
  log("error", req_id, message, target, (msg) => msg.red);
};

// ============================================================================
// Yellow based - Warning messages
// ============================================================================

/**
 * Advise - Important advisory message (bold yellow)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.advise = (req_id = "system", message, target = null) => {
  log("warn", req_id, message, target, (msg) => msg.yellow.bold);
};

/**
 * Warning - Standard warning message (yellow)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.warning = (req_id = "system", message, target = null) => {
  log("warn", req_id, message, target, (msg) => msg.yellow);
};

// ============================================================================
// Magenta based - Debug messages
// ============================================================================

/**
 * Highlight - Important debug/attention message (bold magenta)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.highlight = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.magenta.bold);
};

/**
 * Debug - Debug level message (magenta)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.debug = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.magenta);
};

// ============================================================================
// Blue based - Trace/Metrics messages
// ============================================================================

/**
 * Metric - Important metric or measurement message (bold blue)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.metric = (req_id = "system", message, target = null) => {
  log("info", req_id, message, target, (msg) => msg.blue.bold);
};

/**
 * Trace - Detailed trace/flow message (blue)
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 */
exports.trace = (req_id = "system", message, target = null) => {
  log("debug", req_id, message, target, (msg) => msg.blue);
};

// ============================================================================
// Direct color functions (for custom use cases)
// ============================================================================

/**
 * Cyan - Direct cyan colored message
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {boolean} bold - Whether to use bold
 */
exports.cyan = (req_id = "system", message, target = null, bold = false) => {
  log("info", req_id, message, target, (msg) =>
    bold ? msg.cyan.bold : msg.cyan,
  );
};

/**
 * Green - Direct green colored message
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {boolean} bold - Whether to use bold
 */
exports.green = (req_id = "system", message, target = null, bold = false) => {
  log("info", req_id, message, target, (msg) =>
    bold ? msg.green.bold : msg.green,
  );
};

/**
 * Red - Direct red colored message
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {boolean} bold - Whether to use bold
 */
exports.red = (req_id = "system", message, target = null, bold = false) => {
  log("error", req_id, message, target, (msg) =>
    bold ? msg.red.bold : msg.red,
  );
};

/**
 * Yellow - Direct yellow colored message
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {boolean} bold - Whether to use bold
 */
exports.yellow = (req_id = "system", message, target = null, bold = false) => {
  log("warn", req_id, message, target, (msg) =>
    bold ? msg.yellow.bold : msg.yellow,
  );
};

/**
 * Blue - Direct blue colored message
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {boolean} bold - Whether to use bold
 */
exports.blue = (req_id = "system", message, target = null, bold = false) => {
  log("info", req_id, message, target, (msg) =>
    bold ? msg.blue.bold : msg.blue,
  );
};

/**
 * Magenta - Direct magenta colored message
 * @param {string} req_id - Request ID or identifier
 * @param {string} message - Log message
 * @param {*} target - Additional data to log
 * @param {boolean} bold - Whether to use bold
 */
exports.magenta = (req_id = "system", message, target = null, bold = false) => {
  log("debug", req_id, message, target, (msg) =>
    bold ? msg.magenta.bold : msg.magenta,
  );
};

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Configure logger settings at runtime
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableColors - Enable/disable colors
 * @param {boolean} options.enableTimestamps - Enable/disable timestamps
 * @param {string} options.logLevel - Log level (error, warn, info, debug)
 */
exports.configure = (options) => {
  if (options.enableColors !== undefined) {
    config.enableColors = options.enableColors;
  }
  if (options.enableTimestamps !== undefined) {
    config.enableTimestamps = options.enableTimestamps;
  }
  if (options.logLevel !== undefined) {
    config.logLevel = options.logLevel;
  }
};
