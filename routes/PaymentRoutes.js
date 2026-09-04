const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Payment = require("../modules/PaymentSchema");
const Order = require("../modules/OrderSchema");
const User = require("../modules/UserSchema");
const passport = require("passport");
const crypto = require("crypto");

// ==============================
// 💳 PAYMENT ROUTES (Protected - User)
// ==============================





// 📥 GET USER PAYMENTS
router.get("/", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { page = 1, limit = 20, status, sort = "-createdAt" } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = { user: req.user._id };
        if (status) filter.status = status;

        const payments = await Payment.find(filter)
            .populate("order", "orderId totalPrice status")
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Payment.countDocuments(filter);

        res.json({
            success: true,
            data: payments,
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

// 📄 GET SINGLE PAYMENT
router.get("/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate("order", "orderId totalPrice status items")
            .populate("user", "name email");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Check if user owns the payment or is admin
        if (payment.user._id.toString() !== req.user._id.toString() && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "You can only view your own payments"
            });
        }

        res.json({
            success: true,
            data: payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💰 CREATE PAYMENT
router.post("/create", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const {
            orderId,
            amount,
            method,
            provider = "NONE",
            gatewayResponse
        } = req.body;

        // Validation
        if (!orderId || !amount || !method) {
            return res.status(400).json({
                success: false,
                message: "Order ID, amount, and payment method are required"
            });
        }

        // Check order exists and belongs to user
        const order = await Order.findOne({
            _id: orderId,
            user: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Check if payment already exists for this order
        const existingPayment = await Payment.findOne({ order: orderId });
        if (existingPayment) {
            return res.status(400).json({
                success: false,
                message: "Payment already exists for this order"
            });
        }

        // Generate transaction ID
        const transactionId = "TXN-" + Date.now().toString().slice(-8) + "-" + 
                             crypto.randomBytes(4).toString("hex").toUpperCase();

        // Create payment
        const payment = await Payment.create({
            order: orderId,
            user: req.user._id,
            amount: parseFloat(amount),
            method,
            provider: provider || "NONE",
            transactionId,
            status: method === "COD" ? "pending" : "processing",
            gatewayResponse: gatewayResponse || {},
            notes: req.body.notes || ""
        });

        // Update order with payment reference
        order.payment.transactionId = transactionId;
        order.payment.status = method === "COD" ? "pending" : "pending";
        await order.save();

        res.status(201).json({
            success: true,
            message: "Payment created successfully",
            data: payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💳 PROCESS PAYMENT
router.post("/:id/process", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate("order", "orderId totalPrice");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Check if user owns the payment
        if (payment.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only process your own payments"
            });
        }

        // Check payment status
        if (payment.status !== "pending" && payment.status !== "processing") {
            return res.status(400).json({
                success: false,
                message: `Payment cannot be processed. Current status: ${payment.status}`
            });
        }

        // Simulate payment processing
        // In production, integrate with payment gateway (Razorpay, Stripe, etc.)
        const isSuccess = Math.random() > 0.1; // 90% success rate for demo

        if (isSuccess) {
            payment.status = "success";
            payment.paidAt = new Date();
            payment.isVerified = true;
            
            // Update order payment status
            await Order.findByIdAndUpdate(payment.order, {
                "payment.status": "paid",
                "payment.paidAt": new Date(),
                isPaid: true
            });

            await payment.save();

            res.json({
                success: true,
                message: "Payment processed successfully",
                data: payment
            });
        } else {
            payment.status = "failed";
            payment.failureReason = "Payment gateway error (demo simulation)";
            await payment.save();

            // Update order payment status
            await Order.findByIdAndUpdate(payment.order, {
                "payment.status": "failed"
            });

            res.status(400).json({
                success: false,
                message: "Payment processing failed",
                data: payment
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔄 REFUND PAYMENT
router.post("/:id/refund", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const { amount, reason } = req.body;
        const payment = await Payment.findById(req.params.id)
            .populate("order", "orderId totalPrice status");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Check if user owns the payment
        if (payment.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only refund your own payments"
            });
        }

        // Check if payment can be refunded
        if (payment.status !== "success") {
            return res.status(400).json({
                success: false,
                message: `Payment cannot be refunded. Current status: ${payment.status}`
            });
        }

        if (payment.refund.status !== "none") {
            return res.status(400).json({
                success: false,
                message: `Refund already ${payment.refund.status}`
            });
        }

        const refundAmount = amount || payment.amount;
        if (refundAmount > payment.amount) {
            return res.status(400).json({
                success: false,
                message: "Refund amount cannot exceed payment amount"
            });
        }

        // Process refund
        payment.refund.status = "processed";
        payment.refund.amount = refundAmount;
        payment.refund.refundedAt = new Date();
        
        // Generate refund ID
        payment.refund.refundId = "REF-" + Date.now().toString().slice(-8) + "-" + 
                                  crypto.randomBytes(4).toString("hex").toUpperCase();

        // Update payment status
        if (refundAmount === payment.amount) {
            payment.status = "refunded";
        }

        // Update order
        await Order.findByIdAndUpdate(payment.order, {
            "payment.status": "refunded",
            isPaid: false,
            "refund.status": "completed",
            "refund.amount": refundAmount,
            "refund.reason": reason || "Refund requested by user"
        });

        await payment.save();

        res.json({
            success: true,
            message: "Refund processed successfully",
            data: payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET PAYMENT SUMMARY
router.get("/summary", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user._id });

        const summary = {
            totalPayments: payments.length,
            totalSpent: payments
                .filter(p => p.status === "success")
                .reduce((sum, p) => sum + p.amount, 0),
            totalRefunded: payments
                .filter(p => p.status === "refunded")
                .reduce((sum, p) => sum + p.amount, 0),
            pendingPayments: payments.filter(p => p.status === "pending").length,
            successfulPayments: payments.filter(p => p.status === "success").length,
            failedPayments: payments.filter(p => p.status === "failed").length,
            refundedPayments: payments.filter(p => p.status === "refunded").length,
            lastPayment: payments.length > 0 ? payments[payments.length - 1].createdAt : null,
            byMethod: {
                COD: payments.filter(p => p.method === "COD").length,
                CARD: payments.filter(p => p.method === "CARD").length,
                UPI: payments.filter(p => p.method === "UPI").length,
                NETBANKING: payments.filter(p => p.method === "NETBANKING").length,
                WALLET: payments.filter(p => p.method === "WALLET").length
            }
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

// 🔐 VERIFY PAYMENT (For payment gateway webhook)
router.post("/verify", async (req, res) => {
    try {
        const { paymentId, signature, status, transactionId, gatewayResponse } = req.body;

        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: "Payment ID is required"
            });
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Verify signature (simplified - implement actual verification based on gateway)
        // In production, use proper signature verification for Razorpay/Stripe
        const isVerified = true; // Placeholder

        if (isVerified) {
            payment.status = status || "success";
            payment.isVerified = true;
            payment.signature = signature || null;
            payment.transactionId = transactionId || payment.transactionId;
            payment.paidAt = new Date();
            payment.gatewayResponse = gatewayResponse || {};

            // Update order
            await Order.findByIdAndUpdate(payment.order, {
                "payment.status": "paid",
                "payment.transactionId": transactionId || payment.transactionId,
                "payment.paidAt": new Date(),
                isPaid: true
            });

            await payment.save();

            res.json({
                success: true,
                message: "Payment verified successfully",
                data: payment
            });
        } else {
            payment.status = "failed";
            payment.failureReason = "Signature verification failed";
            await payment.save();

            // Update order
            await Order.findByIdAndUpdate(payment.order, {
                "payment.status": "failed"
            });

            res.status(400).json({
                success: false,
                message: "Payment verification failed",
                data: payment
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET PAYMENT RECEIPT
router.get("/:id/receipt", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate("order", "orderId totalPrice status createdAt")
            .populate("user", "name email phone addresses");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        // Check if user owns the payment
        if (payment.user._id.toString() !== req.user._id.toString() && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "You can only view your own payment receipts"
            });
        }

        // Generate receipt data
        const receipt = {
            receiptId: payment.transactionId || payment._id,
            orderId: payment.order.orderId,
            date: payment.paidAt || payment.createdAt,
            amount: payment.amount,
            method: payment.method,
            status: payment.status,
            customer: {
                name: payment.user.name,
                email: payment.user.email,
                phone: payment.user.phone
            },
            items: payment.order.items || [],
            refund: payment.refund,
            gatewayResponse: payment.gatewayResponse
        };

        res.json({
            success: true,
            data: receipt
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==============================
// 👑 ADMIN PAYMENT ROUTES
// ==============================

// 📥 GET ALL PAYMENTS (Admin Only)
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
            method,
            provider,
            search,
            dateFrom,
            dateTo,
            sort = "-createdAt"
        } = req.query;

        const filter = {};

        if (status) filter.status = status;
        if (method) filter.method = method;
        if (provider) filter.provider = provider;
        if (search) {
            const userMatch = await User.find({
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            }).select("_id");
            
            const userIds = userMatch.map(u => u._id);
            filter.$or = [
                { user: { $in: userIds } },
                { transactionId: { $regex: search, $options: "i" } }
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

        const payments = await Payment.find(filter)
            .populate("order", "orderId totalPrice status")
            .populate("user", "name email phone")
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const total = await Payment.countDocuments(filter);

        // Calculate summary
        const summary = {
            totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
            successfulAmount: payments
                .filter(p => p.status === "success")
                .reduce((sum, p) => sum + p.amount, 0),
            refundedAmount: payments
                .filter(p => p.status === "refunded")
                .reduce((sum, p) => sum + p.amount, 0),
            pendingCount: payments.filter(p => p.status === "pending").length,
            processingCount: payments.filter(p => p.status === "processing").length,
            successCount: payments.filter(p => p.status === "success").length,
            failedCount: payments.filter(p => p.status === "failed").length,
            refundedCount: payments.filter(p => p.status === "refunded").length,
            cancelledCount: payments.filter(p => p.status === "cancelled").length
        };

        res.json({
            success: true,
            data: payments,
            summary,
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

// 📄 GET PAYMENT DETAILS (Admin Only)
router.get("/admin/getpaymentdetails/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const payment = await Payment.findById(req.params.id)
            .populate("order", "orderId totalPrice status items addresses")
            .populate("user", "name email phone addresses");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        res.json({
            success: true,
            data: payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ✏️ UPDATE PAYMENT STATUS (Admin Only)
router.put("/admin/updatepaymentstatus/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { status, failureReason, notes } = req.body;
        const validStatuses = ["pending", "processing", "success", "failed", "cancelled", "refunded"];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Valid status required: ${validStatuses.join(", ")}`
            });
        }

        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        payment.status = status;
        if (failureReason) payment.failureReason = failureReason;
        if (notes) payment.notes = notes;

        if (status === "success") {
            payment.paidAt = new Date();
            payment.isVerified = true;
        }

        if (status === "refunded") {
            payment.refund.status = "processed";
            payment.refund.refundedAt = new Date();
        }

        await payment.save();

        // Update order payment status
        const orderUpdate = {
            "payment.status": status
        };
        if (status === "success") {
            orderUpdate.isPaid = true;
            orderUpdate["payment.paidAt"] = new Date();
        }
        if (status === "refunded") {
            orderUpdate.isPaid = false;
        }

        await Order.findByIdAndUpdate(payment.order, orderUpdate);

        res.json({
            success: true,
            message: "Payment status updated",
            data: payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💰 PROCESS REFUND (Admin Only)
router.post("/admin/processrefund/:id", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { amount, reason } = req.body;
        const payment = await Payment.findById(req.params.id)
            .populate("order", "orderId totalPrice");

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        if (payment.status !== "success") {
            return res.status(400).json({
                success: false,
                message: `Payment cannot be refunded. Current status: ${payment.status}`
            });
        }

        const refundAmount = amount || payment.amount;
        if (refundAmount > payment.amount) {
            return res.status(400).json({
                success: false,
                message: "Refund amount cannot exceed payment amount"
            });
        }

        payment.refund.status = "processed";
        payment.refund.amount = refundAmount;
        payment.refund.refundedAt = new Date();
        payment.refund.refundId = "REF-" + Date.now().toString().slice(-8) + "-" + 
                                 crypto.randomBytes(4).toString("hex").toUpperCase();

        if (refundAmount === payment.amount) {
            payment.status = "refunded";
        }

        await payment.save();

        // Update order
        await Order.findByIdAndUpdate(payment.order, {
            "payment.status": "refunded",
            isPaid: false,
            "refund.status": "completed",
            "refund.amount": refundAmount,
            "refund.reason": reason || "Refund processed by admin"
        });

        res.json({
            success: true,
            message: "Refund processed successfully",
            data: payment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📊 GET PAYMENT STATISTICS (Admin Only)
router.get("/admin/stats", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }


        // Overall stats
        const totalPayments = await Payment.countDocuments();
        const totalRevenue = await Payment.aggregate([
            { $match: { status: "success" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const totalRefunded = await Payment.aggregate([
            { $match: { status: "refunded" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        // Payment status distribution
        const statusDistribution = await Payment.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        // Payment method distribution
        const methodDistribution = await Payment.aggregate([
            {
                $group: {
                    _id: "$method",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        // Daily payments for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyPayments = await Payment.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    status: "success"
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        // Monthly revenue trend
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRevenue = await Payment.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo },
                    status: "success"
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            }
        ]);

        // Average payment amount
        const averagePayment = await Payment.aggregate([
            { $match: { status: "success" } },
            { $group: { _id: null, avg: { $avg: "$amount" } } }
        ]);

        res.json({
            success: true,
            data: {
                totalPayments,
                totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
                totalRefunded: totalRefunded.length > 0 ? totalRefunded[0].total : 0,
                netRevenue: (totalRevenue.length > 0 ? totalRevenue[0].total : 0) - 
                           (totalRefunded.length > 0 ? totalRefunded[0].total : 0),
                statusDistribution,
                methodDistribution,
                dailyPayments,
                monthlyRevenue,
                averagePayment: averagePayment.length > 0 ? averagePayment[0].avg : 0
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 GET USER PAYMENTS (Admin Only)
router.get("/admin/users/:userId", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const payments = await Payment.find({ user: req.params.userId })
            .populate("order", "orderId totalPrice status")
            .sort("-createdAt");

        const summary = {
            totalPayments: payments.length,
            totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
            successfulPayments: payments.filter(p => p.status === "success").length,
            refundedPayments: payments.filter(p => p.status === "refunded").length,
            failedPayments: payments.filter(p => p.status === "failed").length
        };

        res.json({
            success: true,
            summary,
            data: payments
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📥 EXPORT PAYMENTS (Admin Only)
router.get("/admin/export/csv", passport.authenticate("jwt", { session: false }), async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin only."
            });
        }

        const { dateFrom, dateTo, status, method } = req.query;
        const filter = {};

        if (status) filter.status = status;
        if (method) filter.method = method;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const payments = await Payment.find(filter)
            .populate("user", "name email")
            .populate("order", "orderId")
            .sort("-createdAt");

        // Create CSV header
        let csv = "Transaction ID,Order ID,Customer,Email,Amount,Method,Provider,Status,Payment Date,Refund Status\n";

        // Add data rows
        payments.forEach(payment => {
            csv += `"${payment.transactionId || payment._id}","${payment.order?.orderId || 'N/A'}","${payment.user?.name || 'N/A'}","${payment.user?.email || 'N/A'}",${payment.amount},${payment.method},${payment.provider},${payment.status},"${payment.paidAt ? payment.paidAt.toISOString() : 'N/A'}","${payment.refund.status}"\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=payments-${new Date().toISOString().split("T")[0]}.csv`);
        res.send(csv);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;