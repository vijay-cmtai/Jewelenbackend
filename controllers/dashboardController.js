const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Jewelry = require("../models/diamondModel");
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalRevenueData,
    totalOrders,
    activeBuyers,
    activeSuppliers,
    totalProducts,
    recentOrders,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: "Completed" } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]),
    Order.countDocuments(),
    User.countDocuments({ role: "Buyer", status: "Approved" }),
    User.countDocuments({ role: "Supplier", status: "Approved" }),
    Jewelry.countDocuments(),
    Order.find().sort({ createdAt: -1 }).limit(5).populate("userId", "name"),
  ]);

  // Data ko saaf format mein bhejein
  const totalRevenue = totalRevenueData[0]?.totalRevenue || 0;

  res.status(200).json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders,
      activeBuyers,
      activeSuppliers,
      totalProducts,
      recentOrders,
    },
  });
});
