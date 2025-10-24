const express = require("express");
const router = express.Router();
const {
  getUserDashboardStats,
} = require("../controllers/userDashboardController");
const { protect } = require("../middleware/authMiddleware");
router.route("/stats").get(protect, getUserDashboardStats);
module.exports = router;
