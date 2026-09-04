const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Review = require("../modules/ReviewSchema");
const Product = require("../modules/ProductSchema");
const User = require("../modules/UserSchema");
const Order = require("../modules/OrderSchema");
const passport = require("passport");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==============================
// 📁 FILE UPLOAD CONFIGURATION
// ==============================

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../uploads/reviews");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for review images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "review-" + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error("Only image files are allowed"));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: fileFilter
});

// ==============================
// ⭐ REVIEW ROUTES (Protected - User)
// ==============================

// 📥 GET PRODUCT REVIEWS (Public)
router.get("/product/:productId", async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            rating,
            sort = "-createdAt"
        } = req.query;

        const productId = req.params.productId;

        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const filter = { 
            product: productId,
            status: "approved"
        };
        if (rating) filter.rating = parseInt(rating);

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const reviews = await Review.find(filter)
            .populate("user", "name avatar")
            .populate({
                path: "replies.user",
                select: "name avatar role"
            })
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Review.countDocuments(filter);

        // Get rating distribution
        const ratingDistribution = await Review.aggregate([
            {
                $match: { 
                    product: new mongoose.Types.ObjectId(productId),
                    status: "approved"
                }
            },
            {
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: -1 }
            }
        ]);

        res.json({
            success: true,
            data: reviews,
            ratingDistribution,
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

// 📊 GET PRODUCT REVIEW SUMMARY (Public)
router.get("/product/:productId/summary", async (req, res) => {
    try {
        const productId = req.params.productId;

        const product = await Product.findById(productId)
            .select("averageRating totalReviews");

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Get rating distribution
        const distribution = await Review.aggregate([
            {
                $match: { 
                    product: new mongoose.Types.ObjectId(productId),
                    status: "approved"
                }
            },
            {
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: -1 }
            }
        ]);

        // Create full distribution (1-5 stars)
        const fullDistribution = {};
        for (let i = 5; i >= 1; i--) {
            const found = distribution.find(d => d._id === i);
            fullDistribution[i] = found ? found.count : 0;
        }

        // Calculate percentages
        const totalReviews = product.totalReviews || 0;
        const percentageDistribution = {};
        for (let i = 5; i >= 1; i--) {
            percentageDistribution[i] = totalReviews > 0 
                ? ((fullDistribution[i] / totalReviews) * 100).toFixed(1)
                : 0;
        }

        res.json({
            success: true,
            data: {
                averageRating: product.averageRating || 0,
                totalReviews,
                distribution: fullDistribution,
                percentageDistribution
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ➕ CREATE REVIEW
router.post("/product/:productId", 
    passport.authenticate("jwt", { session: false }), 
    upload.array("images", 5),
    async (req, res) => {
        try {
            const { rating, title, comment } = req.body;
            const productId = req.params.productId;

            // Validation
            if (!rating || !comment) {
                return res.status(400).json({
                    success: false,
                    message: "Rating and comment are required"
                });
            }

            if (rating < 1 || rating > 5) {
                return res.status(400).json({
                    success: false,
                    message: "Rating must be between 1 and 5"
                });
            }

            // Check if product exists
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: "Product not found"
                });
            }

            // Check if user already reviewed this product
            const existingReview = await Review.findOne({
                product: productId,
                user: req.user._id
            });

            if (existingReview) {
                return res.status(400).json({
                    success: false,
                    message: "You have already reviewed this product"
                });
            }

            // Check if user purchased the product
            const hasPurchased = await Order.findOne({
                user: req.user._id,
                "items.product": productId,
                status: "delivered"
            });

            // Process images
            const images = req.files.map(file => 
                `/uploads/reviews/${file.filename}`
            );

            // Create review
            const review = await Review.create({
                product: productId,
                user: req.user._id,
                rating: parseInt(rating),
                title: title || "",
                comment,
                images,
                status: hasPurchased ? "approved" : "pending",
                isVerifiedPurchase: !!hasPurchased
            });

            // Add review to product
            product.reviews.push(review._id);
            product.totalReviews = product.reviews.length;

            // Calculate average rating
            const allReviews = await Review.find({ 
                product: productId, 
                status: "approved" 
            });
            
            if (allReviews.length > 0) {
                const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
                product.averageRating = totalRating / allReviews.length;
            }

            await product.save();

            // Add review to user
            await User.findByIdAndUpdate(req.user._id, {
                $push: { reviews: review._id }
            });

            // Populate user details
            await review.populate("user", "name avatar");

            res.status(201).json({
                success: true,
                message: "Review submitted successfully",
                data: review
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);

// ✏️ UPDATE REVIEW
router.put("/:reviewId", 
    passport.authenticate("jwt", { session: false }), 
    upload.array("images", 5),
    async (req, res) => {
        try {
            const { rating, title, comment, removeImages } = req.body;
            const reviewId = req.params.reviewId;

            const review = await Review.findById(reviewId);

            if (!review) {
                return res.status(404).json({
                    success: false,
                    message: "Review not found"
                });
            }

            // Check if user owns the review or is admin
            if (review.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
                return res.status(403).json({
                    success: false,
                    message: "You can only update your own reviews"
                });
            }

            // Check if review is in pending status and not admin
            if (review.status === "pending" && req.user.role !== "admin") {
                return res.status(400).json({
                    success: false,
                    message: "Review is pending moderation and cannot be updated"
                });
            }

            // Update fields
            if (rating) review.rating = parseInt(rating);
            if (title !== undefined) review.title = title;
            if (comment !== undefined) review.comment = comment;

            // Handle image uploads
            if (req.files && req.files.length > 0) {
                const newImages = req.files.map(file => 
                    `/uploads/reviews/${file.filename}`
                );
                review.images.push(...newImages);
            }

            // Remove images
            if (removeImages) {
                const removeImageList = typeof removeImages === "string" 
                    ? JSON.parse(removeImages) 
                    : removeImages;
                
                // Delete files from server
                for (const imageUrl of removeImageList) {
                    const imagePath = path.join(__dirname, "..", imageUrl);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                }
                
                review.images = review.images.filter(img => !removeImageList.includes(img));
            }

            review.isEdited = true;
            review.editedAt = new Date();

            await review.save();

            // Recalculate product average rating
            const product = await Product.findById(review.product);
            const allReviews = await Review.find({ 
                product: review.product, 
                status: "approved" 
            });
            
            if (allReviews.length > 0) {
                const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
                product.averageRating = totalRating / allReviews.length;
            } else {
                product.averageRating = 0;
            }
            await product.save();

            res.json({
                success: true,
                message: "Review updated successfully",
                data: review
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);

// ❌ DELETE REVIEW
router.delete("/:reviewId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const reviewId = req.params.reviewId;

        const review = await Review.findById(reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if user owns the review or is admin
        if (review.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own reviews"
            });
        }

        // Delete review images from server
        for (const imageUrl of review.images) {
            const imagePath = path.join(__dirname, "..", imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // Remove review from product
        await Product.findByIdAndUpdate(review.product, {
            $pull: { reviews: review._id }
        });

        // Remove review from user
        await User.findByIdAndUpdate(review.user, {
            $pull: { reviews: review._id }
        });

        // Recalculate product average rating
        const product = await Product.findById(review.product);
        const allReviews = await Review.find({ 
            product: review.product, 
            status: "approved" 
        });
        
        if (allReviews.length > 0) {
            const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
            product.averageRating = totalRating / allReviews.length;
        } else {
            product.averageRating = 0;
        }
        product.totalReviews = allReviews.length;
        await product.save();

        // Delete the review
        await review.deleteOne();

        res.json({
            success: true,
            message: "Review deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 👍 HELPFUL VOTE ON REVIEW
router.post("/:reviewId/helpful", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const reviewId = req.params.reviewId;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if user already voted (you can track this with a separate collection)
        // For now, simple increment
        review.helpfulCount += 1;
        await review.save();

        res.json({
            success: true,
            message: "Voted as helpful",
            data: { helpfulCount: review.helpfulCount }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 👎 NOT HELPFUL VOTE ON REVIEW
router.post("/:reviewId/not-helpful", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const reviewId = req.params.reviewId;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        review.notHelpfulCount += 1;
        await review.save();

        res.json({
            success: true,
            message: "Voted as not helpful",
            data: { notHelpfulCount: review.notHelpfulCount }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💬 REPLY TO REVIEW
router.post("/:reviewId/reply", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { message } = req.body;
        const reviewId = req.params.reviewId;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Reply message is required"
            });
        }

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if user owns the product or is admin
        const product = await Product.findById(review.product);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Only product owner or admin can reply
        if (req.user.role !== "admin") {
            // Check if user is product owner (you might want to add a vendor field)
            // For now, allow any user to reply
        }

        // Add reply
        review.replies.push({
            user: req.user._id,
            message,
            createdAt: new Date()
        });

        await review.save();

        // Populate reply user
        await review.populate("replies.user", "name avatar role");

        res.json({
            success: true,
            message: "Reply added successfully",
            data: review.replies
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET USER REVIEWS
router.get("/my-reviews", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const reviews = await Review.find({ user: req.user._id })
            .populate("product", "name slug images thumbnail")
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Review.countDocuments({ user: req.user._id });

        res.json({
            success: true,
            data: reviews,
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

// 📊 GET REVIEW STATISTICS
router.get("/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const totalReviews = await Review.countDocuments({ user: req.user._id });
        
        const ratingDistribution = await Review.aggregate([
            {
                $match: { user: req.user._id }
            },
            {
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: -1 }
            }
        ]);

        const averageRating = await Review.aggregate([
            {
                $match: { user: req.user._id }
            },
            {
                $group: {
                    _id: null,
                    avg: { $avg: "$rating" },
                    total: { $sum: 1 }
                }
            }
        ]);

        const statusCount = await Review.aggregate([
            {
                $match: { user: req.user._id }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalReviews,
                averageRating: averageRating.length > 0 ? averageRating[0].avg : 0,
                ratingDistribution,
                statusCount
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
// 👑 ADMIN REVIEW ROUTES
// ==============================

// 📥 GET ALL REVIEWS (Admin Only)
router.get("/admin/all", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const {
            page = 1,
            limit = 20,
            status,
            rating,
            productId,
            userId,
            search,
            sort = "-createdAt"
        } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (rating) filter.rating = parseInt(rating);
        if (productId) filter.product = productId;
        if (userId) filter.user = userId;
        
        if (search) {
            filter.$or = [
                { comment: { $regex: search, $options: "i" } },
                { title: { $regex: search, $options: "i" } }
            ];
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const reviews = await Review.find(filter)
            .populate("user", "name email")
            .populate("product", "name slug images")
            .populate("replies.user", "name avatar role")
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Review.countDocuments(filter);

        res.json({
            success: true,
            data: reviews,
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

// ✅ APPROVE REVIEW (Admin Only)
router.put("/admin/:reviewId/approve", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const review = await Review.findById(req.params.reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        if (review.status === "approved") {
            return res.status(400).json({
                success: false,
                message: "Review is already approved"
            });
        }

        review.status = "approved";
        await review.save();

        // Update product average rating
        const product = await Product.findById(review.product);
        const allReviews = await Review.find({ 
            product: review.product, 
            status: "approved" 
        });
        
        if (allReviews.length > 0) {
            const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
            product.averageRating = totalRating / allReviews.length;
        }
        product.totalReviews = allReviews.length;
        await product.save();

        res.json({
            success: true,
            message: "Review approved successfully",
            data: review
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REJECT REVIEW (Admin Only)
router.put("/admin/:reviewId/reject", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { reason } = req.body;
        const review = await Review.findById(req.params.reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        if (review.status === "rejected") {
            return res.status(400).json({
                success: false,
                message: "Review is already rejected"
            });
        }

        review.status = "rejected";
        review.comment = review.comment + `\n\n[Rejected Reason: ${reason || "No reason provided"}]`;
        await review.save();

        res.json({
            success: true,
            message: "Review rejected successfully",
            data: review
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 BULK APPROVE REVIEWS (Admin Only)
router.put("/admin/bulk/approve", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { reviewIds } = req.body;

        if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Review IDs array is required"
            });
        }

        const result = await Review.updateMany(
            { _id: { $in: reviewIds } },
            { status: "approved" }
        );

        // Update all affected products' average ratings
        const reviews = await Review.find({ _id: { $in: reviewIds } });
        const productIds = [...new Set(reviews.map(r => r.product.toString()))];

        for (const productId of productIds) {
            const allReviews = await Review.find({ 
                product: productId, 
                status: "approved" 
            });
            
            const product = await Product.findById(productId);
            if (product) {
                if (allReviews.length > 0) {
                    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
                    product.averageRating = totalRating / allReviews.length;
                } else {
                    product.averageRating = 0;
                }
                product.totalReviews = allReviews.length;
                await product.save();
            }
        }

        res.json({
            success: true,
            message: `${result.modifiedCount} reviews approved`,
            data: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET REVIEW STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalReviews = await Review.countDocuments();
        const pendingReviews = await Review.countDocuments({ status: "pending" });
        const approvedReviews = await Review.countDocuments({ status: "approved" });
        const rejectedReviews = await Review.countDocuments({ status: "rejected" });

        // Rating distribution
        const ratingDistribution = await Review.aggregate([
            {
                $match: { status: "approved" }
            },
            {
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: -1 }
            }
        ]);

        // Average rating
        const averageRating = await Review.aggregate([
            {
                $match: { status: "approved" }
            },
            {
                $group: {
                    _id: null,
                    avg: { $avg: "$rating" }
                }
            }
        ]);

        // Reviews by product
        const productStats = await Review.aggregate([
            {
                $match: { status: "approved" }
            },
            {
                $group: {
                    _id: "$product",
                    count: { $sum: 1 },
                    avgRating: { $avg: "$rating" }
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
                    productName: { $arrayElemAt: ["$product.name", 0] },
                    productSlug: { $arrayElemAt: ["$product.slug", 0] },
                    count: 1,
                    avgRating: 1
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Reviews by user
        const userStats = await Review.aggregate([
            {
                $group: {
                    _id: "$user",
                    count: { $sum: 1 },
                    avgRating: { $avg: "$rating" }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "user"
                }
            },
            {
                $project: {
                    userName: { $arrayElemAt: ["$user.name", 0] },
                    userEmail: { $arrayElemAt: ["$user.email", 0] },
                    count: 1,
                    avgRating: 1
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Monthly review trends
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyTrends = await Review.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo },
                    status: "approved"
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    avgRating: { $avg: "$rating" }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            }
        ]);

        // Helpful ratio
        const helpfulStats = await Review.aggregate([
            {
                $match: { status: "approved" }
            },
            {
                $group: {
                    _id: null,
                    totalHelpful: { $sum: "$helpfulCount" },
                    totalNotHelpful: { $sum: "$notHelpfulCount" },
                    avgHelpful: { $avg: "$helpfulCount" }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalReviews,
                pendingReviews,
                approvedReviews,
                rejectedReviews,
                averageRating: averageRating.length > 0 ? averageRating[0].avg : 0,
                ratingDistribution,
                productStats,
                userStats,
                monthlyTrends,
                helpfulStats: helpfulStats.length > 0 ? helpfulStats[0] : {
                    totalHelpful: 0,
                    totalNotHelpful: 0,
                    avgHelpful: 0
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

// 📥 EXPORT REVIEWS (Admin Only)
router.get("/admin/export/csv", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { dateFrom, dateTo, status, productId } = req.query;
        const filter = {};

        if (status) filter.status = status;
        if (productId) filter.product = productId;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const reviews = await Review.find(filter)
            .populate("user", "name email")
            .populate("product", "name slug")
            .sort("-createdAt");

        // Create CSV header
        let csv = "User,Email,Product,Rating,Title,Comment,Status,Helpful,Not Helpful,Created At\n";

        // Add data rows
        reviews.forEach(review => {
            csv += `"${review.user?.name || 'Deleted User'}","${review.user?.email || 'N/A'}","${review.product?.name || 'Deleted Product'}",${review.rating},"${(review.title || '').replace(/"/g, '""')}","${review.comment.replace(/"/g, '""')}","${review.status}",${review.helpfulCount},${review.notHelpfulCount},"${review.createdAt.toISOString()}"\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=reviews-${new Date().toISOString().split("T")[0]}.csv`);
        res.send(csv);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;