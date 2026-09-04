const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../modules/ProductSchema");
const Category = require("../modules/CategorySchema");
const Review = require("../modules/ReviewSchema");
const passport = require("passport");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==============================
// 📁 FILE UPLOAD CONFIGURATION
// ==============================

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../uploads/products");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for product images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "product-" + uniqueSuffix + path.extname(file.originalname));
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// ==============================
// 📦 PRODUCT ROUTES (Public)
// ==============================

// 📥 GET ALL PRODUCTS (with filters, sorting, pagination)
router.get("/", async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const limitNum = parseInt(limit);

        // Build filter for active products only
        const filter = { isActive: true };

        // Get total count of active products
        const total = await Product.countDocuments(filter);

        if (total === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: {
                    page: 1,
                    limit: limitNum,
                    total: 0,
                    pages: 0
                }
            });
        }

        // Get random products using MongoDB aggregation
        // $sample will randomly select documents
        const randomProducts = await Product.aggregate([
            { $match: filter },
            { $sample: { size: Math.min(limitNum, total) } }
        ]);

        // Extract product IDs from aggregation result
        const productIds = randomProducts.map(p => p._id);

        // Fetch populated products with all data
        let products = [];
        if (productIds.length > 0) {
            products = await Product.find({ _id: { $in: productIds } })
                .populate("category", "name slug")
                .populate({
                    path: "reviews",
                    select: "rating comment user",
                    populate: { path: "user", select: "name avatar" }
                });

            // Maintain the random order from aggregation
            const idOrder = productIds.map(id => id.toString());
            products.sort((a, b) => {
                return idOrder.indexOf(a._id.toString()) - idOrder.indexOf(b._id.toString());
            });
        }

        products.forEach(item => {
  console.log(item._id);
  console.log(item.name);
});


        res.json({
            success: true,
            data: products,
            pagination: {
                page: 1,
                limit: limitNum,
                total: total,
                pages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        console.error("Error fetching random products:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📄 GET SINGLE PRODUCT
router.get("/:id", async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate("category", "name slug description")
            .populate({
                path: "reviews",
                select: "rating comment user createdAt",
                populate: { path: "user", select: "name avatar" }
            });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Increment view count (optional - if you add views field)
        // product.views = (product.views || 0) + 1;
        // await product.save();

        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔍 SEARCH PRODUCTS
router.get("/search/:query", async (req, res) => {
    try {
        const query = req.params.query;
        const products = await Product.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
                { description: { $regex: query, $options: "i" } },
                { brand: { $regex: query, $options: "i" } }
            ],
            isActive: true
        })
        .populate("category", "name slug")
        .limit(20);

        res.json({
            success: true,
            count: products.length,
            data: products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET PRODUCTS BY CATEGORY
router.get("/category/:categorySlug", async (req, res) => {
    try {
        const category = await Category.findOne({ slug: req.params.categorySlug });
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const products = await Product.find({
            category: category._id,
            isActive: true
        })
        .populate("category", "name slug")
        .sort("-createdAt");

        res.json({
            success: true,
            category: category.name,
            count: products.length,
            data: products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🌟 GET FEATURED PRODUCTS
router.get("/featured", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 6;
        const products = await Product.find({
            isFeatured: true,
            isActive: true
        })
        .populate("category", "name slug")
        .limit(limit);

        res.json({
            success: true,
            count: products.length,
            data: products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 📝 REVIEW ROUTES (Protected)
// ==============================

// ➕ ADD REVIEW
router.post("/:productId/review", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { rating, comment, title } = req.body;
        const productId = req.params.productId;

        if (!rating || !comment) {
            return res.status(400).json({
                success: false,
                message: "Rating and comment are required"
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

        // Create review
        const review = await Review.create({
            product: productId,
            user: req.user._id,
            rating: parseInt(rating),
            title: title || "",
            comment,
            status: "approved" // Auto-approve for now
        });

        // Add review to product
        product.reviews.push(review._id);
        product.totalReviews = product.reviews.length;

        // Calculate average rating
        const allReviews = await Review.find({ product: productId, status: "approved" });
        if (allReviews.length > 0) {
            const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
            product.averageRating = totalRating / allReviews.length;
        }

        await product.save();

        // Add review to user
        await User.findByIdAndUpdate(req.user._id, {
            $push: { reviews: review._id }
        });

        res.status(201).json({
            success: true,
            message: "Review added successfully",
            data: review
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE REVIEW
router.put("/review/:reviewId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { rating, comment, title } = req.body;
        const review = await Review.findById(req.params.reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if user owns the review
        if (review.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only update your own reviews"
            });
        }

        // Update review
        if (rating) review.rating = parseInt(rating);
        if (comment) review.comment = comment;
        if (title) review.title = title;
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
            await product.save();
        }

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
});

// ❌ DELETE REVIEW
router.delete("/review/:reviewId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const review = await Review.findById(req.params.reviewId);

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
router.post("/review/:reviewId/helpful", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const review = await Review.findById(req.params.reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if user already voted
        // You could track this with a separate schema or array
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

// ==============================
// 👑 ADMIN PRODUCT ROUTES
// ==============================

// ➕ CREATE PRODUCT (Admin Only)
router.post("/admin/products", passport.authenticate("jwt", { session: false }), upload.array("images", 5), async (req, res) => {
    try {
        // Check admin role
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }
 
        const {
            name,
            description,
            price,
            discountPrice,
            costPrice,
            stock,
            brand,
            category,
            isActive,
            isFeatured,
            isDigital,
            weight,
            shippingCharge,
            variants,
            attributes
        } = req.body;

        // Validation
        if (!name || !description || !price || !category) {
            return res.status(400).json({
                success: false,
                message: "Name, description, price, and category are required"
            });
        }

        // Generate slug
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        // Check if slug exists
        const existingProduct = await Product.findOne({ slug });
        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: "Product with this name already exists"
            });
        }

        // Parse JSON fields
        let parsedVariants = [];
        let parsedAttributes = [];

        try {
            if (variants) parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
            if (attributes) parsedAttributes = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: "Invalid variants or attributes format"
            });
        }

        // Handle image uploads
        const images = req.files.map(file => ({
            url: `/uploads/products/${file.filename}`,
            altText: file.originalname
        }));

        // Set thumbnail as first image
        const thumbnail = images.length > 0 ? images[0].url : null;

        // Create product
        const product = await Product.create({
            name,
            slug,
            description,
            price: parseFloat(price),
            discountPrice: discountPrice ? parseFloat(discountPrice) : 0,
            costPrice: costPrice ? parseFloat(costPrice) : 0,
            stock: parseInt(stock) || 0,
            brand: brand || null,
            category: category,
            images,
            thumbnail,
            isActive: isActive === "true" || isActive === true,
            isFeatured: isFeatured === "true" || isFeatured === true,
            isDigital: isDigital === "true" || isDigital === true,
            weight: weight ? parseFloat(weight) : 0,
            shippingCharge: shippingCharge ? parseFloat(shippingCharge) : 0,
            variants: parsedVariants,
            attributes: parsedAttributes
        });

        // Update category product count
        await Category.findByIdAndUpdate(category, {
            $inc: { productCount: 1 }
        });

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE PRODUCT (Admin Only)
router.put("/admin/products/:id", passport.authenticate("jwt", { session: false }), upload.array("images", 5), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const {
            name,
            description,
            price,
            discountPrice,
            costPrice,
            stock,
            brand,
            category,
            isActive,
            isFeatured,
            isDigital,
            weight,
            shippingCharge,
            variants,
            attributes,
            removeImages
        } = req.body;

        // Update basic fields
        if (name) {
            product.name = name;
            product.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        }
        if (description) product.description = description;
        if (price) product.price = parseFloat(price);
        if (discountPrice !== undefined) product.discountPrice = parseFloat(discountPrice);
        if (costPrice !== undefined) product.costPrice = parseFloat(costPrice);
        if (stock !== undefined) product.stock = parseInt(stock);
        if (brand !== undefined) product.brand = brand;
        if (category) product.category = category;
        if (isActive !== undefined) product.isActive = isActive === "true" || isActive === true;
        if (isFeatured !== undefined) product.isFeatured = isFeatured === "true" || isFeatured === true;
        if (isDigital !== undefined) product.isDigital = isDigital === "true" || isDigital === true;
        if (weight !== undefined) product.weight = parseFloat(weight);
        if (shippingCharge !== undefined) product.shippingCharge = parseFloat(shippingCharge);

        // Parse JSON fields
        try {
            if (variants) product.variants = typeof variants === "string" ? JSON.parse(variants) : variants;
            if (attributes) product.attributes = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: "Invalid variants or attributes format"
            });
        }

        // Handle image uploads
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => ({
                url: `/uploads/products/${file.filename}`,
                altText: file.originalname
            }));
            product.images.push(...newImages);
        }

        // Remove images
        if (removeImages) {
            const removeImageList = typeof removeImages === "string" ? JSON.parse(removeImages) : removeImages;
            product.images = product.images.filter(img => !removeImageList.includes(img.url));
        }

        // Update thumbnail if first image exists
        if (product.images.length > 0 && !product.thumbnail) {
            product.thumbnail = product.images[0].url;
        }

        await product.save();

        // Update category product count if category changed
        if (category && category !== product.category.toString()) {
            await Category.findByIdAndUpdate(product.category, {
                $inc: { productCount: -1 }
            });
            await Category.findByIdAndUpdate(category, {
                $inc: { productCount: 1 }
            });
        }

        res.json({
            success: true,
            message: "Product updated successfully",
            data: product
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ DELETE PRODUCT (Admin Only)
router.delete("/admin/products/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Delete associated reviews
        await Review.deleteMany({ product: product._id });

        // Update category product count
        await Category.findByIdAndUpdate(product.category, {
            $inc: { productCount: -1 }
        });

        // Delete product images from server (optional)
        // You can implement file deletion here

        await product.deleteOne();

        res.json({
            success: true,
            message: "Product deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET ADMIN PRODUCT STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalProducts = await Product.countDocuments();
        const activeProducts = await Product.countDocuments({ isActive: true });
        const featuredProducts = await Product.countDocuments({ isFeatured: true });
        const outOfStock = await Product.countDocuments({ stock: 0 });

        // Products by category
        const categoryStats = await Product.aggregate([
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "categoryInfo"
                }
            },
            {
                $project: {
                    categoryName: { $arrayElemAt: ["$categoryInfo.name", 0] },
                    count: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalProducts,
                activeProducts,
                featuredProducts,
                outOfStock,
                categoryStats
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 BULK UPDATE PRODUCTS (Admin Only)
router.put("/admin/products/bulk", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { productIds, updates } = req.body;

        if (!productIds || !updates || !Array.isArray(productIds)) {
            return res.status(400).json({
                success: false,
                message: "Product IDs and updates are required"
            });
        }

        const result = await Product.updateMany(
            { _id: { $in: productIds } },
            updates,
            { runValidators: true }
        );

        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} products`,
            data: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🏷️ PRODUCT VARIANTS MANAGEMENT (Admin Only)
// ==============================

// ➕ ADD VARIANT TO PRODUCT
router.post("/admin/products/:id/variants", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { name, value, price, stock, sku } = req.body;
        if (!name || !value) {
            return res.status(400).json({
                success: false,
                message: "Variant name and value are required"
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        product.variants.push({
            name,
            value,
            price: price || 0,
            stock: stock || 0,
            sku: sku || ""
        });

        await product.save();

        res.json({
            success: true,
            message: "Variant added successfully",
            data: product.variants
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE VARIANT FROM PRODUCT
router.delete("/admin/products/:id/variants/:variantIndex", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const index = parseInt(req.params.variantIndex);
        if (index < 0 || index >= product.variants.length) {
            return res.status(400).json({
                success: false,
                message: "Invalid variant index"
            });
        }

        product.variants.splice(index, 1);
        await product.save();

        res.json({
            success: true,
            message: "Variant removed successfully",
            data: product.variants
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 📈 ANALYTICS (Admin Only)
// ==============================

// 📊 GET TOP SELLING PRODUCTS
router.get("/admin/top-selling", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const limit = parseInt(req.query.limit) || 10;
        const products = await Product.find()
            .sort({ soldCount: -1 })
            .limit(limit)
            .populate("category", "name");

        res.json({
            success: true,
            data: products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET LOW STOCK PRODUCTS
router.get("/admin/low-stock", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const threshold = parseInt(req.query.threshold) || 10;
        const products = await Product.find({
            stock: { $lte: threshold },
            isActive: true
        })
        .populate("category", "name")
        .sort({ stock: 1 });

        res.json({
            success: true,
            count: products.length,
            data: products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;