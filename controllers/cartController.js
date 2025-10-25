const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");

exports.getCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate("cart.jewelry");
  res.status(200).json(user.cart);
});

exports.addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const user = await User.findById(req.user.id);

  const existingItemIndex = user.cart.findIndex(
    (item) => item.jewelry.toString() === productId
  );

  if (existingItemIndex > -1) {
    user.cart[existingItemIndex].quantity += quantity;
  } else {
    user.cart.push({ jewelry: productId, quantity });
  }

  await user.save();
  const populatedUser = await user.populate("cart.jewelry");

  res.status(200).json(populatedUser.cart);
});

exports.removeFromCart = asyncHandler(async (req, res) => {
  const { diamondId } = req.params;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $pull: { cart: { jewelry: diamondId } } },
    { new: true }
  ).populate("cart.jewelry");

  res.status(200).json(user.cart);
});

exports.updateCartQuantity = asyncHandler(async (req, res) => {
  const { diamondId } = req.params;
  const { quantity } = req.body;

  if (quantity < 1) {
    const userAfterRemoval = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { cart: { jewelry: diamondId } } },
      { new: true }
    ).populate("cart.jewelry");
    return res.status(200).json(userAfterRemoval.cart);
  }

  const user = await User.findOneAndUpdate(
    { _id: req.user.id, "cart.jewelry": diamondId },
    { $set: { "cart.$.quantity": quantity } },
    { new: true }
  ).populate("cart.jewelry");

  res.status(200).json(user.cart);
});
