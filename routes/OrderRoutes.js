const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Order = require("../modules/OrderSchema");
const Product = require("../modules/ProductSchema");
const User = require("../modules/UserSchema");
const Cart = require("../modules/CartSchema");
const Payment = require("../modules/PaymentSchema");
const passport = require("passport");
const { v4: uuidv4 } = require("uuid");

// ==============================
// 📦 ORDER ROUTES (Protected - User)
// ==============================

// 🛒 CREATE ORDER FROM CART
router.post("/create", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { 
            addressId, 
            paymentMethod, 
            couponCode,
            notes 
        } = req.body;

        // Validation
        if (!addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: "Address ID and payment method are required"
            });
        }

        // Get user with cart items
        const user = await User.findById(req.user._id)
            .populate({
                path: "cart",
                populate: {
                    path: "product",
                    select: "name price discountPrice stock shippingCharge"
                }
            });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Get user's cart
        const cartItems = await Cart.find({ user: req.user._id })
            .populate("product");

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Cart is empty"
            });
        }

        // Get address from user
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        // Generate order ID
        const orderId = "ORD-" + Date.now().toString().slice(-8) + "-" + uuidv4().slice(0, 6).toUpperCase();

        // Calculate totals
        let subtotal = 0;
        let totalDiscount = 0;
        let totalShipping = 0;
        const orderItems = [];

        // Process each cart item
        for (const cartItem of cartItems) {
            const product = cartItem.product;
            
            // Check stock
            if (product.stock < cartItem.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.name}. Available: ${product.stock}`
                });
            }

            // Calculate item price
            const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
            const itemTotal = itemPrice * cartItem.quantity;
            
            // Create order item
            orderItems.push({
                product: product._id,
                variant: cartItem.variant || null,
                quantity: cartItem.quantity,
                price: itemPrice,
                discountPrice: product.discountPrice || 0,
                totalPrice: itemTotal
            });

            subtotal += itemTotal;
            totalShipping += product.shippingCharge || 0;

            // Update product stock
            product.stock -= cartItem.quantity;
            product.soldCount = (product.soldCount || 0) + cartItem.quantity;
            await product.save();
        }

        // Apply coupon discount if provided
        let couponDiscount = 0;
        if (couponCode) {
            // TODO: Implement coupon validation
            // For now, just a placeholder
            couponDiscount = 0;
        }

        // Calculate total
        const totalAmount = subtotal + totalShipping - couponDiscount;

        // Create order
        const order = await Order.create({
            orderId,
            user: req.user._id,
            product: orderItems[0].product, // First product as main
            variant: orderItems[0].variant,
            quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
            price: orderItems[0].price,
            discountPrice: orderItems[0].discountPrice,
            totalPrice: totalAmount,
            shippingCharge: totalShipping,
            coupon: couponCode ? {
                code: couponCode,
                discountAmount: couponDiscount
            } : null,
            payment: {
                method: paymentMethod,
                status: paymentMethod === "COD" ? "pending" : "pending"
            },
            addresses: [address],
            status: "pending",
            notes: notes || ""
        });

        // Add order to user's orders
        user.orders.push(order._id);
        await user.save();

        // Clear user's cart after order creation
        await Cart.deleteMany({ user: req.user._id });

        // If payment method is online, create payment record
        if (paymentMethod !== "COD") {
            const payment = await Payment.create({
                order: order._id,
                user: req.user._id,
                amount: totalAmount,
                method: paymentMethod,
                status: "pending"
            });
            
            // Update order with payment reference
            order.payment.transactionId = payment._id;
            await order.save();
        }

        res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: {
                order,
                orderItems,
                summary: {
                    subtotal,
                    shipping: totalShipping,
                    couponDiscount,
                    total: totalAmount
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

// 🛒 CREATE ORDER DIRECTLY (Single Product)
router.post("/create-direct", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const {
            productId,
            quantity = 1,
            variant,
            addressId,
            paymentMethod,
            couponCode,
            notes
        } = req.body;

        // Validation
        if (!productId || !addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: "Product ID, address, and payment method are required"
            });
        }

        // Get user
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Get product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Check stock
        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Not enough stock. Available: ${product.stock}`
            });
        }

        // Get address
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        // Calculate prices
        const itemPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
        const totalPrice = itemPrice * quantity;
        const shippingCharge = product.shippingCharge || 0;

        // Generate order ID
        const orderId = "ORD-" + Date.now().toString().slice(-8) + "-" + uuidv4().slice(0, 6).toUpperCase();

        // Create order
        const order = await Order.create({
            orderId,
            user: req.user._id,
            product: product._id,
            variant: variant || null,
            quantity,
            price: itemPrice,
            discountPrice: product.discountPrice || 0,
            totalPrice: totalPrice + shippingCharge,
            shippingCharge,
            payment: {
                method: paymentMethod,
                status: "pending"
            },
            addresses: [address],
            status: "pending",
            notes: notes || ""
        });

        // Update product stock
        product.stock -= quantity;
        product.soldCount = (product.soldCount || 0) + quantity;
        await product.save();

        // Add order to user
        user.orders.push(order._id);
        await user.save();

        // Create payment if online
        if (paymentMethod !== "COD") {
            const payment = await Payment.create({
                order: order._id,
                user: req.user._id,
                amount: totalPrice + shippingCharge,
                method: paymentMethod,
                status: "pending"
            });
            
            order.payment.transactionId = payment._id;
            await order.save();
        }

        res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: {
                order,
                summary: {
                    subtotal: totalPrice,
                    shipping: shippingCharge,
                    total: totalPrice + shippingCharge
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

// 📥 GET USER ORDERS
router.get("/my-orders", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status,
            sort = "-createdAt"
        } = req.query;

        const filter = { user: req.user._id };
        if (status) filter.status = status;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const orders = await Order.find(filter)
            .populate("product", "name images thumbnail")
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            data: orders,
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

// 📄 GET SINGLE ORDER
router.get("/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate("product", "name images thumbnail brand")
            .populate("user", "name email phone");

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Check if user owns the order or is admin
        if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "You can only view your own orders"
            });
        }

        res.json({
            success: true,
            data: order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 CANCEL ORDER
router.put("/:id/cancel", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Check if user owns the order
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only cancel your own orders"
            });
        }

        // Check if order can be cancelled
        if (!["pending", "confirmed"].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled in ${order.status} status`
            });
        }

        // Restore product stock
        const product = await Product.findById(order.product);
        if (product) {
            product.stock += order.quantity;
            product.soldCount = Math.max(0, (product.soldCount || 0) - order.quantity);
            await product.save();
        }

        // Update order status
        order.status = "cancelled";
        order.notes = reason || "Cancelled by user";
        await order.save();

        // If payment was made, process refund
        if (order.payment.status === "paid") {
            // TODO: Implement refund logic
            order.payment.status = "refunded";
            await order.save();
        }

        res.json({
            success: true,
            message: "Order cancelled successfully",
            data: order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 RETURN ORDER
router.put("/:id/return", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Check if user owns the order
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only return your own orders"
            });
        }

        // Check if order can be returned
        if (order.status !== "delivered") {
            return res.status(400).json({
                success: false,
                message: "Only delivered orders can be returned"
            });
        }

        // Check if return already requested
        if (order.refund.status !== "none") {
            return res.status(400).json({
                success: false,
                message: "Return already requested for this order"
            });
        }

        // Update order refund status
        order.refund.status = "requested";
        order.refund.reason = reason || "Return requested by user";
        order.status = "returned";
        await order.save();

        res.json({
            success: true,
            message: "Return requested successfully",
            data: order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET ORDER SUMMARY
router.get("/summary", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id });
        
        const summary = {
            totalOrders: orders.length,
            pending: orders.filter(o => o.status === "pending").length,
            confirmed: orders.filter(o => o.status === "confirmed").length,
            processing: orders.filter(o => o.status === "processing").length,
            shipped: orders.filter(o => o.status === "shipped").length,
            delivered: orders.filter(o => o.status === "delivered").length,
            cancelled: orders.filter(o => o.status === "cancelled").length,
            returned: orders.filter(o => o.status === "returned").length,
            totalSpent: orders.reduce((sum, o) => sum + o.totalPrice, 0),
            lastOrder: orders.length > 0 ? orders[orders.length - 1].createdAt : null
        };

        res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 👑 ADMIN ORDER ROUTES
// ==============================

// 📥 GET ALL ORDERS (Admin Only)
router.get("/admin/orders", passport.authenticate("jwt", { session: false }), async (req, res) => {
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
            search,
            dateFrom,
            dateTo,
            sort = "-createdAt"
        } = req.query;

        const filter = {};

        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { orderId: { $regex: search, $options: "i" } },
                { "addresses.fullName": { $regex: search, $options: "i" } },
                { "addresses.phone": { $regex: search, $options: "i" } }
            ];
        }
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const orders = await Order.find(filter)
            .populate("product", "name images thumbnail")
            .populate("user", "name email phone")
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            data: orders,
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

// 📄 GET ORDER DETAILS (Admin Only)
router.get("/admin/orders/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const order = await Order.findById(req.params.id)
            .populate("product", "name images thumbnail brand price")
            .populate("user", "name email phone avatar");

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Get payment details
        const payment = await Payment.findOne({ order: order._id });

        res.json({
            success: true,
            data: {
                ...order.toObject(),
                payment
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE ORDER STATUS (Admin Only)
router.put("/admin/orders/:id/status", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { status, notes } = req.body;
        const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Valid status required: ${validStatuses.join(", ")}`
            });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Update shipping timestamps
        if (status === "shipped" && order.status !== "shipped") {
            order.shipping.shippedAt = new Date();
        }
        if (status === "delivered" && order.status !== "delivered") {
            order.shipping.deliveredAt = new Date();
            order.isDelivered = true;
        }

        order.status = status;
        if (notes) order.notes = notes;
        await order.save();

        res.json({
            success: true,
            message: "Order status updated",
            data: order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🚚 UPDATE SHIPPING INFO (Admin Only)
router.put("/admin/orders/:id/shipping", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { trackingNumber, carrier, method } = req.body;

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (trackingNumber) order.shipping.trackingNumber = trackingNumber;
        if (carrier) order.shipping.carrier = carrier;
        if (method) order.shipping.method = method;

        await order.save();

        res.json({
            success: true,
            message: "Shipping info updated",
            data: order.shipping
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💰 UPDATE PAYMENT STATUS (Admin Only)
router.put("/admin/orders/:id/payment", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { status, transactionId } = req.body;
        const validStatuses = ["pending", "paid", "failed", "refunded"];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Valid payment status required: ${validStatuses.join(", ")}`
            });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        order.payment.status = status;
        if (transactionId) order.payment.transactionId = transactionId;
        if (status === "paid") {
            order.payment.paidAt = new Date();
            order.isPaid = true;
        }
        if (status === "refunded") {
            order.isPaid = false;
        }

        await order.save();

        res.json({
            success: true,
            message: "Payment status updated",
            data: order.payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 PROCESS REFUND (Admin Only)
router.put("/admin/orders/:id/refund", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { amount, reason } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.refund.status === "none" && order.refund.status !== "requested") {
            return res.status(400).json({
                success: false,
                message: "No refund request for this order"
            });
        }

        order.refund.status = "approved";
        order.refund.amount = amount || order.totalPrice;
        if (reason) order.refund.reason = reason;
        order.refund.refundedAt = new Date();

        // Update payment status
        order.payment.status = "refunded";
        order.isPaid = false;

        await order.save();

        // Restore product stock
        const product = await Product.findById(order.product);
        if (product) {
            product.stock += order.quantity;
            product.soldCount = Math.max(0, (product.soldCount || 0) - order.quantity);
            await product.save();
        }

        res.json({
            success: true,
            message: "Refund processed successfully",
            data: order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET ORDER STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const totalOrders = await Order.countDocuments();
        const pendingOrders = await Order.countDocuments({ status: "pending" });
        const processingOrders = await Order.countDocuments({ status: "processing" });
        const shippedOrders = await Order.countDocuments({ status: "shipped" });
        const deliveredOrders = await Order.countDocuments({ status: "delivered" });
        const cancelledOrders = await Order.countDocuments({ status: "cancelled" });
        const returnedOrders = await Order.countDocuments({ status: "returned" });

        // Revenue stats
        const revenueData = await Order.aggregate([
            {
                $match: { 
                    status: { $in: ["delivered", "shipped"] },
                    "payment.status": "paid"
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalPrice" },
                    totalOrders: { $sum: 1 },
                    averageOrderValue: { $avg: "$totalPrice" }
                }
            }
        ]);

        // Daily orders for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyOrders = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    revenue: { $sum: "$totalPrice" }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        // Orders by payment method
        const paymentMethodStats = await Order.aggregate([
            {
                $group: {
                    _id: "$payment.method",
                    count: { $sum: 1 },
                    total: { $sum: "$totalPrice" }
                }
            }
        ]);

        const revenue = revenueData.length > 0 ? revenueData[0] : {
            totalRevenue: 0,
            totalOrders: 0,
            averageOrderValue: 0
        };

        res.json({
            success: true,
            data: {
                totalOrders,
                pendingOrders,
                processingOrders,
                shippedOrders,
                deliveredOrders,
                cancelledOrders,
                returnedOrders,
                revenue: {
                    total: revenue.totalRevenue || 0,
                    averageOrderValue: revenue.averageOrderValue || 0
                },
                dailyOrders,
                paymentMethodStats
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET ORDERS BY USER (Admin Only)
router.get("/admin/users/:userId/orders", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const orders = await Order.find({ user: req.params.userId })
            .populate("product", "name images thumbnail")
            .sort("-createdAt");

        res.json({
            success: true,
            count: orders.length,
            data: orders
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ❌ DELETE ORDER (Admin Only)
router.delete("/admin/orders/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Restore product stock if not cancelled/refunded
        if (order.status !== "cancelled" && order.status !== "returned") {
            const product = await Product.findById(order.product);
            if (product) {
                product.stock += order.quantity;
                product.soldCount = Math.max(0, (product.soldCount || 0) - order.quantity);
                await product.save();
            }
        }

        await order.deleteOne();

        res.json({
            success: true,
            message: "Order deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 📈 EXPORT ORDERS (Admin Only)
// ==============================

// 📊 EXPORT ORDERS AS CSV
router.get("/admin/export/csv", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { dateFrom, dateTo } = req.query;
        const filter = {};

        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const orders = await Order.find(filter)
            .populate("product", "name")
            .populate("user", "name email")
            .sort("-createdAt");

        // Create CSV header
        let csv = "Order ID,Customer,Email,Product,Quantity,Total,Status,Payment Method,Payment Status,Date\n";

        // Add data rows
        orders.forEach(order => {
            csv += `${order.orderId},"${order.user.name}","${order.user.email}","${order.product.name}",${order.quantity},${order.totalPrice},${order.status},${order.payment.method},${order.payment.status},${order.createdAt.toISOString()}\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=orders-${new Date().toISOString().split("T")[0]}.csv`);
        res.send(csv);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;