const Blog = require("../models/blogModel");
const asyncHandler = require("express-async-handler");

const createBlogPost = asyncHandler(async (req, res) => {
  const { title, excerpt, content, featuredImage, tags, readTime } = req.body;

  if (!title || !excerpt || !content || !featuredImage || !readTime) {
    res.status(400);
    throw new Error("Saari zaroori fields bharein");
  }

  const blog = new Blog({
    title,
    excerpt,
    content,
    featuredImage,
    tags,
    readTime,
    author: req.user._id,
  });

  const createdBlog = await blog.save();
  res.status(201).json(createdBlog);
});

const getBlogPosts = asyncHandler(async (req, res) => {
  const posts = await Blog.find({}).sort({ createdAt: -1 });
  res.json(posts);
});

const getBlogPostBySlug = asyncHandler(async (req, res) => {
  const post = await Blog.findOne({ slug: req.params.slug });

  if (post) {
    res.json(post);
  } else {
    res.status(404);
    throw new Error("Blog post not found");
  }
});

module.exports = { createBlogPost, getBlogPosts, getBlogPostBySlug };
