const express = require("express");
const router = express.Router();

const {
  register,
  login,
  verifyOtp,
  forgotPassword,
  resetPassword,
  getMe,
  getAllUsers,
  getUserDetailsById,
  updateUser,
  deleteUser,
} = require("../controllers/authController");

const { protect, admin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.post("/register", upload.single("profilePicture"), register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.put("/reset-password/:token", resetPassword);

router.get("/me", protect, getMe);

router.get("/all", protect, admin, getAllUsers);
router.get("/:id", protect, admin, getUserDetailsById);
router.put("/:id", protect, admin, updateUser);
router.delete("/:id", protect, admin, deleteUser);

module.exports = router;
