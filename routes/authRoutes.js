// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { loginUser, forgotPassword, resetPassword, verifyResetToken } = require("../controllers/authController");
const { sendOtp } = require("../controllers/otpController");

// Registration route (OTP)
router.post("/register", sendOtp);

// Login route
router.post("/login", loginUser);

// Password reset routes
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-token", verifyResetToken);

module.exports = router;