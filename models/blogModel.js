const mongoose = require("mongoose");
const { Schema } = mongoose;

const createSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, ""); 
};

const blogSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Blog ka title zaroori hai."],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
    },
    excerpt: {
      type: String,
      required: [true, "Excerpt (short summary) zaroori hai."],
    },
    content: {
      type: String,
      required: [true, "Blog ka poora content zaroori hai."],
    },
    featuredImage: {
      type: String,
      required: [true, "Featured image ka URL zaroori hai."],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    readTime: {
      type: String,
      required: [true, "Read time zaroori hai (e.g., '5 min read')."],
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User", // Assuming you have a User model
      required: true,
    },
  },
  { timestamps: true }
);

blogSchema.pre("save", function (next) {
  if (this.isModified("title")) {
    this.slug = createSlug(this.title);
  }
  next();
});

const Blog = mongoose.model("Blog", blogSchema);

module.exports = Blog;
