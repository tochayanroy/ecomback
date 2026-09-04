const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({

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
    lowercase: true,
    index: true
  },

  description: {
    type: String,
    default: ""
  },

  // 🖼️ Media
  image: {
    type: String,
    default: null
  },

  icon: {
    type: String,
    default: null
  },

  // 🚀 Status
  isActive: {
    type: Boolean,
    default: true
  },

  // 📦 Product Count (optional cache)
  productCount: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true // createdAt, updatedAt
});

module.exports = mongoose.model("Category", categorySchema);