const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Cart = require("../modules/CartSchema");
const Product = require("../modules/ProductSchema");
const User = require("../modules/UserSchema");
const passport = require("passport");

// ==============================
// 🛒 CART ROUTES (Protected - User)
// ==============================

// 📥 GET USER CART
router.get("/", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const cartItems = await Cart.find({ user: req.user._id })
            .populate({
                path: "product",
                select: "name slug description price discountPrice images thumbnail stock shippingCharge brand"
            })
            .sort({ createdAt: -1 });

        // Calculate cart totals
        let subtotal = 0;
        let totalDiscount = 0;
        let totalShipping = 0;
        let totalItems = 0;

        cartItems.forEach(item => {
            const itemPrice = item.product.discountPrice > 0 ? item.product.discountPrice : item.product.price;
            subtotal += itemPrice * item.quantity;
            totalDiscount += (item.product.price - itemPrice) * item.quantity;
            totalShipping += (item.product.shippingCharge || 0) * item.quantity;
            totalItems += item.quantity;
        });

        const total = subtotal + totalShipping;

        res.json({
            success: true,
            data: {
                items: cartItems,
                summary: {
                    totalItems,
                    subtotal,
                    totalDiscount,
                    totalShipping,
                    total,
                    savings: totalDiscount > 0 ? totalDiscount : 0
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ➕ ADD ITEM TO CART
router.post("/add", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { productId, quantity = 1, variant } = req.body;

        // Validation
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1"
            });
        }

        // Check product exists and is active
        const product = await Product.findOne({ 
            _id: productId,
            isActive: true 
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found or inactive"
            });
        }

        // Check stock availability
        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Not enough stock. Available: ${product.stock}`
            });
        }

        // Check if product already in cart with same variant
        const existingCartItem = await Cart.findOne({
            user: req.user._id,
            product: productId,
            variant: variant || null
        });

        if (existingCartItem) {
            // Update quantity
            const newQuantity = existingCartItem.quantity + quantity;
            
            // Check stock for new quantity
            if (product.stock < newQuantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock. Available: ${product.stock}`
                });
            }

            existingCartItem.quantity = newQuantity;
            existingCartItem.totalPrice = (product.discountPrice > 0 ? product.discountPrice : product.price) * newQuantity;
            await existingCartItem.save();

            return res.json({
                success: true,
                message: "Cart item quantity updated",
                data: existingCartItem
            });
        }

        // Calculate price
        const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
        const totalPrice = itemPrice * quantity;

        // Create new cart item
        const cartItem = await Cart.create({
            product: productId,
            user: req.user._id,
            variant: variant || null,
            quantity,
            discountPrice: product.discountPrice || 0,
            totalPrice,
            shippingCharge: product.shippingCharge || 0
        });

        // Populate product details
        await cartItem.populate("product");

        res.status(201).json({
            success: true,
            message: "Item added to cart",
            data: cartItem
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE CART ITEM QUANTITY
router.put("/update/:itemId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { quantity } = req.body;
        const itemId = req.params.itemId;

        if (!quantity || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Valid quantity is required (minimum 1)"
            });
        }

        // Find cart item
        const cartItem = await Cart.findOne({
            _id: itemId,
            user: req.user._id
        }).populate("product");

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found"
            });
        }

        // Check stock availability
        if (cartItem.product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Not enough stock. Available: ${cartItem.product.stock}`
            });
        }

        // Update quantity and price
        cartItem.quantity = quantity;
        const itemPrice = cartItem.product.discountPrice > 0 
            ? cartItem.product.discountPrice 
            : cartItem.product.price;
        cartItem.totalPrice = itemPrice * quantity;

        await cartItem.save();

        res.json({
            success: true,
            message: "Cart item updated",
            data: cartItem
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE ITEM FROM CART
router.delete("/remove/:itemId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const cartItem = await Cart.findOneAndDelete({
            _id: req.params.itemId,
            user: req.user._id
        });

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found"
            });
        }

        res.json({
            success: true,
            message: "Item removed from cart",
            data: cartItem
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🗑️ CLEAR CART
router.delete("/clear", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const result = await Cart.deleteMany({ user: req.user._id });

        res.json({
            success: true,
            message: `Cart cleared. ${result.deletedCount} items removed`
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 APPLY COUPON TO CART
router.post("/apply-coupon", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { couponCode } = req.body;

        if (!couponCode) {
            return res.status(400).json({
                success: false,
                message: "Coupon code is required"
            });
        }

        // TODO: Implement actual coupon validation
        // This is a placeholder for coupon logic
        const validCoupon = await validateCoupon(couponCode);

        if (!validCoupon) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired coupon code"
            });
        }

        // Apply coupon to all cart items (or specific ones)
        const cartItems = await Cart.find({ user: req.user._id });
        
        // Update cart items with coupon info
        for (const item of cartItems) {
            item.coupon = {
                code: couponCode,
                discountAmount: validCoupon.discountAmount || 0
            };
            await item.save();
        }

        res.json({
            success: true,
            message: "Coupon applied successfully",
            data: {
                coupon: couponCode,
                discount: validCoupon.discountAmount || 0
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE COUPON FROM CART
router.delete("/remove-coupon", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const cartItems = await Cart.find({ user: req.user._id });
        
        for (const item of cartItems) {
            item.coupon = {
                code: null,
                discountAmount: 0
            };
            await item.save();
        }

        res.json({
            success: true,
            message: "Coupon removed successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET CART SUMMARY
router.get("/summary", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const cartItems = await Cart.find({ user: req.user._id })
            .populate("product", "name price discountPrice stock shippingCharge");

        let totalItems = 0;
        let subtotal = 0;
        let totalDiscount = 0;
        let totalShipping = 0;
        let couponDiscount = 0;

        cartItems.forEach(item => {
            const itemPrice = item.product.discountPrice > 0 
                ? item.product.discountPrice 
                : item.product.price;
            
            totalItems += item.quantity;
            subtotal += itemPrice * item.quantity;
            totalDiscount += (item.product.price - itemPrice) * item.quantity;
            totalShipping += (item.product.shippingCharge || 0) * item.quantity;
            
            if (item.coupon && item.coupon.discountAmount) {
                couponDiscount += item.coupon.discountAmount;
            }
        });

        const total = subtotal + totalShipping - couponDiscount;

        res.json({
            success: true,
            data: {
                totalItems,
                subtotal,
                totalDiscount,
                totalShipping,
                couponDiscount,
                total,
                savings: totalDiscount + couponDiscount
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 SYNC CART (For multi-device support)
router.post("/sync", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { items } = req.body; // Array of {productId, quantity, variant}

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                message: "Items array is required"
            });
        }

        // Clear existing cart
        await Cart.deleteMany({ user: req.user._id });

        // Add new items
        const addedItems = [];
        for (const item of items) {
            const product = await Product.findOne({ 
                _id: item.productId,
                isActive: true 
            });

            if (!product) {
                continue; // Skip invalid products
            }

            if (product.stock < (item.quantity || 1)) {
                continue; // Skip if not enough stock
            }

            const quantity = item.quantity || 1;
            const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
            const totalPrice = itemPrice * quantity;

            const cartItem = await Cart.create({
                product: product._id,
                user: req.user._id,
                variant: item.variant || null,
                quantity,
                discountPrice: product.discountPrice || 0,
                totalPrice,
                shippingCharge: product.shippingCharge || 0
            });

            addedItems.push(cartItem);
        }

        res.json({
            success: true,
            message: `Cart synced. ${addedItems.length} items added`,
            data: addedItems
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 👑 ADMIN CART ROUTES
// ==============================

// 📥 GET ALL USER CARTS (Admin Only)
router.get("/admin/all", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { page = 1, limit = 20, search } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        let filter = {};
        if (search) {
            // Find users matching search
            const users = await User.find({
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            }).select("_id");

            const userIds = users.map(u => u._id);
            filter.user = { $in: userIds };
        }

        const cartItems = await Cart.find(filter)
            .populate("product", "name price discountPrice images")
            .populate("user", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const total = await Cart.countDocuments(filter);

        // Group by user
        const groupedCarts = {};
        cartItems.forEach(item => {
            const userId = item.user._id.toString();
            if (!groupedCarts[userId]) {
                groupedCarts[userId] = {
                    user: item.user,
                    items: [],
                    totalItems: 0,
                    totalPrice: 0
                };
            }
            groupedCarts[userId].items.push(item);
            groupedCarts[userId].totalItems += item.quantity;
            groupedCarts[userId].totalPrice += item.totalPrice;
        });

        res.json({
            success: true,
            data: Object.values(groupedCarts),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET USER CART (Admin Only)
router.get("/admin/users/:userId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const cartItems = await Cart.find({ user: req.params.userId })
            .populate("product", "name price discountPrice images stock shippingCharge");

        // Calculate totals
        let subtotal = 0;
        let totalItems = 0;
        cartItems.forEach(item => {
            const itemPrice = item.product.discountPrice > 0 
                ? item.product.discountPrice 
                : item.product.price;
            subtotal += itemPrice * item.quantity;
            totalItems += item.quantity;
        });

        res.json({
            success: true,
            data: {
                items: cartItems,
                summary: {
                    totalItems,
                    subtotal,
                    total: subtotal
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🗑️ CLEAR USER CART (Admin Only)
router.delete("/admin/users/:userId/clear", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const result = await Cart.deleteMany({ user: req.params.userId });

        res.json({
            success: true,
            message: `Cart cleared. ${result.deletedCount} items removed`
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET CART STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalCarts = await Cart.distinct("user").countDocuments();
        const totalItems = await Cart.countDocuments();
        const totalQuantity = await Cart.aggregate([
            { $group: { _id: null, total: { $sum: "$quantity" } } }
        ]);

        // Most popular products in carts
        const popularProducts = await Cart.aggregate([
            {
                $group: {
                    _id: "$product",
                    count: { $sum: 1 },
                    totalQuantity: { $sum: "$quantity" }
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "product"
                }
            },
            {
                $project: {
                    product: { $arrayElemAt: ["$product", 0] },
                    count: 1,
                    totalQuantity: 1
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Cart value distribution
        const cartValues = await Cart.aggregate([
            {
                $group: {
                    _id: "$user",
                    totalValue: { $sum: "$totalPrice" },
                    itemCount: { $sum: "$quantity" }
                }
            },
            {
                $group: {
                    _id: null,
                    avgCartValue: { $avg: "$totalValue" },
                    maxCartValue: { $max: "$totalValue" },
                    minCartValue: { $min: "$totalValue" },
                    avgItems: { $avg: "$itemCount" }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalCarts,
                totalItems,
                totalQuantity: totalQuantity.length > 0 ? totalQuantity[0].total : 0,
                popularProducts,
                cartValueStats: cartValues.length > 0 ? cartValues[0] : {
                    avgCartValue: 0,
                    maxCartValue: 0,
                    minCartValue: 0,
                    avgItems: 0
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🔄 BULK OPERATIONS (Admin Only)
// ==============================

// 🔄 BULK UPDATE PRICES IN CARTS (Admin Only)
router.put("/admin/bulk/update-prices", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { productId, newPrice } = req.body;

        if (!productId || !newPrice) {
            return res.status(400).json({
                success: false,
                message: "Product ID and new price are required"
            });
        }

        // Find all cart items with this product
        const cartItems = await Cart.find({ product: productId })
            .populate("product");

        let updatedCount = 0;
        for (const item of cartItems) {
            const itemPrice = item.product.discountPrice > 0 
                ? item.product.discountPrice 
                : item.product.price;
            
            item.totalPrice = itemPrice * item.quantity;
            await item.save();
            updatedCount++;
        }

        res.json({
            success: true,
            message: `Updated prices for ${updatedCount} cart items`
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🛡️ HELPERS (Placeholder functions)
// ==============================

// Placeholder for coupon validation
async function validateCoupon(couponCode) {
    // Implement actual coupon validation logic here
    // This is just a placeholder
    const validCoupons = {
        "SAVE10": { discountAmount: 10, type: "percentage" },
        "SAVE20": { discountAmount: 20, type: "percentage" },
        "SAVE50": { discountAmount: 50, type: "percentage" },
        "FREESHIP": { discountAmount: 0, type: "shipping" }
    };

    if (validCoupons[couponCode]) {
        return validCoupons[couponCode];
    }

    return null;
}

module.exports = router;