const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Category = require("../modules/CategorySchema");
const Product = require("../modules/ProductSchema");
const passport = require("passport");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==============================
// 📁 FILE UPLOAD CONFIGURATION
// ==============================

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../uploads/categories");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for category images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "category-" + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
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
// 📂 CATEGORY ROUTES (Public)
// ==============================

// 📥 GET ALL CATEGORIES
router.get("/", async (req, res) => {
    try {
        const { 
            isActive,
            sort = "name",
            limit = 100
        } = req.query;

        const filter = {};
        if (isActive !== undefined) {
            filter.isActive = isActive === "true";
        }

        const categories = await Category.find(filter)
            .sort(sort)
            .limit(parseInt(limit));

        res.json({
            success: true,
            count: categories.length,
            data: categories
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📄 GET SINGLE CATEGORY
router.get("/:id", async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        // Get products in this category
        const products = await Product.find({ 
            category: category._id,
            isActive: true
        })
        .select("name slug price discountPrice images thumbnail averageRating")
        .limit(10);

        res.json({
            success: true,
            data: {
                category,
                products,
                productCount: await Product.countDocuments({ 
                    category: category._id,
                    isActive: true 
                })
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📄 GET CATEGORY BY SLUG
router.get("/slug/:slug", async (req, res) => {
    try {
        const category = await Category.findOne({ slug: req.params.slug });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        // Get products in this category with pagination
        const { page = 1, limit = 20, sort = "-createdAt" } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const products = await Product.find({ 
            category: category._id,
            isActive: true
        })
        .populate("category", "name slug")
        .sort(sort)
        .skip(skip)
        .limit(limitNum);

        const totalProducts = await Product.countDocuments({ 
            category: category._id,
            isActive: true 
        });

        res.json({
            success: true,
            data: {
                category,
                products,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalProducts,
                    pages: Math.ceil(totalProducts / limitNum)
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
// 👑 ADMIN CATEGORY ROUTES
// ==============================

// ➕ CREATE CATEGORY (Admin Only)
// Use .any() to accept all fields and handle files manually
router.post("/admin/categories", passport.authenticate("jwt", { session: false }), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 }
]), async (req, res) => {
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
            shortDescription,
            categoryCode,
            parentCategory,
            collection,
            status,
            isActive,
            isFeatured,
            showOnHomepage,
            showInNavigation,
            showInSearch,
            allowProductAssignment,
            icon,
            colorTheme,
            backgroundStyle,
            displayOrder,
            customLabel,
            allowAutomaticAssignment,
            allowManualAssignment,
            allowMultiCategoryAssignment,
            allowCategoryFiltering,
            productCountLimit,
            metaTitle,
            metaDescription,
            metaKeywords,
            canonicalUrl,
            trackCategoryViews,
            trackProductClicks,
            trackConversionRate,
            trackRevenue,
            enablePerformanceReports,
            accessLevel,
            department,
            manager,
            vendorGroup,
            storeLocation,
            internalNotes
        } = req.body;

        // Validation
        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Category name is required"
            });
        }

        // Generate slug
        const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");

        // Check if slug exists
        const existingCategory = await Category.findOne({ slug });
        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: "Category with this name already exists"
            });
        }

        // Handle image uploads
        let image = null;
        let iconImage = null;
        let bannerImage = null;

        if (req.files && req.files.image) {
            image = `/uploads/categories/${req.files.image[0].filename}`;
        }

        if (req.files && req.files.icon) {
            iconImage = `/uploads/categories/${req.files.icon[0].filename}`;
        }

        if (req.files && req.files.bannerImage) {
            bannerImage = `/uploads/categories/${req.files.bannerImage[0].filename}`;
        }

        // Create category
        const categoryData = {
            name,
            slug,
            description: description || "",
            shortDescription: shortDescription || "",
            categoryCode: categoryCode || "",
            parentCategory: parentCategory || null,
            collection: collection || "",
            status: status || "draft",
            isActive: isActive === "true" || isActive === true,
            isFeatured: isFeatured === "true" || isFeatured === true,
            showOnHomepage: showOnHomepage === "true" || showOnHomepage === true,
            showInNavigation: showInNavigation === "true" || showInNavigation === true,
            showInSearch: showInSearch === "true" || showInSearch === true,
            allowProductAssignment: allowProductAssignment === "true" || allowProductAssignment === true,
            icon: icon || "folder",
            colorTheme: colorTheme || "#3B82F6",
            backgroundStyle: backgroundStyle || "light",
            displayOrder: parseInt(displayOrder) || 0,
            customLabel: customLabel || "",
            allowAutomaticAssignment: allowAutomaticAssignment === "true" || allowAutomaticAssignment === true,
            allowManualAssignment: allowManualAssignment === "true" || allowManualAssignment === true,
            allowMultiCategoryAssignment: allowMultiCategoryAssignment === "true" || allowMultiCategoryAssignment === true,
            allowCategoryFiltering: allowCategoryFiltering === "true" || allowCategoryFiltering === true,
            productCountLimit: parseInt(productCountLimit) || 0,
            metaTitle: metaTitle || "",
            metaDescription: metaDescription || "",
            metaKeywords: metaKeywords || "",
            canonicalUrl: canonicalUrl || "",
            trackCategoryViews: trackCategoryViews === "true" || trackCategoryViews === true,
            trackProductClicks: trackProductClicks === "true" || trackProductClicks === true,
            trackConversionRate: trackConversionRate === "true" || trackConversionRate === true,
            trackRevenue: trackRevenue === "true" || trackRevenue === true,
            enablePerformanceReports: enablePerformanceReports === "true" || enablePerformanceReports === true,
            accessLevel: accessLevel || "public",
            department: department || "",
            manager: manager || "",
            vendorGroup: vendorGroup || "",
            storeLocation: storeLocation || "",
            internalNotes: internalNotes || "",
            image,
            icon: iconImage,
            bannerImage
        };

        const category = await Category.create(categoryData);

        res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: category
        });

    } catch (error) {
        console.error("Create category error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE CATEGORY (Admin Only)
router.put("/admin/categories/:id", passport.authenticate("jwt", { session: false }), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 }
]), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const { 
            name, 
            description, 
            shortDescription,
            categoryCode,
            parentCategory,
            collection,
            status,
            isActive,
            isFeatured,
            showOnHomepage,
            showInNavigation,
            showInSearch,
            allowProductAssignment,
            icon,
            colorTheme,
            backgroundStyle,
            displayOrder,
            customLabel,
            allowAutomaticAssignment,
            allowManualAssignment,
            allowMultiCategoryAssignment,
            allowCategoryFiltering,
            productCountLimit,
            metaTitle,
            metaDescription,
            metaKeywords,
            canonicalUrl,
            trackCategoryViews,
            trackProductClicks,
            trackConversionRate,
            trackRevenue,
            enablePerformanceReports,
            accessLevel,
            department,
            manager,
            vendorGroup,
            storeLocation,
            internalNotes
        } = req.body;

        // Update fields
        if (name) {
            category.name = name;
            category.slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
            
            // Check if new slug conflicts with other categories
            const existingCategory = await Category.findOne({ 
                slug: category.slug,
                _id: { $ne: category._id }
            });
            
            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: "Category with this name already exists"
                });
            }
        }

        if (description !== undefined) category.description = description;
        if (shortDescription !== undefined) category.shortDescription = shortDescription;
        if (categoryCode !== undefined) category.categoryCode = categoryCode;
        if (parentCategory !== undefined) category.parentCategory = parentCategory;
        if (collection !== undefined) category.collection = collection;
        if (status !== undefined) category.status = status;
        if (isActive !== undefined) category.isActive = isActive === "true" || isActive === true;
        if (isFeatured !== undefined) category.isFeatured = isFeatured === "true" || isFeatured === true;
        if (showOnHomepage !== undefined) category.showOnHomepage = showOnHomepage === "true" || showOnHomepage === true;
        if (showInNavigation !== undefined) category.showInNavigation = showInNavigation === "true" || showInNavigation === true;
        if (showInSearch !== undefined) category.showInSearch = showInSearch === "true" || showInSearch === true;
        if (allowProductAssignment !== undefined) category.allowProductAssignment = allowProductAssignment === "true" || allowProductAssignment === true;
        if (icon !== undefined) category.icon = icon;
        if (colorTheme !== undefined) category.colorTheme = colorTheme;
        if (backgroundStyle !== undefined) category.backgroundStyle = backgroundStyle;
        if (displayOrder !== undefined) category.displayOrder = parseInt(displayOrder) || 0;
        if (customLabel !== undefined) category.customLabel = customLabel;
        if (allowAutomaticAssignment !== undefined) category.allowAutomaticAssignment = allowAutomaticAssignment === "true" || allowAutomaticAssignment === true;
        if (allowManualAssignment !== undefined) category.allowManualAssignment = allowManualAssignment === "true" || allowManualAssignment === true;
        if (allowMultiCategoryAssignment !== undefined) category.allowMultiCategoryAssignment = allowMultiCategoryAssignment === "true" || allowMultiCategoryAssignment === true;
        if (allowCategoryFiltering !== undefined) category.allowCategoryFiltering = allowCategoryFiltering === "true" || allowCategoryFiltering === true;
        if (productCountLimit !== undefined) category.productCountLimit = parseInt(productCountLimit) || 0;
        if (metaTitle !== undefined) category.metaTitle = metaTitle;
        if (metaDescription !== undefined) category.metaDescription = metaDescription;
        if (metaKeywords !== undefined) category.metaKeywords = metaKeywords;
        if (canonicalUrl !== undefined) category.canonicalUrl = canonicalUrl;
        if (trackCategoryViews !== undefined) category.trackCategoryViews = trackCategoryViews === "true" || trackCategoryViews === true;
        if (trackProductClicks !== undefined) category.trackProductClicks = trackProductClicks === "true" || trackProductClicks === true;
        if (trackConversionRate !== undefined) category.trackConversionRate = trackConversionRate === "true" || trackConversionRate === true;
        if (trackRevenue !== undefined) category.trackRevenue = trackRevenue === "true" || trackRevenue === true;
        if (enablePerformanceReports !== undefined) category.enablePerformanceReports = enablePerformanceReports === "true" || enablePerformanceReports === true;
        if (accessLevel !== undefined) category.accessLevel = accessLevel;
        if (department !== undefined) category.department = department;
        if (manager !== undefined) category.manager = manager;
        if (vendorGroup !== undefined) category.vendorGroup = vendorGroup;
        if (storeLocation !== undefined) category.storeLocation = storeLocation;
        if (internalNotes !== undefined) category.internalNotes = internalNotes;

        // Handle image uploads
        if (req.files && req.files.image) {
            // Delete old image if exists
            if (category.image) {
                const oldImagePath = path.join(__dirname, "..", category.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            category.image = `/uploads/categories/${req.files.image[0].filename}`;
        }

        if (req.files && req.files.icon) {
            // Delete old icon if exists
            if (category.icon) {
                const oldIconPath = path.join(__dirname, "..", category.icon);
                if (fs.existsSync(oldIconPath)) {
                    fs.unlinkSync(oldIconPath);
                }
            }
            category.icon = `/uploads/categories/${req.files.icon[0].filename}`;
        }

        if (req.files && req.files.bannerImage) {
            // Delete old banner image if exists
            if (category.bannerImage) {
                const oldBannerPath = path.join(__dirname, "..", category.bannerImage);
                if (fs.existsSync(oldBannerPath)) {
                    fs.unlinkSync(oldBannerPath);
                }
            }
            category.bannerImage = `/uploads/categories/${req.files.bannerImage[0].filename}`;
        }

        await category.save();

        res.json({
            success: true,
            message: "Category updated successfully",
            data: category
        });

    } catch (error) {
        console.error("Update category error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ DELETE CATEGORY (Admin Only)
router.delete("/admin/categories/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        // Check if category has products
        const productCount = await Product.countDocuments({ category: category._id });
        if (productCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category with ${productCount} products. Move or delete products first.`
            });
        }

        // Delete category images
        if (category.image) {
            const imagePath = path.join(__dirname, "..", category.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        if (category.icon) {
            const iconPath = path.join(__dirname, "..", category.icon);
            if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
            }
        }
        if (category.bannerImage) {
            const bannerPath = path.join(__dirname, "..", category.bannerImage);
            if (fs.existsSync(bannerPath)) {
                fs.unlinkSync(bannerPath);
            }
        }

        await category.deleteOne();

        res.json({
            success: true,
            message: "Category deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 BULK UPDATE CATEGORIES (Admin Only)
router.put("/admin/categories/bulk", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { categoryIds, updates } = req.body;

        if (!categoryIds || !updates || !Array.isArray(categoryIds)) {
            return res.status(400).json({
                success: false,
                message: "Category IDs and updates are required"
            });
        }

        const result = await Category.updateMany(
            { _id: { $in: categoryIds } },
            updates,
            { runValidators: true }
        );

        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} categories`,
            data: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET CATEGORY STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalCategories = await Category.countDocuments();
        const activeCategories = await Category.countDocuments({ isActive: true });
        const inactiveCategories = await Category.countDocuments({ isActive: false });

        // Get product count per category
        const categoryProductStats = await Category.aggregate([
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "category",
                    as: "products"
                }
            },
            {
                $project: {
                    name: 1,
                    slug: 1,
                    productCount: { $size: "$products" },
                    image: 1,
                    icon: 1,
                    isActive: 1
                }
            },
            {
                $sort: { productCount: -1 }
            }
        ]);

        // Get categories with most products
        const topCategories = categoryProductStats.slice(0, 5);

        // Get categories with no products
        const emptyCategories = categoryProductStats.filter(cat => cat.productCount === 0);

        res.json({
            success: true,
            data: {
                totalCategories,
                activeCategories,
                inactiveCategories,
                topCategories,
                emptyCategories: emptyCategories.length,
                categoryStats: categoryProductStats
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔍 SEARCH CATEGORIES (Admin Only)
router.get("/admin/search/:query", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const query = req.params.query;
        const categories = await Category.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
                { description: { $regex: query, $options: "i" } },
                { slug: { $regex: query, $options: "i" } }
            ]
        });

        res.json({
            success: true,
            count: categories.length,
            data: categories
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🔄 CATEGORY HIERARCHY (Optional - if you want parent-child categories)
// ==============================

// ➕ ADD SUBCATEGORY (Admin Only)
router.post("/admin/categories/:parentId/subcategory", passport.authenticate("jwt", { session: false }), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 }
]), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const parentCategory = await Category.findById(req.params.parentId);
        if (!parentCategory) {
            return res.status(404).json({
                success: false,
                message: "Parent category not found"
            });
        }

        const { name, description, isActive } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Subcategory name is required"
            });
        }

        // Generate slug
        const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");

        // Check if slug exists
        const existingCategory = await Category.findOne({ slug });
        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: "Category with this name already exists"
            });
        }

        // Handle image uploads
        let image = null;
        let iconImage = null;
        let bannerImage = null;

        if (req.files && req.files.image) {
            image = `/uploads/categories/${req.files.image[0].filename}`;
        }

        if (req.files && req.files.icon) {
            iconImage = `/uploads/categories/${req.files.icon[0].filename}`;
        }

        if (req.files && req.files.bannerImage) {
            bannerImage = `/uploads/categories/${req.files.bannerImage[0].filename}`;
        }

        // Create subcategory
        const subcategory = await Category.create({
            name,
            slug,
            description: description || "",
            image,
            icon: iconImage,
            bannerImage,
            isActive: isActive === "true" || isActive === true,
            parent: parentCategory._id
        });

        // Add subcategory to parent
        if (!parentCategory.subcategories) {
            parentCategory.subcategories = [];
        }
        parentCategory.subcategories.push(subcategory._id);
        await parentCategory.save();

        res.status(201).json({
            success: true,
            message: "Subcategory created successfully",
            data: subcategory
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET CATEGORY TREE (Public)
router.get("/tree", async (req, res) => {
    try {
        const categories = await Category.find({ 
            isActive: true,
            parent: { $exists: false } // Only root categories
        });

        // Build tree
        const buildTree = async (category) => {
            const children = await Category.find({
                parent: category._id,
                isActive: true
            });

            const tree = category.toObject();
            if (children.length > 0) {
                tree.subcategories = await Promise.all(children.map(buildTree));
            }
            return tree;
        };

        const categoryTree = await Promise.all(categories.map(buildTree));

        res.json({
            success: true,
            data: categoryTree
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 📊 CATEGORY ANALYTICS (Admin Only)
// ==============================

// 📊 GET CATEGORY PERFORMANCE
router.get("/admin/performance", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const performance = await Category.aggregate([
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "category",
                    as: "products"
                }
            },
            {
                $project: {
                    name: 1,
                    slug: 1,
                    productCount: { $size: "$products" },
                    totalRevenue: {
                        $sum: {
                            $map: {
                                input: "$products",
                                as: "product",
                                in: {
                                    $multiply: [
                                        { $ifNull: ["$$product.price", 0] },
                                        { $ifNull: ["$$product.soldCount", 0] }
                                    ]
                                }
                            }
                        }
                    },
                    totalSold: {
                        $sum: {
                            $map: {
                                input: "$products",
                                as: "product",
                                in: { $ifNull: ["$$product.soldCount", 0] }
                            }
                        }
                    }
                }
            },
            {
                $sort: { totalRevenue: -1 }
            }
        ]);

        res.json({
            success: true,
            data: performance
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 📥 EXPORT CATEGORIES (Admin Only)
// ==============================

// 📊 EXPORT CATEGORIES AS CSV
router.get("/admin/export/csv", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const categories = await Category.find()
            .sort({ name: 1 });

        // Create CSV header
        let csv = "Name,Slug,Description,Product Count,Is Active,Created At,Updated At\n";

        // Add data rows
        for (const category of categories) {
            const productCount = await Product.countDocuments({ category: category._id });
            csv += `"${category.name}","${category.slug}","${(category.description || "").replace(/"/g, '""')}",${productCount},${category.isActive},${category.createdAt.toISOString()},${category.updatedAt.toISOString()}\n`;
        }

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=categories-${new Date().toISOString().split("T")[0]}.csv`);
        res.send(csv);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🔄 REORDER CATEGORIES (Admin Only)
// ==============================

// 🔄 UPDATE CATEGORY ORDER (If you have display order field)
router.put("/admin/categories/reorder", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { order } = req.body; // [{id: "categoryId", order: 1}, ...]

        if (!order || !Array.isArray(order)) {
            return res.status(400).json({
                success: false,
                message: "Order array is required"
            });
        }

        // Update each category's display order
        const updates = order.map(item => 
            Category.findByIdAndUpdate(item.id, { displayOrder: item.order })
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: "Categories reordered successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;