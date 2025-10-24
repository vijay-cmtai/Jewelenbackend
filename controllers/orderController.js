const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Jewelry = require("../models/diamondModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Notification = require("../models/notificationModel");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
exports.createOrderAndInitiatePayment = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate({
    path: "cart",
    model: "Jewelry", 
  });

  if (!user || user.cart.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Your cart is empty.",
    });
  }
  const itemsWithPrice = user.cart.map((item) => ({
    jewelry: item._id, 
    priceAtOrder: item.price,
  }));
  const totalAmount = itemsWithPrice.reduce(
    (sum, item) => sum + item.priceAtOrder,
    0
  );
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(totalAmount * 100),
    currency: "INR",
    receipt: `receipt_${new Date().getTime()}`,
  });
  const order = await Order.create({
    userId: user._id,
    items: itemsWithPrice,
    totalAmount,
    paymentInfo: { razorpay_order_id: razorpayOrder.id },
  });
  user.cart = [];
  await user.save();
  res.status(201).json({
    success: true,
    order,
    razorpayOrder,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  const order = await Order.findOne({
    "paymentInfo.razorpay_order_id": razorpay_order_id,
  }).populate({
    path: "items.jewelry", 
    model: "Jewelry",
    populate: {
      path: "seller", 
      model: "User",
    },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found.",
    });
  }

  if (isAuthentic) {
    order.paymentInfo = {
      ...order.paymentInfo,
      razorpay_payment_id,
      razorpay_signature,
      payment_status: "Paid",
    };
    order.orderStatus = "Processing";
    await order.save();

    for (const item of order.items) {
      if (item.jewelry && item.jewelry.seller) {
        const sellerId = item.jewelry.seller._id;

        await Jewelry.findByIdAndUpdate(item.jewelry._id, {
          $inc: { stockQuantity: -1 },
        });

        const notificationMessage = `Your jewelry item (SKU: ${
          item.jewelry.sku
        }) has been sold in order #${order._id.toString().slice(-6)}.`;

        await Notification.create({
          user: sellerId,
          message: notificationMessage,
          link: `/orders/${order._id}`,
        });
      }
    }
    res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      orderId: order._id,
    });
  } else {
    order.paymentInfo.payment_status = "Failed";
    order.orderStatus = "Failed";
    await order.save();

    res.status(400).json({
      success: false,
      message: "Payment verification failed.",
    });
  }
});

exports.getSingleOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("userId", "name email")
    .populate("items.jewelry");

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  if (
    order.userId._id.toString() !== req.user.id &&
    req.user.role !== "Admin"
  ) {
    return res.status(403).json({
      success: false,
      message: "Not authorized.",
    });
  }

  res.status(200).json({ success: true, order });
});
exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.user.id })
    .populate("items.jewelry", "sku name images") 
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, orders });
});
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
    .populate("items.jewelry")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, orders });
});

// Admin ke liye saare orders
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({})
    .populate("userId", "name email")
    .sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    totalOrders: orders.length,
    orders,
  });
});
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  order.orderStatus = status;
  await order.save({ validateBeforeSave: true });

  res.status(200).json({
    success: true,
    message: `Order status updated to ${status}`,
    order,
  });
});
exports.cancelOrderAndRefund = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  if (order.userId.toString() !== req.user.id && req.user.role !== "Admin") {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }
  if (
    order.orderStatus === "Cancelled" ||
    order.paymentInfo.payment_status === "Refunded"
  ) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Order is already cancelled or refunded.",
      });
  }
  if (order.paymentInfo.payment_status === "Paid") {
    try {
      await razorpay.payments.refund(order.paymentInfo.razorpay_payment_id, {
        amount: Math.round(order.totalAmount * 100),
      });
      order.paymentInfo.payment_status = "Refunded";
    } catch (error) {
      return res
        .status(500)
        .json({
          success: false,
          message: "Refund failed.",
          error: error.message,
        });
    }
  }

  order.orderStatus = "Cancelled";
  await order.save();
  for (const item of order.items) {
    await Jewelry.findByIdAndUpdate(item.jewelry, {
      $inc: { stockQuantity: 1 },
    });
  }

  res
    .status(200)
    .json({
      success: true,
      message: "Order cancelled and refund processed successfully.",
    });
});
exports.deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }
  res.status(200).json({
    success: true,
    message: "Order deleted successfully",
  });
});
