const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Wishlist = require("../modules/WishlistSchema");
const Product = require("../modules/ProductSchema");
const User = require("../modules/UserSchema");
const passport = require("passport");

// ==============================
// ❤️ WISHLIST ROUTES (Protected - User)
// ==============================

// 📥 GET USER WISHLIST
router.get("/", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        // Get or create wishlist for user
        let wishlist = await Wishlist.findOne({ user: req.user._id })
            .populate({
                path: "items.product",
                select: "name slug description price discountPrice images thumbnail stock averageRating totalReviews brand category"
            });

        if (!wishlist) {
            // Create new wishlist for user
            wishlist = await Wishlist.create({
                user: req.user._id,
                items: [],
                totalItems: 0
            });
        }

        // Calculate total items
        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Get user's wishlist from user model (for backward compatibility)
        const user = await User.findById(req.user._id)
            .populate({
                path: "wishlist",
                select: "name slug description price discountPrice images thumbnail stock averageRating totalReviews"
            });

        res.json({
            success: true,
            data: {
                wishlist: wishlist,
                userWishlist: user.wishlist || []
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ➕ ADD PRODUCT TO WISHLIST
router.post("/add/:productId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const productId = req.params.productId;
        const { variant, price } = req.body;

        // Check if product exists and is active
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

        // Get or create wishlist
        let wishlist = await Wishlist.findOne({ user: req.user._id });
        if (!wishlist) {
            wishlist = await Wishlist.create({
                user: req.user._id,
                items: [],
                totalItems: 0
            });
        }

        // Check if product already in wishlist
        const existingItem = wishlist.items.find(
            item => item.product.toString() === productId && 
            (item.variant || null) === (variant || null)
        );

        if (existingItem) {
            return res.status(400).json({
                success: false,
                message: "Product already in wishlist"
            });
        }

        // Add to wishlist items
        wishlist.items.push({
            product: productId,
            variant: variant || null,
            price: price || product.discountPrice || product.price,
            addedAt: new Date()
        });

        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Also add to user's wishlist (for backward compatibility)
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { wishlist: productId }
        });

        // Populate product details
        await wishlist.populate({
            path: "items.product",
            select: "name slug description price discountPrice images thumbnail stock averageRating"
        });

        res.status(201).json({
            success: true,
            message: "Product added to wishlist",
            data: wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE PRODUCT FROM WISHLIST
router.delete("/remove/:productId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const productId = req.params.productId;
        const { variant } = req.query;

        let wishlist = await Wishlist.findOne({ user: req.user._id });

        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: "Wishlist not found"
            });
        }

        // Remove item from wishlist
        wishlist.items = wishlist.items.filter(
            item => !(item.product.toString() === productId && 
                     (item.variant || null) === (variant || null))
        );

        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Also remove from user's wishlist (for backward compatibility)
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { wishlist: productId }
        });

        res.json({
            success: true,
            message: "Product removed from wishlist",
            data: wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE MULTIPLE PRODUCTS FROM WISHLIST
router.delete("/remove-multiple", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Product IDs array is required"
            });
        }

        let wishlist = await Wishlist.findOne({ user: req.user._id });

        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: "Wishlist not found"
            });
        }

        // Remove multiple items
        wishlist.items = wishlist.items.filter(
            item => !productIds.includes(item.product.toString())
        );

        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Also remove from user's wishlist
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { wishlist: { $in: productIds } }
        });

        res.json({
            success: true,
            message: `${productIds.length} products removed from wishlist`,
            data: wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🗑️ CLEAR WISHLIST
router.delete("/clear", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({ user: req.user._id });

        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: "Wishlist not found"
            });
        }

        // Clear all items
        wishlist.items = [];
        wishlist.totalItems = 0;
        await wishlist.save();

        // Also clear user's wishlist
        await User.findByIdAndUpdate(req.user._id, {
            $set: { wishlist: [] }
        });

        res.json({
            success: true,
            message: "Wishlist cleared successfully",
            data: wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 MOVE WISHLIST ITEMS TO CART
router.post("/move-to-cart", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { productIds } = req.body;

        let wishlist = await Wishlist.findOne({ user: req.user._id })
            .populate("items.product");

        if (!wishlist || wishlist.items.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Wishlist is empty"
            });
        }

        // Determine which items to move
        let itemsToMove = wishlist.items;
        if (productIds && Array.isArray(productIds) && productIds.length > 0) {
            itemsToMove = wishlist.items.filter(
                item => productIds.includes(item.product._id.toString())
            );
        }

        if (itemsToMove.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No items to move"
            });
        }

        // Move items to cart
        const Cart = require("../modules/CartSchema");
        const movedItems = [];

        for (const wishItem of itemsToMove) {
            const product = wishItem.product;
            
            // Check if product is active and has stock
            if (!product.isActive) {
                continue;
            }

            if (product.stock < 1) {
                continue; // Skip out of stock items
            }

            // Check if already in cart
            const existingCart = await Cart.findOne({
                user: req.user._id,
                product: product._id,
                variant: wishItem.variant || null
            });

            const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;

            if (existingCart) {
                // Update quantity if already in cart
                existingCart.quantity += 1;
                existingCart.totalPrice = itemPrice * existingCart.quantity;
                await existingCart.save();
                movedItems.push(existingCart);
            } else {
                // Add to cart
                const cartItem = await Cart.create({
                    product: product._id,
                    user: req.user._id,
                    variant: wishItem.variant || null,
                    quantity: 1,
                    discountPrice: product.discountPrice || 0,
                    totalPrice: itemPrice,
                    shippingCharge: product.shippingCharge || 0
                });
                movedItems.push(cartItem);
            }

            // Remove from wishlist
            wishlist.items = wishlist.items.filter(
                item => item._id.toString() !== wishItem._id.toString()
            );
        }

        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Update user's wishlist
        const productIdsRemoved = itemsToMove.map(item => item.product._id);
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { wishlist: { $in: productIdsRemoved } }
        });

        res.json({
            success: true,
            message: `${movedItems.length} items moved to cart`,
            data: {
                movedItems: movedItems,
                remainingWishlist: wishlist
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 MOVE ALL WISHLIST ITEMS TO CART
router.post("/move-all-to-cart", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        // Reuse the move-to-cart logic with all items
        req.body.productIds = [];
        return router.handle(req, res, () => {});
        // Note: This is a simplified approach. In production, you'd refactor the logic.

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 CHECK IF PRODUCT IS IN WISHLIST
router.get("/check/:productId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const productId = req.params.productId;
        const { variant } = req.query;

        const wishlist = await Wishlist.findOne({ user: req.user._id });

        if (!wishlist) {
            return res.json({
                success: true,
                data: {
                    inWishlist: false,
                    message: "Wishlist is empty"
                }
            });
        }

        const exists = wishlist.items.some(
            item => item.product.toString() === productId && 
                    (item.variant || null) === (variant || null)
        );

        res.json({
            success: true,
            data: {
                inWishlist: exists,
                productId: productId,
                variant: variant || null
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET WISHLIST STATISTICS
router.get("/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user._id })
            .populate({
                path: "items.product",
                select: "name price discountPrice stock averageRating"
            });

        if (!wishlist || wishlist.items.length === 0) {
            return res.json({
                success: true,
                data: {
                    totalItems: 0,
                    totalValue: 0,
                    averagePrice: 0,
                    outOfStock: 0,
                    bestRated: null,
                    mostExpensive: null
                }
            });
        }

        // Calculate statistics
        let totalValue = 0;
        let outOfStock = 0;
        let bestRated = null;
        let mostExpensive = null;
        let bestRating = 0;
        let highestPrice = 0;

        wishlist.items.forEach(item => {
            const product = item.product;
            const price = item.price || product.discountPrice || product.price;
            
            totalValue += price;

            if (product.stock === 0) {
                outOfStock++;
            }

            if (product.averageRating > bestRating) {
                bestRating = product.averageRating;
                bestRated = product;
            }

            if (price > highestPrice) {
                highestPrice = price;
                mostExpensive = product;
            }
        });

        const averagePrice = wishlist.items.length > 0 
            ? totalValue / wishlist.items.length 
            : 0;

        res.json({
            success: true,
            data: {
                totalItems: wishlist.items.length,
                totalValue,
                averagePrice,
                outOfStock,
                bestRated,
                mostExpensive,
                items: wishlist.items
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
// 👑 ADMIN WISHLIST ROUTES
// ==============================

// 📥 GET ALL WISHLISTS (Admin Only)
router.get("/admin/all", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { page = 1, limit = 20, search, sort = "-createdAt" } = req.query;
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

        const wishlists = await Wishlist.find(filter)
            .populate("user", "name email")
            .populate({
                path: "items.product",
                select: "name price discountPrice images"
            })
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Wishlist.countDocuments(filter);

        // Calculate summary for each wishlist
        const wishlistData = wishlists.map(wishlist => {
            const totalValue = wishlist.items.reduce((sum, item) => {
                const price = item.price || item.product?.discountPrice || item.product?.price || 0;
                return sum + price;
            }, 0);

            return {
                ...wishlist.toObject(),
                totalValue,
                averagePrice: wishlist.items.length > 0 ? totalValue / wishlist.items.length : 0
            };
        });

        res.json({
            success: true,
            data: wishlistData,
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

// 📥 GET USER WISHLIST (Admin Only)
router.get("/admin/users/:userId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const wishlist = await Wishlist.findOne({ user: req.params.userId })
            .populate("user", "name email")
            .populate({
                path: "items.product",
                select: "name slug description price discountPrice images thumbnail stock averageRating totalReviews"
            });

        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: "Wishlist not found for this user"
            });
        }

        // Calculate total value
        const totalValue = wishlist.items.reduce((sum, item) => {
            const price = item.price || item.product?.discountPrice || item.product?.price || 0;
            return sum + price;
        }, 0);

        res.json({
            success: true,
            data: {
                ...wishlist.toObject(),
                totalValue,
                averagePrice: wishlist.items.length > 0 ? totalValue / wishlist.items.length : 0
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE PRODUCT FROM USER WISHLIST (Admin Only)
router.delete("/admin/users/:userId/remove/:productId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { userId, productId } = req.params;

        const wishlist = await Wishlist.findOne({ user: userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: "Wishlist not found for this user"
            });
        }

        // Remove item
        wishlist.items = wishlist.items.filter(
            item => item.product.toString() !== productId
        );
        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Also remove from user's wishlist
        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: productId }
        });

        res.json({
            success: true,
            message: "Product removed from user's wishlist",
            data: wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET WISHLIST STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalWishlists = await Wishlist.countDocuments();
        const totalItems = await Wishlist.aggregate([
            { $group: { _id: null, total: { $sum: "$totalItems" } } }
        ]);

        // Most wished products
        const mostWished = await Wishlist.aggregate([
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.product",
                    count: { $sum: 1 }
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
                    count: 1
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Users with most wishlist items
        const topUsers = await Wishlist.aggregate([
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user"
                }
            },
            {
                $project: {
                    user: { $arrayElemAt: ["$user", 0] },
                    totalItems: 1,
                    itemCount: { $size: "$items" }
                }
            },
            {
                $sort: { itemCount: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Average wishlist size
        const avgSize = await Wishlist.aggregate([
            {
                $group: {
                    _id: null,
                    avgSize: { $avg: "$totalItems" },
                    maxSize: { $max: "$totalItems" },
                    minSize: { $min: "$totalItems" }
                }
            }
        ]);

        // Category distribution in wishlists
        const categoryDistribution = await Wishlist.aggregate([
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.product",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.category",
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $project: {
                    categoryName: { $arrayElemAt: ["$category.name", 0] },
                    count: 1
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalWishlists,
                totalItems: totalItems.length > 0 ? totalItems[0].total : 0,
                mostWished,
                topUsers,
                avgWishlistSize: avgSize.length > 0 ? avgSize[0] : {
                    avgSize: 0,
                    maxSize: 0,
                    minSize: 0
                },
                categoryDistribution
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 EXPORT WISHLIST DATA (Admin Only)
router.get("/admin/export/csv", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const wishlists = await Wishlist.find()
            .populate("user", "name email")
            .populate({
                path: "items.product",
                select: "name price"
            });

        // Create CSV header
        let csv = "User Email,User Name,Product Name,Price,Added Date\n";

        // Add data rows
        wishlists.forEach(wishlist => {
            wishlist.items.forEach(item => {
                const product = item.product;
                csv += `"${wishlist.user.email}","${wishlist.user.name}","${product ? product.name : 'Deleted Product'}",${item.price || 0},"${item.addedAt.toISOString()}"\n`;
            });
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=wishlists-${new Date().toISOString().split("T")[0]}.csv`);
        res.send(csv);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🔄 SYNC WISHLIST (For multi-device support)
// ==============================

router.post("/sync", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { items } = req.body; // Array of {productId, variant, price}

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                message: "Items array is required"
            });
        }

        // Get or create wishlist
        let wishlist = await Wishlist.findOne({ user: req.user._id });
        if (!wishlist) {
            wishlist = await Wishlist.create({
                user: req.user._id,
                items: [],
                totalItems: 0
            });
        }

        // Clear existing items
        wishlist.items = [];
        const productIds = [];

        // Add new items
        for (const item of items) {
            const product = await Product.findOne({ 
                _id: item.productId,
                isActive: true 
            });

            if (!product) {
                continue; // Skip invalid products
            }

            wishlist.items.push({
                product: product._id,
                variant: item.variant || null,
                price: item.price || product.discountPrice || product.price,
                addedAt: new Date()
            });

            productIds.push(product._id);
        }

        wishlist.totalItems = wishlist.items.length;
        await wishlist.save();

        // Update user's wishlist
        await User.findByIdAndUpdate(req.user._id, {
            $set: { wishlist: productIds }
        });

        await wishlist.populate({
            path: "items.product",
            select: "name slug description price discountPrice images thumbnail"
        });

        res.json({
            success: true,
            message: `Wishlist synced. ${wishlist.items.length} items added`,
            data: wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;