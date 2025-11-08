// File: routes/couponRoutes.js

const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAllCoupons,
  deleteCoupon,
  validateCoupon,
} = require("../controllers/couponController");

const { protect, isAdmin } = require("../middleware/authMiddleware");

// Admin Routes for managing coupons
router
  .route("/")
  .post(protect, isAdmin, createCoupon)
  .get(protect, isAdmin, getAllCoupons);

router.route("/:id").delete(protect, isAdmin, deleteCoupon);

// User Route for validating a coupon during checkout
router.post("/validate", protect, validateCoupon);

module.exports = router;
