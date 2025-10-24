const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["Admin", "Buyer", "Supplier"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    // ✅ UPDATED: Cart with quantity support using Mixed type
    cart: {
      type: Schema.Types.Mixed,
      default: [],
    },
    // ✅ Wishlist remains simple array
    wishlist: [
      {
        type: Schema.Types.ObjectId,
        ref: "Jewelry",
      },
    ],
    companyName: { type: String },
    businessType: { type: String },
    companyCountry: { type: String },
    companyWebsite: { type: String },
    businessDocument: {
      public_id: { type: String },
      url: { type: String },
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model("User", userSchema);
