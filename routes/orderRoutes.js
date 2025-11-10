// routes/orderRoutes.js

const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware.js");
const {
  createOrderAndInitiatePayment,
  verifyPayment,
  cancelOrderAndRefund,
  getSingleOrder,
  getMyOrders,
  getSellerOrders,
  getAllOrders,
  updateOrderStatus,
  deleteOrder,
  generateInvoice,
  updateSellerOrderItemStatus,
} = require("../controllers/orderController.js");

router
  .route("/")
  .post(protect, createOrderAndInitiatePayment)
  .get(protect, admin, getAllOrders);

router.route("/verify-payment").post(protect, verifyPayment);
router.route("/my-orders").get(protect, getMyOrders);
router.route("/seller-orders").get(protect, getSellerOrders);

router.route("/:id/invoice").get(protect, generateInvoice);

// This new route allows a seller to update the status of a specific item in an order
router
  .route("/:orderId/items/:itemId/status")
  .put(protect, updateSellerOrderItemStatus);

router
  .route("/:id")
  .get(protect, getSingleOrder)
  .delete(protect, admin, deleteOrder);

router.route("/:id/cancel").post(protect, cancelOrderAndRefund);
router.route("/:id/status").put(protect, admin, updateOrderStatus);

module.exports = router;
