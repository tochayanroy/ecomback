const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({

  // 🔑 Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  description: {
    type: String,
    required: true
  },

  brand: {
    type: String,
    default: null
  },

  // 🏷️ Category
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
  },


  // 💰 Pricing
  price: {
    type: Number,
    required: true,
    min: 0
  },

  discountPrice: {
    type: Number,
    default: 0
  },

  costPrice: {
    type: Number,
    default: 0
  },

  // 📦 Inventory
  stock: {
    type: Number,
    default: 0,
    min: 0
  },

  // 🖼️ Images
   images: [
    {
      url: { type: String, required: true },
      altText: { type: String, default: "" }
    }
  ],

  thumbnail: {
    type: String,
    default: null
  },

  // 🎨 Variants (size, color, etc.)
  variants: [
    {
      name: { type: String }, // e.g. Size, Color
      value: { type: String }, // e.g. M, Red
      price: { type: Number, default: 0 },
      stock: { type: Number, default: 0 },
      sku: { type: String }
    }
  ],

  // ⚙️ Attributes (dynamic fields)
  attributes: [
    {
      name: { type: String }, // e.g. RAM, Weight
      value: { type: String }
    }
  ],

  // ⭐ Ratings & Reviews
  averageRating: {
    type: Number,
    default: 0
  },

  totalReviews: {
    type: Number,
    default: 0
  },

  reviews: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review"
    }
  ],

  // 🚀 Status
  isActive: {
    type: Boolean,
    default: true
  },

  isFeatured: {
    type: Boolean,
    default: false
  },

  isDigital: {
    type: Boolean,
    default: false
  },

  // 🚚 Shipping
  weight: {
    type: Number,
    default: 0
  },

  dimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },

  shippingCharge: {
    type: Number,
    default: 0
  },

  soldCount: {
    type: Number,
    default: 0
  },

}, {
  timestamps: true,
});

module.exports = mongoose.model("Product", productSchema);