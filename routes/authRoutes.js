// routes/authRoutes.js - DEBUG VERSION
const express = require("express");
const router = express.Router();

// Import controller functions
const authController = require("../controllers/authController");

// Debug: Check what's imported
console.log("Auth Controller exports:", Object.keys(authController));

const {
  register,
  login,
  getMe,
  getAllUsers,
  getUserDetailsById,
  updateUser,
  deleteUser,
} = authController;

// Debug: Check each function
console.log("register:", typeof register);
console.log("login:", typeof login);
console.log("getMe:", typeof getMe);
console.log("getAllUsers:", typeof getAllUsers);
console.log("getUserDetailsById:", typeof getUserDetailsById);
console.log("updateUser:", typeof updateUser);
console.log("deleteUser:", typeof deleteUser);

// Import middleware
const authMiddleware = require("../middleware/authMiddleware");
console.log("Auth Middleware exports:", Object.keys(authMiddleware));

const { protect, admin, isAdmin } = authMiddleware;
console.log("protect:", typeof protect);
console.log("admin:", typeof admin);
console.log("isAdmin:", typeof isAdmin);

// Public Routes
router.post("/register", register);
router.post("/login", login);

// Protected Routes
router.get("/me", protect, getMe);

// Admin Routes - LINE 24 YE HAI
router.get("/all", protect, admin || isAdmin, getAllUsers);

module.exports = router;
