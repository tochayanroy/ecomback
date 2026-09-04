const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({

  // 🔗 Product Reference
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // 🎨 Variant (size, color etc.)
  variant: {
    type: String,
    default: null
  },

  // 🔢 Quantity
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },

  // 💸 Discount Price
  discountPrice: {
    type: Number,
    default: 0
  },

  // 💵 Total Price per item
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
 shippingCharge: {
    type: Number,
    default: 0
  },
  coupon: {
    code: {
      type: String,
      default: null
    },
    discountAmount: {
      type: Number,
      default: 0
    }
  },

}, {
  timestamps: true
});


module.exports = mongoose.model("Cart", cartSchema);