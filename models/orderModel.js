// File: models/orderModel.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    shippingAddress: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Address",
    },
    items: [
      {
        jewelry: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: "Jewelry",
        },
        quantity: { type: Number, required: true },
        priceAtOrder: { type: Number, required: true },
        status: {
          type: String,
          required: true,
          enum: ["Processing", "Shipped", "Delivered", "Cancelled"],
          default: "Processing",
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    couponCode: {
      type: String,
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    orderStatus: {
      type: String,
      required: true,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Failed",
      ],
      default: "Pending",
    },
    paymentInfo: {
      razorpay_order_id: String,
      razorpay_payment_id: String,
      razorpay_signature: String,
      payment_status: {
        type: String,
        enum: ["Pending", "Paid", "Failed", "Refunded"],
        default: "Pending",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
