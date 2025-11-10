// File: controllers/orderController.js

const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Jewelry = require("../models/diamondModel");
const Coupon = require("../models/couponModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const html_to_pdf = require("html-pdf-node");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// CREATE ORDER with Coupon Logic
exports.createOrderAndInitiatePayment = asyncHandler(async (req, res) => {
  const {
    items,
    addressId,
    totalAmount: frontendTotalAmount,
    couponCode,
  } = req.body;

  if (!req.user?.id)
    return res
      .status(401)
      .json({ success: false, message: "User not authenticated" });
  const user = await User.findById(req.user.id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });
  if (!items || items.length === 0)
    return res
      .status(400)
      .json({ success: false, message: "Cart items are required" });
  if (!addressId)
    return res
      .status(400)
      .json({ success: false, message: "Shipping address is required" });
  if (!frontendTotalAmount || frontendTotalAmount <= 0)
    return res
      .status(400)
      .json({ success: false, message: "Invalid order total amount" });

  let discountAmount = 0;
  let finalAmount = frontendTotalAmount;
  let validCouponCode = null;

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode });
    if (!coupon)
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon code." });
    if (!coupon.isActive)
      return res
        .status(400)
        .json({ success: false, message: "This coupon is not active." });
    if (coupon.expiryDate < new Date())
      return res
        .status(400)
        .json({ success: false, message: "This coupon has expired." });
    if (coupon.timesUsed >= coupon.usageLimit)
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit.",
      });
    if (frontendTotalAmount < coupon.minPurchaseAmount)
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchaseAmount} is required.`,
      });

    if (coupon.discountType === "Percentage") {
      discountAmount = (frontendTotalAmount * coupon.discountValue) / 100;
    } else if (coupon.discountType === "Flat") {
      discountAmount = coupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, frontendTotalAmount);
    finalAmount = frontendTotalAmount - discountAmount;
    validCouponCode = coupon.code;
  }

  const itemsForDb = items.map((item) => ({
    jewelry: item._id,
    quantity: item.quantity,
    priceAtOrder: item.price,
  }));

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });
  } catch (error) {
    console.error("❌ Razorpay order creation failed:", error);
    return res
      .status(500)
      .json({ success: false, message: "Payment gateway error." });
  }

  const order = await Order.create({
    userId: user._id,
    shippingAddress: addressId,
    items: itemsForDb,
    totalAmount: frontendTotalAmount,
    discountAmount,
    couponCode: validCouponCode,
    orderStatus: "Pending",
    paymentInfo: {
      razorpay_order_id: razorpayOrder.id,
      payment_status: "Pending",
    },
  });

  res.status(201).json({
    success: true,
    message: "Order created successfully",
    order,
    razorpayOrder,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  });
});

// VERIFY PAYMENT
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      message: "Missing payment verification details",
    });
  }
  const order = await Order.findOne({
    "paymentInfo.razorpay_order_id": razorpay_order_id,
  });
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    order.paymentInfo = {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_status: "Paid",
    };
    order.orderStatus = "Processing";
    await order.save();

    if (order.couponCode) {
      await Coupon.updateOne(
        { code: order.couponCode },
        { $inc: { timesUsed: 1 } }
      );
    }

    await User.findByIdAndUpdate(req.user.id, { cart: [] });
    res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      orderId: order._id,
    });
  } else {
    order.paymentInfo.payment_status = "Failed";
    order.orderStatus = "Failed";
    await order.save();
    res
      .status(400)
      .json({ success: false, message: "Payment verification failed." });
  }
});

// GET MY ORDERS
exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.user.id })
    .populate("shippingAddress")
    .populate("items.jewelry", "name images sku")
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, orders });
});

// GET SINGLE ORDER
exports.getSingleOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("userId", "name email")
    .populate("shippingAddress")
    .populate("items.jewelry");
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  if (
    order.userId._id.toString() !== req.user.id &&
    req.user.role !== "Admin"
  ) {
    return res
      .status(403)
      .json({ success: false, message: "Not authorized to view this order" });
  }
  res.status(200).json({ success: true, order });
});

// ADMIN GET ALL ORDERS
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({})
    .populate("userId", "name email")
    .populate("shippingAddress")
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, orders });
});

// ADMIN UPDATE ORDER STATUS
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res
      .status(400)
      .json({ success: false, message: "Status is required" });
  }
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  order.orderStatus = status;
  await order.save();
  res.status(200).json({ success: true, order });
});

// ADMIN DELETE ORDER
exports.deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  res
    .status(200)
    .json({ success: true, message: "Order deleted successfully" });
});

// CANCEL ORDER & REFUND (For User and Admin)
exports.cancelOrderAndRefund = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  if (order.userId.toString() !== req.user.id && req.user.role !== "Admin") {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }
  if (
    order.orderStatus === "Cancelled" ||
    order.paymentInfo.payment_status === "Refunded"
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Order already cancelled or refunded" });
  }
  if (order.paymentInfo.payment_status === "Paid") {
    try {
      const finalAmountToRefund = order.totalAmount - order.discountAmount;
      await razorpay.payments.refund(order.paymentInfo.razorpay_payment_id, {
        amount: Math.round(finalAmountToRefund * 100),
      });
      order.paymentInfo.payment_status = "Refunded";
    } catch (error) {
      console.error("❌ Refund error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Refund failed via Razorpay" });
    }
  }
  order.orderStatus = "Cancelled";
  await order.save();
  res
    .status(200)
    .json({ success: true, message: "Order cancelled successfully" });
});

// GET SELLER ORDERS
exports.getSellerOrders = asyncHandler(async (req, res) => {
  const sellerJewelry = await Jewelry.find({ seller: req.user.id }).select(
    "_id"
  );
  const sellerJewelryIds = sellerJewelry.map((j) => j._id);
  if (sellerJewelryIds.length === 0) {
    return res.status(200).json({ success: true, orders: [] });
  }
  const orders = await Order.find({
    "items.jewelry": { $in: sellerJewelryIds },
  })
    .populate("userId", "name email")
    .populate("shippingAddress")
    .populate("items.jewelry")
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, orders });
});

// UPDATE SELLER ORDER ITEM STATUS
exports.updateSellerOrderItemStatus = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { status } = req.body;

  if (
    !status ||
    !["Processing", "Shipped", "Delivered", "Cancelled"].includes(status)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid status provided." });
  }

  const order = await Order.findById(orderId).populate("items.jewelry");
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  const itemToUpdate = order.items.find(
    (item) => item._id.toString() === itemId
  );
  if (!itemToUpdate) {
    return res
      .status(404)
      .json({ success: false, message: "Item not found in this order" });
  }

  if (itemToUpdate.jewelry.seller.toString() !== req.user.id) {
    return res
      .status(403)
      .json({
        success: false,
        message: "You are not authorized to update this item.",
      });
  }

  itemToUpdate.status = status;
  await order.save();

  res
    .status(200)
    .json({ success: true, message: "Item status updated.", order });
});

// GENERATE INVOICE HTML (Helper function)
const generateInvoiceHTML = (order) => {
  // This is a placeholder. You should replace it with your full HTML generation logic.
  return `<h1>Invoice for Order ${order._id}</h1>`;
};

// GENERATE & DOWNLOAD INVOICE
exports.generateInvoice = asyncHandler(async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userId", "name email")
      .populate("shippingAddress")
      .populate({ path: "items.jewelry", model: "Jewelry", select: "name" });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    if (
      order.userId._id.toString() !== req.user.id &&
      req.user.role !== "Admin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    const htmlContent = generateInvoiceHTML(order);
    const options = { format: "A4", printBackground: true };
    const pdfBuffer = await html_to_pdf.generatePdf(
      { content: htmlContent },
      options
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order._id}.pdf`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Error generating invoice:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate invoice" });
  }
});
