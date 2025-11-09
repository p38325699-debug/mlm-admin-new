// backend/routes/coinRoutes.js
const express = require("express");
const router = express.Router();
const { updateCoins, getCoins } = require("../controllers/quizController");

// POST /api/update-coins
router.post("/update-coins", updateCoins);

// GET /api/get-coins/:userId
router.get("/get-coins/:userId", getCoins);

module.exports = router;
