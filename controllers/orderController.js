// File: controllers/orderController.js

const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Jewelry = require("../models/diamondModel"); // Ensure you have this import
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
  try {
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
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
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
        return res
          .status(400)
          .json({
            success: false,
            message: "This coupon has reached its usage limit.",
          });
      if (frontendTotalAmount < coupon.minPurchaseAmount)
        return res
          .status(400)
          .json({
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
  } catch (error) {
    console.error("❌ Error in createOrderAndInitiatePayment:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Server error" });
  }
});

// VERIFY PAYMENT
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

      if (order.couponCode) {
        await Coupon.updateOne(
          { code: order.couponCode },
          { $inc: { timesUsed: 1 } }
        );
      }

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

// CANCEL ORDER & REFUND
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

// 🔄 UPDATED & IMPROVED INVOICE HTML
const generateInvoiceHTML = (order) => {
  const subtotal = order.totalAmount;
  const discount = order.discountAmount || 0;
  const taxRate = 0.18; // Assuming 18% tax
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * taxRate;
  const grandTotal = taxableAmount + tax;
  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Replace with your actual logo URL
  const logoUrl = "https://your-brand-logo.com/logo.png";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice - ${order._id}</title>
        <style>
            body { font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; color: #333; }
            .invoice-wrapper { max-width: 800px; margin: auto; padding: 2rem; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .05); }
            .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
            .header-info { text-align: right; }
            .header-info h2 { margin: 0; font-size: 1.5rem; color: #000; }
            .header-info p { margin: 2px 0; font-size: 0.9rem; color: #555; }
            .logo { max-width: 150px; }
            .address-section { display: flex; justify-content: space-between; margin-bottom: 2rem; font-size: 0.9rem; }
            .address-section div { width: 48%; }
            .address-section h3 { margin-top: 0; margin-bottom: 0.5rem; font-size: 1rem; color: #000; }
            .items-table { width: 100%; border-collapse: collapse; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
            .items-table th { background-color: #f9f9f9; font-weight: bold; }
            .items-table .text-right { text-align: right; }
            .items-table .text-center { text-align: center; }
            .totals-section { margin-top: 1.5rem; float: right; width: 40%; }
            .totals-table { width: 100%; }
            .totals-table td { padding: 0.5rem; }
            .totals-table .label { text-align: right; font-weight: bold; }
            .totals-table .grand-total { border-top: 2px solid #333; font-size: 1.2rem; font-weight: bold; }
            .footer { margin-top: 3rem; text-align: center; font-size: 0.8rem; color: #777; border-top: 1px solid #eee; padding-top: 1rem; }
        </style>
    </head>
    <body>
        <div class="invoice-wrapper">
            <header class="invoice-header">
                <div>
                    <img src="${logoUrl}" alt="Jewelen Logo" class="logo">
                </div>
                <div class="header-info">
                    <h2>INVOICE</h2>
                    <p><strong>Invoice #:</strong> ${order._id}</p>
                    <p><strong>Order Date:</strong> ${formatDate(order.createdAt)}</p>
                    <p><strong>Payment Status:</strong> ${order.paymentInfo.payment_status}</p>
                </div>
            </header>
            <section class="address-section">
                <div>
                    <h3>Our Address</h3>
                    <p>Jewelen Inc.<br>123 Jewelry Lane<br>Mumbai, Maharashtra 400001</p>
                </div>
                <div>
                    <h3>Bill To</h3>
                    <p>${order.shippingAddress.fullName || order.userId.name}<br>${order.shippingAddress.addressLine1}<br>${order.shippingAddress.addressLine2 || ""}<br>${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}</p>
                </div>
            </section>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th class="text-center">Quantity</th>
                        <th class="text-right">Price</th>
                        <th class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items
                      .map(
                        (item) => `
                    <tr>
                        <td>${item.jewelry.name}</td>
                        <td class="text-center">${item.quantity}</td>
                        <td class="text-right">₹${item.priceAtOrder.toLocaleString("en-IN")}</td>
                        <td class="text-right">₹${(item.priceAtOrder * item.quantity).toLocaleString("en-IN")}</td>
                    </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
            <div class="totals-section">
                <table class="totals-table">
                    <tr>
                        <td class="label">Subtotal</td>
                        <td class="text-right">₹${subtotal.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                        <td class="label">Discount (${order.couponCode || "N/A"})</td>
                        <td class="text-right" style="color: green;">- ₹${discount.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                        <td class="label">Tax (18%)</td>
                        <td class="text-right">₹${tax.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr class="grand-total">
                        <td class="label">Grand Total</td>
                        <td class="text-right">₹${grandTotal.toLocaleString("en-IN")}</td>
                    </tr>
                </table>
            </div>
            <div style="clear: both;"></div>
            <footer class="footer">
                <p>Thank you for your purchase!</p>
                <p>If you have any questions, please contact support@jewelen.com.</p>
            </footer>
        </div>
    </body>
    </html>
    `;
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
