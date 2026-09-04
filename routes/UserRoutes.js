const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../modules/UserSchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const passport = require("passport");

// ==============================
// 🔐 AUTHENTICATION ROUTES (Public)
// ==============================

// 📝 REGISTER USER
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Basic validation
        if (!name || !email || !password || !phone) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Check existing user
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists"
            });
        }

        // 🔐 Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            phone
        });

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            success: true,
            message: "User created successfully",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔑 LOGIN USER
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 REFRESH TOKEN
router.post("/refresh-token", async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: "Refresh token required"
            });
        }

        const user = await User.findOne({ refreshToken });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid refresh token"
            });
        }

        const newToken = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            data: { token: newToken }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔐 LOGOUT USER
router.post("/logout", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
        res.json({
            success: true,
            message: "Logged out successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 👤 USER PROFILE ROUTES (Protected)
// ==============================

// 📥 GET PROFILE
router.get("/profile", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        res.json({
            success: true,
            data: req.user
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ✏️ UPDATE PROFILE
router.put("/profile", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { name, phone, avatar } = req.body;
        const updates = {};

        if (name) updates.name = name;
        if (phone) updates.phone = phone;
        if (avatar) updates.avatar = avatar;

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { returnDocument: 'after', runValidators: true }
        ).select("-password -refreshToken");

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            message: "Profile updated successfully",
            data: updatedUser
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 🔑 CHANGE PASSWORD
router.put("/change-password", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required"
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters"
            });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({
            success: true,
            message: "Password changed successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🗑️ DELETE ACCOUNT
router.delete("/profile", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.user._id);
        if (!deletedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            message: "Account deleted successfully"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==============================
// 📍 ADDRESS MANAGEMENT
// ==============================

// ➕ ADD ADDRESS
router.post("/address", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { fullName, phone, street, city, state, zipCode, country } = req.body;

        if (!fullName || !phone || !street || !city || !state || !zipCode) {
            return res.status(400).json({
                success: false,
                message: "All required fields are needed"
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        user.addresses.push({
            fullName,
            phone,
            street,
            city,
            state,
            zipCode,
            country: country || "India"
        });

        await user.save();

        res.status(200).json({
            success: true,
            message: "Address added successfully",
            data: user.addresses
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE ADDRESS
router.put("/address/:addressId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { fullName, phone, street, city, state, zipCode, country } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const address = user.addresses.id(req.params.addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        if (fullName) address.fullName = fullName;
        if (phone) address.phone = phone;
        if (street) address.street = street;
        if (city) address.city = city;
        if (state) address.state = state;
        if (zipCode) address.zipCode = zipCode;
        if (country) address.country = country;

        await user.save();

        res.json({
            success: true,
            message: "Address updated successfully",
            data: user.addresses
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ DELETE ADDRESS
router.delete("/address/:addressId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        user.addresses = user.addresses.filter(
            (addr) => addr._id.toString() !== req.params.addressId
        );

        await user.save();

        res.json({
            success: true,
            message: "Address removed successfully",
            data: user.addresses
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 👤 GET USER ADDRESSES
router.get("/addresses", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("addresses");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: user.addresses
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🛒 WISHLIST MANAGEMENT
// ==============================

// ➕ ADD TO WISHLIST
router.post("/wishlist/:productId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const productId = req.params.productId;

        // Check if product already in wishlist
        if (user.wishlist.includes(productId)) {
            return res.status(400).json({
                success: false,
                message: "Product already in wishlist"
            });
        }

        user.wishlist.push(productId);
        await user.save();

        res.json({
            success: true,
            message: "Product added to wishlist",
            data: user.wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ REMOVE FROM WISHLIST
router.delete("/wishlist/:productId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        user.wishlist = user.wishlist.filter(
            (id) => id.toString() !== req.params.productId
        );

        await user.save();

        res.json({
            success: true,
            message: "Product removed from wishlist",
            data: user.wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET WISHLIST
router.get("/wishlist", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: "wishlist",
                populate: { path: "category" }
            });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: user.wishlist
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🔔 NOTIFICATIONS
// ==============================

// 📥 GET NOTIFICATIONS
router.get("/notifications", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate("notifications");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: user.notifications
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 👑 ADMIN ROUTES (Protected - Admin Only)
// ==============================

// 📥 GET ALL USERS (Admin Only)
router.get("/admin/users", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const users = await User.find()
            .select("-password -refreshToken -resetPasswordToken")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: users.length,
            data: users
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📄 GET SINGLE USER (Admin Only)
router.get("/admin/users/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const user = await User.findById(req.params.id)
            .populate("cart")
            .populate("wishlist")
            .populate("orders")
            .populate("reviews")
            .select("-password -refreshToken -resetPasswordToken");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE USER ROLE (Admin Only)
router.put("/admin/users/:id/role", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { role } = req.body;
        if (!role || !["user", "admin"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Valid role (user/admin) is required"
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { returnDocument: 'after', runValidators: true }
        ).select("-password -refreshToken -resetPasswordToken");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            message: "User role updated",
            data: user
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🗑️ DELETE USER (Admin Only)
router.delete("/admin/users/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: "Admin cannot delete their own account"
            });
        }

        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            message: "User deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET USER STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalUsers = await User.countDocuments();
        const adminUsers = await User.countDocuments({ role: "admin" });
        const regularUsers = await User.countDocuments({ role: "user" });
        const newUsersToday = await User.countDocuments({
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        const newUsersThisWeek = await User.countDocuments({
            createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 7)) }
        });

        res.json({
            success: true,
            data: {
                totalUsers,
                adminUsers,
                regularUsers,
                newUsersToday,
                newUsersThisWeek
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔍 SEARCH USERS (Admin Only)
router.get("/admin/users/search/:query", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const query = req.params.query;
        const users = await User.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
                { phone: { $regex: query, $options: "i" } }
            ]
        }).select("-password -refreshToken -resetPasswordToken");

        res.json({
            success: true,
            count: users.length,
            data: users
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 🛡️ PASSWORD RESET (Public)
// ==============================

// 📧 FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Generate reset token
        const resetToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
        await user.save();

        // In production, send email with reset link
        // For now, return token
        res.json({
            success: true,
            message: "Password reset link sent to email",
            data: { resetToken } // Remove in production
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔑 RESET PASSWORD
router.post("/reset-password/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters"
            });
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token"
            });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;
        await user.save();

        res.json({
            success: true,
            message: "Password reset successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;