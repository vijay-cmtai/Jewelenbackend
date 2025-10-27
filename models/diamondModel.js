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
    // --- YEH NAYA FIELD ADD KIYA GAYA HAI ---
    tax: {
      type: Number,
      required: false, // Yeh zaroori nahi hai
      default: 0, // Agar tax nahi diya to 0% maan lo
    },
    // ------------------------------------
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
