const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Jewelry = require("../models/diamondModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// 🟢 Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ CREATE ORDER & INITIATE PAYMENT
exports.createOrderAndInitiatePayment = asyncHandler(async (req, res) => {
  try {
    const { items, addressId } = req.body;

    // 🔒 Check user authentication
    if (!req.user?.id) {
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // 🛒 Validate items and address
    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Cart items are required" });
    }
    if (!addressId) {
      return res
        .status(400)
        .json({ success: false, message: "Shipping address is required" });
    }

    // 🧾 Prepare items for DB
    const itemsForDb = items.map((item) => {
      if (!item._id || !item.quantity || !item.price) {
        throw new Error("Invalid item data in cart");
      }
      return {
        jewelry: item._id,
        quantity: item.quantity,
        priceAtOrder: item.price,
      };
    });

    // 💰 Calculate total
    const totalAmount = items.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    );

    if (totalAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order total amount" });
    }

    // 🧾 Create Razorpay order (receipt fixed under 40 chars)
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100), // amount in paise
        currency: "INR",
        receipt: `rcpt_${Date.now()}`, // ✅ fixed short receipt
      });
    } catch (error) {
      console.error(
        "❌ Razorpay order creation failed:",
        error.response ? error.response.body : error
      );
      return res.status(500).json({
        success: false,
        message: "Payment gateway error. Please try again later.",
      });
    }

    // 💾 Save order in DB
    const order = await Order.create({
      userId: user._id,
      shippingAddress: addressId,
      items: itemsForDb,
      totalAmount,
      orderStatus: "Pending",
      paymentInfo: {
        razorpay_order_id: razorpayOrder.id,
        payment_status: "Pending",
      },
    });

    // ✅ Send response
    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
      razorpayOrder,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("❌ Error in createOrderAndInitiatePayment:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Server error" });
  }
});

// ✅ VERIFY PAYMENT
exports.verifyPayment = asyncHandler(async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing payment verification details",
        });
    }

    const order = await Order.findOne({
      "paymentInfo.razorpay_order_id": razorpay_order_id,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      order.paymentInfo = {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_status: "Paid",
      };
      order.orderStatus = "Processing";
      await order.save();

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
  } catch (error) {
    console.error("❌ verifyPayment Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET MY ORDERS
exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.user.id })
    .populate("shippingAddress")
    .populate("items.jewelry", "name images sku")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, orders });
});

// ✅ GET SINGLE ORDER
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

// ✅ ADMIN GET ALL ORDERS
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({})
    .populate("userId", "name email")
    .populate("shippingAddress")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, orders });
});

// ✅ ADMIN UPDATE ORDER STATUS
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

// ✅ ADMIN DELETE ORDER
exports.deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  res
    .status(200)
    .json({ success: true, message: "Order deleted successfully" });
});

// ✅ CANCEL ORDER & REFUND
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
      await razorpay.payments.refund(order.paymentInfo.razorpay_payment_id, {
        amount: Math.round(order.totalAmount * 100),
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

// ✅ GET SELLER ORDERS
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
