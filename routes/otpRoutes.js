// routes/otpRoutes.js
const express = require("express");
const router = express.Router();
const otpController = require("../controllers/otpController");

// Send OTP
router.post("/send", otpController.sendOtp);

// Verify OTP
router.post("/verify", otpController.verifyOtp);

module.exports = router;
 