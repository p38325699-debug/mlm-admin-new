const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // adjust path to your DB config

// 🟡 Fetch all Gold1 reward data with user info
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        g.id,
        g.user_id,
        s.full_name,
        s.email,
        g.milestone,
        g.reward,
        g.rewarded_at
      FROM gold1_rewards g
      JOIN sign_up s ON g.user_id = s.id
      ORDER BY g.rewarded_at DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching gold1 rewards:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
