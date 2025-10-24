const express = require("express");
const router = express.Router();
const {
  createBlogPost,
  getBlogPosts,
  getBlogPostBySlug,
} = require("../controllers/blogController");
const { protect, isAdmin } = require("../middleware/authMiddleware");

router.route("/").get(getBlogPosts).post(protect,createBlogPost);

router.route("/:slug").get(getBlogPostBySlug);

module.exports = router;
