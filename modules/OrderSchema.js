const mongoose = require("mongoose");


// 📦 Order Item Schema
const orderSchema = new mongoose.Schema({

	// 🔗 Product Reference
	product: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Product",
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
		min: 1
	},

	// 💰 Price Snapshot
	price: {
		type: Number,
		required: true,
		min: 0
	},

	discountPrice: {
		type: Number,
		default: 0
	},

	// 💵 Total per item
	totalPrice: {
		type: Number,
		required: true,
		min: 0
	},

	// 🔢 Order ID (custom readable ID)
	orderId: {
		type: String,
		required: true,
		unique: true
	},

	// 👤 User
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true
	},

	shippingCharge: {
		type: Number,
		default: 0
	},

	// 🎟️ Coupon
	coupon: {
		code: { type: String, default: null },
		discountAmount: { type: Number, default: 0 }
	},

	// 💳 Payment Info
	payment: {
		method: {
			type: String,
			enum: ["COD", "ONLINE", "UPI", "CARD"],
			required: true
		},

		status: {
			type: String,
			enum: ["pending", "paid", "failed", "refunded"],
			default: "pending"
		},

		transactionId: {
			type: String,
			default: null
		},

		paidAt: {
			type: Date,
			default: null
		}
	},

	// 🚚 Shipping Address Snapshot
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

	// 🚚 Shipping Info
	shipping: {
		method: {
			type: String,
			default: "standard"
		},

		trackingNumber: {
			type: String,
			default: null
		},

		carrier: {
			type: String,
			default: null
		},

		shippedAt: {
			type: Date,
			default: null
		},

		deliveredAt: {
			type: Date,
			default: null
		}
	},

	// 📦 Order Status
	status: {
		type: String,
		enum: [
			"pending",
			"confirmed",
			"processing",
			"shipped",
			"delivered",
			"cancelled",
			"returned"
		],
		default: "pending"
	},

	// 🔄 Refund / Return
	refund: {
		status: {
			type: String,
			enum: ["none", "requested", "approved", "rejected", "completed"],
			default: "none"
		},

		amount: {
			type: Number,
			default: 0
		},

		reason: {
			type: String,
			default: ""
		}
	},

	// 📊 Metadata
	notes: {
		type: String,
		default: ""
	},

	isPaid: {
		type: Boolean,
		default: false
	},

	isDelivered: {
		type: Boolean,
		default: false
	}

}, {
	timestamps: true // createdAt, updatedAt
});

module.exports = mongoose.model("Order", orderSchema);