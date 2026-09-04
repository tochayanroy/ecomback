const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({

	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		unique: true
	},

	items: [
		{
			product: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Product",
				required: true
			},

			variant: {
				type: String,
				default: null
			},

			price: {
				type: Number,
				default: 0
			},

			addedAt: {
				type: Date,
				default: Date.now
			}
		}
	],

	totalItems: {
		type: Number,
		default: 0
	}

}, {
	timestamps: true
});

module.exports = mongoose.model("Wishlist", wishlistSchema);