// File: routes/supplierRoutes.js

const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware.js");
const { getDashboardStats } = require("../controllers/supplierController.js");
router.route("/dashboard").get(protect, getDashboardStats);

module.exports = router;
