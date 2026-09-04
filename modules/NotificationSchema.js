const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({

  // 👤 Receiver (User who gets notification)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  // 👤 Sender (optional - system/admin/user)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  // 🔔 Notification Type
  type: {
    type: String,
    enum: [
      "order",
      "payment",
      "shipping",
      "promotion",
      "system",
      "review",
      "security"
    ],
    required: true
  },

  // 📂 Category (for filtering)
  category: {
    type: String,
    default: "general"
  },

  // 📝 Content
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },

  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },

  // 🔗 Action (deep link)
  actionUrl: {
    type: String,
    default: null
  },

  // 🖼️ Image/Icon
  image: {
    type: String,
    default: null
  },

  // 📊 Read Status
  isRead: {
    type: Boolean,
    default: false
  },

  readAt: {
    type: Date,
    default: null
  },

  // 🔥 Priority (for sorting)
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "low"
  },

  // ⏳ Expiry (auto cleanup system)
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // createdAt, updatedAt
});

module.exports = mongoose.model("Notification", notificationSchema);