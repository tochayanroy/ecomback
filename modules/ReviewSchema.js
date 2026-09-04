const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({

  // 🔗 Product Reference
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    index: true
  },

  // 👤 User Reference
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // ⭐ Rating (1 - 5)
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },

  // 📝 Review Title
  title: {
    type: String,
    default: "",
    trim: true,
    maxlength: 100
  },

  // 📄 Review Content
  comment: {
    type: String,
    default: "",
    trim: true,
    maxlength: 1000
  },

  // 🖼️ Review Images (optional)
  images: [
    {
      type: String
    }
  ],

  // 👍 Helpful Votes
  helpfulCount: {
    type: Number,
    default: 0
  },

  // 👎 Not Helpful Votes
  notHelpfulCount: {
    type: Number,
    default: 0
  },

  // 🚀 Status (Moderation System)
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  // 🛡️ Admin Moderation
  isEdited: {
    type: Boolean,
    default: false
  },

  editedAt: {
    type: Date,
    default: null
  },

  // 🔁 Replies (Optional - for Q&A or comments)
  replies: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      message: {
        type: String,
        default: ""
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ]

}, {
  timestamps: true // createdAt, updatedAt
});

module.exports = mongoose.model("Review", reviewSchema);