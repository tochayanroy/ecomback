const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({

  // 🔗 Order Reference
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true
  },

  // 👤 User Reference
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // 💰 Payment Amount
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // 💳 Payment Method
  method: {
    type: String,
    enum: ["COD", "CARD", "UPI", "NETBANKING", "WALLET"],
    required: true
  },

  // 🏦 Payment Provider (Gateway)
  provider: {
    type: String,
    enum: ["RAZORPAY", "STRIPE", "PAYPAL", "NONE"],
    default: "NONE"
  },

  // 🔢 Transaction Details
  transactionId: {
    type: String,
    default: null
  },

  paymentIntentId: {
    type: String,
    default: null
  },

  invoiceId: {
    type: String,
    default: null
  },

  // 📊 Payment Status
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "success",
      "failed",
      "cancelled",
      "refunded"
    ],
    default: "pending"
  },

  // ⏱️ Payment Time
  paidAt: {
    type: Date,
    default: null
  },

  // 🔄 Refund Details
  refund: {
    refundId: {
      type: String,
      default: null
    },
    amount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ["none", "pending", "processed", "failed"],
      default: "none"
    },
    refundedAt: {
      type: Date,
      default: null
    }
  },

  // 🔐 Security / Verification
  isVerified: {
    type: Boolean,
    default: false
  },

  signature: {
    type: String,
    default: null
  },

  // 📦 Metadata (gateway response)
  gatewayResponse: {
    type: Object,
    default: {}
  },

  // 📊 Failure Reason
  failureReason: {
    type: String,
    default: null
  },

  // 🌍 Metadata
  notes: {
    type: String,
    default: ""
  }

}, {
  timestamps: true // createdAt, updatedAt
});

module.exports = mongoose.model("Payment", paymentSchema);