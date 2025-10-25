// routes/authRoutes.js

const express = require("express");
const router = express.Router();

const {
  register,
  login,
  getMe,
  getAllUsers,
  getUserDetailsById,
  updateUser,
  deleteUser,
} = require("../controllers/authController");

const { protect, isAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// YAHAN BADLAV KIYA GAYA HAI
// Multer ko bataya gaya hai ki 'profilePicture' naam ki ek file aayegi
router.post("/register", upload.single("profilePicture"), register);

router.post("/login", login);

router.get("/me", protect, getMe);

router.get("/all", protect, isAdmin, getAllUsers);
router.get("/:id", protect, isAdmin, getUserDetailsById);
router.put("/:id", protect, isAdmin, updateUser);
router.delete("/:id", protect, isAdmin, deleteUser);

module.exports = router;
