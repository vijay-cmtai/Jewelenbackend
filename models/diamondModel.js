const mongoose = require("mongoose");
const { Schema } = mongoose;

const jewelrySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Jewelry ka naam zaroori hai."],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU zaroori hai."],
      unique: true,
    },
    description: {
      type: String,
      required: [true, "Description zaroori hai."],
    },
    price: {
      type: Number,
      required: [true, "Price zaroori hai."],
    },
    originalPrice: {
      type: Number,
      required: false,
    },
    tax: {
      type: Number,
      required: false,
      default: 0,
    },
    images: [
      {
        type: String,
        required: true,
      },
    ],
    stockQuantity: {
      type: Number,
      required: [true, "Stock ki quantity batayein."],
      default: 1,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Rings",
        "New Arrivals",
        "Necklaces",
        "Earrings",
        "Bracelets",
        "Gifts",
      ],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending", 
    },
    // -----------------------------------------------------------------
    metal: {
      type: {
        type: String,
        enum: ["Gold", "Silver", "Platinum"],
        required: true,
      },
      purity: {
        type: String,
        required: true,
      },
      color: {
        type: String,
      },
      weightInGrams: {
        type: Number,
        required: true,
      },
    },
    gemstones: [
      {
        type: {
          type: String,
          required: true,
        },
        shape: String,
        carat: Number,
        color: String,
        clarity: String,
        cut: String,
      },
    ],
    dimensions: {
      ringSize: String,
      lengthInCm: Number,
      widthInMm: Number,
    },
    tags: [String],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

jewelrySchema.index({ name: "text", description: "text", tags: "text" });
jewelrySchema.index({ category: 1 });
jewelrySchema.index({ price: 1 });

const Jewelry = mongoose.model("Jewelry", jewelrySchema);

module.exports = Jewelry;
