const express = require("express");
const router = express.Router();
const {
  getCart,
  addToCart,
  removeFromCart,
  updateCartQuantity,
} = require("../controllers/cartController");
const { protect } = require("../middleware/authMiddleware");

router.route("/").get(protect, getCart);
router.route("/add").post(protect, addToCart);
router.route("/remove/:diamondId").delete(protect, removeFromCart); 
router.route("/update-quantity").put(protect, updateCartQuantity); 

module.exports = router;
