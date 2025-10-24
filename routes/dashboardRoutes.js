const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/dashboardController");
const { protect, isAdmin } = require("../middleware/authMiddleware");

router.route("/stats").get(protect, isAdmin, getDashboardStats);

module.exports = router;
