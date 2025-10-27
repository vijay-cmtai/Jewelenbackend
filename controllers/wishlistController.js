const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");

// @desc    Toggle (add/remove) an item in the user's wishlist
// @route   POST /api/wishlist/toggle
// @access  Private
exports.toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Check if the product is already in the wishlist
  const itemIndex = user.wishlist.findIndex(
    (itemId) => itemId.toString() === productId
  );

  if (itemIndex > -1) {
    // If product exists in wishlist, remove it
    user.wishlist.splice(itemIndex, 1);
  } else {
    // If product does not exist, add it
    user.wishlist.push(productId);
  }

  // Save the updated user document
  await user.save();

  // Populate the wishlist with product details before sending it back
  // Yeh zaroori hai taaki frontend ko ID ke saath-saath name, price, images bhi milein
  const populatedUser = await user.populate({
    path: "wishlist",
    model: "Jewelry", // Model ka naam jise populate karna hai
    select: "_id name sku price images", // Frontend ko jo fields chahiye
  });

  res.status(200).json(populatedUser.wishlist);
});

// @desc    Get the user's wishlist
// @route   GET /api/wishlist
// @access  Private
exports.getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate({
    path: "wishlist",
    model: "Jewelry",
    select: "_id name sku price images",
  });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json(user.wishlist);
});
