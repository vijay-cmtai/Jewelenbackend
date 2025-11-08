// File: controllers/couponController.js

const asyncHandler = require("express-async-handler");
const Coupon = require("../models/couponModel");

// @desc    Create a new coupon
// @route   POST /api/coupons
// @access  Private/Admin
exports.createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    discountType,
    discountValue,
    minPurchaseAmount,
    expiryDate,
    usageLimit,
    isActive,
  } = req.body;

  if (!code || !discountType || !discountValue || !expiryDate || !usageLimit) {
    res.status(400);
    throw new Error(
      "Please provide all required coupon fields: code, type, value, expiry, and limit."
    );
  }

  const couponExists = await Coupon.findOne({ code: code.toUpperCase() });
  if (couponExists) {
    res.status(400);
    throw new Error("Coupon with this code already exists.");
  }

  const coupon = await Coupon.create({
    code,
    discountType,
    discountValue,
    minPurchaseAmount,
    expiryDate,
    usageLimit,
    isActive,
  });

  res.status(201).json({ success: true, coupon });
});

// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Private/Admin
exports.getAllCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, coupons });
});

// @desc    Delete a coupon by ID
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
exports.deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (coupon) {
    await coupon.deleteOne();
    res
      .status(200)
      .json({ success: true, message: "Coupon removed successfully" });
  } else {
    res.status(404);
    throw new Error("Coupon not found");
  }
});

// @desc    Validate a coupon code for a user
// @route   POST /api/coupons/validate
// @access  Private (for logged-in users)
exports.validateCoupon = asyncHandler(async (req, res) => {
  const { code, totalAmount } = req.body;

  if (!code || totalAmount === undefined) {
    res.status(400);
    throw new Error("Coupon code and total amount are required.");
  }

  const coupon = await Coupon.findOne({ code: code.toUpperCase() });

  if (!coupon) {
    res.status(404);
    throw new Error("Invalid coupon code.");
  }
  if (!coupon.isActive) {
    res.status(400);
    throw new Error("This coupon is currently not active.");
  }
  if (coupon.expiryDate < new Date()) {
    res.status(400);
    throw new Error("This coupon has expired.");
  }
  if (coupon.timesUsed >= coupon.usageLimit) {
    res.status(400);
    throw new Error("This coupon has reached its maximum usage limit.");
  }
  if (totalAmount < coupon.minPurchaseAmount) {
    res.status(400);
    throw new Error(
      `A minimum purchase of ₹${coupon.minPurchaseAmount} is required to use this coupon.`
    );
  }

  let discountAmount = 0;
  if (coupon.discountType === "Percentage") {
    discountAmount = (totalAmount * coupon.discountValue) / 100;
  } else if (coupon.discountType === "Flat") {
    discountAmount = coupon.discountValue;
  }

  // Ensure discount is not more than the total amount
  discountAmount = Math.min(discountAmount, totalAmount);

  res.status(200).json({
    success: true,
    code: coupon.code,
    discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimal places
  });
});
