// File: routes/couponRoutes.js

const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAllCoupons,
  deleteCoupon,
  validateCoupon,
} = require("../controllers/couponController");

const { protect, admin } = require("../middleware/authMiddleware");

// Admin Routes for managing coupons
router
  .route("/")
  .post(protect, admin, createCoupon)
  .get(protect, admin, getAllCoupons);

router.route("/:id").delete(protect, admin, deleteCoupon);

// User Route for validating a coupon during checkout
router.post("/validate", protect, validateCoupon);

module.exports = router;
