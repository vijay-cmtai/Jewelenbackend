const asyncHandler = require("express-async-handler");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
exports.getUserDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [user, totalSpentData, ordersPlaced, recentOrder] = await Promise.all([
    User.findById(userId).select("wishlist"),

    Order.aggregate([
      {
        $match: {
          userId: userId,
          orderStatus: { $in: ["Completed", "Delivered"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),

    Order.countDocuments({ userId: userId }),

    Order.findOne({ userId: userId }).sort({ createdAt: -1 }).populate({
      path: "items.jewelry",
      select: "name images",
    }),
  ]);

  const totalSpent = totalSpentData[0]?.total || 0;
  const wishlistItems = user ? user.wishlist.length : 0;

  res.status(200).json({
    success: true,
    stats: {
      totalSpent,
      ordersPlaced,
      wishlistItems,
      recentOrder,
    },
  });
});
