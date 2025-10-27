// controllers/orderController.js

const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const html_to_pdf = require("html-pdf-node"); // <-- NEW: Import PDF library

// 🟢 Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ CREATE ORDER & INITIATE PAYMENT (FIXED)
exports.createOrderAndInitiatePayment = asyncHandler(async (req, res) => {
  try {
    // <-- FIX 1: Accept totalAmount from the request body
    const { items, addressId, totalAmount: frontendTotalAmount } = req.body;

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
    // <-- FIX 2: Validate the total amount received from frontend
    if (!frontendTotalAmount || frontendTotalAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order total amount" });
    }

    const itemsForDb = items.map((item) => ({
      jewelry: item._id,
      quantity: item.quantity,
      priceAtOrder: item.price,
    }));

    // <-- FIX 3: We no longer calculate the total on the backend. We use the value from the frontend.

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        // <-- FIX 4: Use the correct frontendTotalAmount for payment
        amount: Math.round(frontendTotalAmount * 100),
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
      // <-- FIX 5: Save the correct total amount to the database
      totalAmount: frontendTotalAmount,
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
    if (expectedSignature === razorpay_signature) {
      order.paymentInfo = {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_status: "Paid",
      };
      order.orderStatus = "Processing";
      await order.save();
      await User.findByIdAndUpdate(req.user.id, { cart: [] });
      res
        .status(200)
        .json({
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

// ============== NEW INVOICE FUNCTIONALITY =================
const generateInvoiceHTML = (order) => {
  const subtotal = order.items.reduce(
    (acc, item) => acc + item.priceAtOrder * item.quantity,
    0
  );
  const tax = order.totalAmount - subtotal;
  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8" /><title>Invoice - ${order._id}</title><style>body{font-family:'Helvetica Neue','Helvetica',Helvetica,Arial,sans-serif;text-align:center;color:#777;}.invoice-box{max-width:800px;margin:auto;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15);font-size:16px;line-height:24px;}.invoice-box table{width:100%;line-height:inherit;text-align:left;}.invoice-box table td{padding:5px;vertical-align:top;}.invoice-box table tr td:nth-child(2){text-align:right;}.invoice-box table tr.top table td{padding-bottom:20px;}.invoice-box table tr.top table td.title{font-size:45px;line-height:45px;color:#333;}.invoice-box table tr.information table td{padding-bottom:40px;}.invoice-box table tr.heading td{background:#eee;border-bottom:1px solid #ddd;font-weight:bold;}.invoice-box table tr.details td{padding-bottom:20px;}.invoice-box table tr.item td{border-bottom:1px solid #eee;}.invoice-box table tr.item.last td{border-bottom:none;}.invoice-box table tr.total td:nth-child(2){border-top:2px solid #eee;font-weight:bold;}</style></head><body><div class="invoice-box"><table cellpadding="0" cellspacing="0"><tr class="top"><td colspan="4"><table><tr><td class="title">Jewelen</td><td>Invoice #: ${order._id}<br />Created: ${formatDate(order.createdAt)}<br />Payment Status: ${order.paymentInfo.payment_status}</td></tr></table></td></tr><tr class="information"><td colspan="4"><table><tr><td>Jewelen Inc.<br />123 Jewelry Lane<br />Mumbai, MH 400001</td><td><strong>Bill To:</strong><br />${order.shippingAddress.fullName || order.userId.name}<br />${order.shippingAddress.addressLine1}<br />${order.shippingAddress.addressLine2 || ""}<br />${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}</td></tr></table></td></tr><tr class="heading"><td>Item</td><td style="text-align:center;">Quantity</td><td style="text-align:right;">Price</td><td style="text-align:right;">Total</td></tr>${order.items.map((item) => `<tr class="item"><td>${item.jewelry.name}</td><td style="text-align:center;">${item.quantity}</td><td style="text-align:right;">₹${item.priceAtOrder.toLocaleString("en-IN")}</td><td style="text-align:right;">₹${(item.priceAtOrder * item.quantity).toLocaleString("en-IN")}</td></tr>`).join("")}<tr class="total"><td colspan="3">Subtotal</td><td>₹${subtotal.toLocaleString("en-IN")}</td></tr><tr class="total"><td colspan="3">Taxes & Charges</td><td>₹${tax.toLocaleString("en-IN")}</td></tr><tr class="total" style="font-weight:bold;font-size:18px;"><td colspan="3">Grand Total</td><td>₹${order.totalAmount.toLocaleString("en-IN")}</td></tr></table></div></body></html>`;
};

// ✅ GENERATE & DOWNLOAD INVOICE
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
    const options = { format: "A4" };
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
