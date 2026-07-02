// Maps Shopify "${displayFinancialStatus}:${displayFulfillmentStatus}" → BigCommerce status_id.
// IDs below are BC's default order statuses — confirm against the live store's
// GET /v2/order_statuses before running bulk, in case statuses were customized.
const STATUS_MAP = {
  "PENDING:UNFULFILLED": 7, // Awaiting Payment
  "AUTHORIZED:UNFULFILLED": 7, // Awaiting Payment
  "PAID:UNFULFILLED": 11, // Awaiting Fulfillment
  "PAID:PARTIAL": 9, // Awaiting Shipment
  "PAID:FULFILLED": 10, // Completed
  "PARTIALLY_REFUNDED:FULFILLED": 14, // Partially Refunded
  "PARTIALLY_REFUNDED:UNFULFILLED": 14, // Partially Refunded
  "REFUNDED:FULFILLED": 4, // Refunded
  "REFUNDED:UNFULFILLED": 4, // Refunded
  "VOIDED:UNFULFILLED": 5, // Cancelled
};

const DEFAULT_STATUS_ID = 11; // Awaiting Fulfillment

module.exports = {
  STATUS_MAP,
  DEFAULT_STATUS_ID,
  resolveStatusId(financialStatus, fulfillmentStatus) {
    const key = `${financialStatus}:${fulfillmentStatus}`;
    return STATUS_MAP[key] ?? DEFAULT_STATUS_ID;
  },
};
