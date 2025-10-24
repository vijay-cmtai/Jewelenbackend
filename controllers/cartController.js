const User = require("../models/userModel");
const Jewelry = require("../models/diamondModel"); // Path check kar lein

exports.getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const cartWithDetails = await Promise.all(
      user.cart.map(async (cartItem) => {
        if (!cartItem || !cartItem.productId) return null;
        const jewelry = await Jewelry.findById(cartItem.productId);
        if (!jewelry) return null;

        return {
          ...jewelry.toObject(),
          quantity: cartItem.quantity || 1,
        };
      })
    );
    const validCartItems = cartWithDetails.filter(Boolean);
    res.status(200).json({ items: validCartItems });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.addToCart = async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  try {
    const jewelry = await Jewelry.findById(productId);
    if (!jewelry) return res.status(404).json({ message: "Product not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!Array.isArray(user.cart)) user.cart = [];

    const existingItemIndex = user.cart.findIndex(
      (item) => item.productId && item.productId.toString() === productId
    );

    let updatedQuantity;
    if (existingItemIndex > -1) {
      user.cart[existingItemIndex].quantity += quantity;
      updatedQuantity = user.cart[existingItemIndex].quantity;
    } else {
      user.cart.push({ productId, quantity });
      updatedQuantity = quantity;
    }

    await user.save();

    const addedItem = { ...jewelry.toObject(), quantity: updatedQuantity };
    res.status(200).json({ message: "Added to cart", item: addedItem });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// --- YEH NAYA FUNCTION HAI ---
exports.updateCartQuantity = async (req, res) => {
  const { productId, quantity } = req.body;

  if (quantity < 1) {
    return res.status(400).json({ message: "Quantity must be at least 1" });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const itemIndex = user.cart.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (itemIndex > -1) {
      user.cart[itemIndex].quantity = quantity;
      await user.save();
      const jewelry = await Jewelry.findById(productId);
      const updatedItem = { ...jewelry.toObject(), quantity };
      res.status(200).json({ message: "Quantity updated", item: updatedItem });
    } else {
      res.status(404).json({ message: "Item not found in cart" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// -----------------------------

exports.removeFromCart = async (req, res) => {
  const { diamondId } = req.params; // Iska naam 'productId' hona chahiye
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.cart = user.cart.filter(
      (item) => item.productId.toString() !== diamondId
    );
    await user.save();
    res.status(200).json({ message: "Removed from cart" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
