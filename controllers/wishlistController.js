const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");

exports.getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate("wishlist");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json(user.wishlist);
});

exports.addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    res.status(400);
    throw new Error("Product ID is required");
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $addToSet: { wishlist: productId } },
    { new: true }
  ).populate("wishlist");

  res.status(200).json(user.wishlist);
});

exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const { diamondId } = req.params;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $pull: { wishlist: diamondId } },
    { new: true }
  ).populate("wishlist");

  res.status(200).json(user.wishlist);
});
