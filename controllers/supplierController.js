// File: controllers/supplierController.js

const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const Jewelry = require("../models/diamondModel");
const User = require("../models/userModel");

// Helper function to get start of a given month
const getMonthStart = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * @desc    Get dashboard statistics for a supplier
 * @route   GET /api/supplier/dashboard
 * @access  Private/Supplier
 */
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const supplierId = req.user._id;

  // 1. Get IDs of all jewelry belonging to the supplier
  const supplierJewelryIds = await Jewelry.find({
    seller: supplierId,
  }).distinct("_id");

  if (supplierJewelryIds.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        totalRevenue: 0,
        newOrdersCount: 0,
        productsInStock: 0,
        salesOverview: [],
        bestSellers: [],
        recentOrders: [],
      },
    });
  }

  // --- CALCULATE STATS ---

  // 2. Total Revenue and Recent Orders
  const orders = await Order.find({
    "items.jewelry": { $in: supplierJewelryIds },
    "paymentInfo.payment_status": "Paid",
  })
    .populate("userId", "name")
    .sort({ createdAt: -1 });

  let totalRevenue = 0;
  const recentOrders = [];
  const productSalesCount = {};

  orders.forEach((order) => {
    order.items.forEach((item) => {
      if (supplierJewelryIds.some((id) => id.equals(item.jewelry))) {
        totalRevenue += item.priceAtOrder * item.quantity;

        // Populate product sales for best sellers
        const jewelryId = item.jewelry.toString();
        productSalesCount[jewelryId] =
          (productSalesCount[jewelryId] || 0) + item.quantity;
      }
    });

    if (recentOrders.length < 5) {
      recentOrders.push({
        _id: order._id,
        customer: order.userId.name,
        status: order.orderStatus,
        amount: order.items.reduce((acc, item) => {
          if (supplierJewelryIds.some((id) => id.equals(item.jewelry))) {
            return acc + item.priceAtOrder * item.quantity;
          }
          return acc;
        }, 0),
      });
    }
  });

  // 3. New Orders (this month)
  const startOfMonth = getMonthStart(new Date());
  const newOrdersCount = await Order.countDocuments({
    "items.jewelry": { $in: supplierJewelryIds },
    "paymentInfo.payment_status": "Paid",
    createdAt: { $gte: startOfMonth },
  });

  // 4. Products in Stock
  const productsInStock = await Jewelry.countDocuments({
    seller: supplierId,
    stockQuantity: { $gt: 0 },
  });

  // 5. Sales Overview (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlySales = await Order.aggregate([
    {
      $match: {
        "items.jewelry": { $in: supplierJewelryIds },
        "paymentInfo.payment_status": "Paid",
        createdAt: { $gte: sixMonthsAgo },
      },
    },
    { $unwind: "$items" },
    { $match: { "items.jewelry": { $in: supplierJewelryIds } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        total: {
          $sum: { $multiply: ["$items.priceAtOrder", "$items.quantity"] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  const salesOverview = monthlySales.map((sale) => ({
    month: new Date(sale._id.year, sale._id.month - 1).toLocaleString(
      "default",
      { month: "short" }
    ),
    revenue: sale.total,
  }));

  // 6. Best Sellers
  const sortedProducts = Object.entries(productSalesCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const bestSellerIds = sortedProducts.map(([id]) => id);
  const bestSellerDetails = await Jewelry.find({
    _id: { $in: bestSellerIds },
  }).select("name images");

  const bestSellers = bestSellerDetails.map((product) => ({
    name: product.name,
    sales: productSalesCount[product._id.toString()],
    image: product.images[0],
  }));

  res.status(200).json({
    success: true,
    data: {
      totalRevenue,
      newOrdersCount,
      productsInStock,
      salesOverview,
      bestSellers,
      recentOrders,
    },
  });
});
