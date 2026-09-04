const mongoose = require('mongoose');



const userSchema = new mongoose.Schema({
  // 🔑 Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  password: {
    type: String,
    required: true,
    minlength: 6
  },

  phone: {
    type: String,
    required: true,
    unique: true
  },

  avatar: {
    type: String,
    default: null
  },

  // 🛡️ Role & Access
  role: {
    type: String,
    enum: ["user", "admin", "vendor"],
    default: "user"
  },


  // 📍 Addresses (Multiple)
  addresses: [
    {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, default: "India" },
      
    }
  ],

  // 🛒 Cart Reference
  cart: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cart",
    default: null
  },

  // ❤️ Wishlist
  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    }

  ],

  // 📦 Orders
  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    }
  ],

  // 🔐 Authentication / Security
  refreshToken: {
    type: String,
    default: null
  },

  resetPasswordToken: {
    type: String,
    default: null
  },

  resetPasswordExpire: {
    type: Date,
    default: null
  },

  // ⭐ Reviews (user wrote)
  reviews: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review"
    }
  ],

  // 🔔 Notifications
  notifications: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification"
    }
  ]

}, {
  timestamps: true
});

module.exports = mongoose.model("User", userSchema);