// backend/routes/manualCronTrigger.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

/**
 * 🧩 API: Deduct 1 day for all users (but not below 0)
 * Example: GET http://localhost:5000/api/test/day-decrement
 */
router.get("/day-decrement", async (req, res) => {
  console.log("🚀 Manual day decrement started...");

  try {
    // ✅ Run update query in one go
    const result = await pool.query(`
      UPDATE sign_up
      SET day_count = CASE 
        WHEN day_count > 0 THEN day_count - 1 
        ELSE 0 
      END
      RETURNING id, full_name, day_count;
    `);

    // ✅ Count affected rows
    const updatedCount = result.rowCount;

    console.log(`✅ Day decrement complete for ${updatedCount} users.`);

    // ✅ Return success HTML for browser
    res.send(`
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color: green;">✅ Day Decrement Successful</h2>
        <p><strong>${updatedCount}</strong> users updated.</p>
        <small>Triggered at ${new Date().toLocaleString()}</small>
      </div>
    `);
  } catch (err) {
    console.error("❌ Day decrement failed:", err.message);
    res.status(500).send(`
      <div style="font-family: Arial; color: red; padding: 20px;">
        <h3>❌ Day decrement failed</h3>
        <p>${err.message}</p>
      </div>
    `);
  }
});

module.exports = router;
