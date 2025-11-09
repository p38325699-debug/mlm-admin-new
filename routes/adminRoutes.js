// backend/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// Get all users
router.get("/all-users", async (req, res) => {
  try {

    const result = await pool.query(
  `SELECT id, full_name, email, phone_number, dob, country_code, gender, business_plan, reference_code, verified, coin, created_at, status, pause_start
   FROM sign_up
   ORDER BY id ASC`
);


    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Server error" });
  }
});


// Update user wallet
router.put("/users/:id/wallet", async (req, res) => {
  const { id } = req.params;
  const { coin } = req.body;

  if (coin === undefined) {
    return res.status(400).json({ success: false, message: "Coin is required" });
  }

  try {
    await pool.query(
      `UPDATE sign_up SET coin = $1 WHERE id = $2`,
      [coin, id]
    );
    res.json({ success: true, message: "Wallet updated successfully" });
  } catch (err) {
    console.error("Error updating wallet:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Update user status (Pause / Block / All ok)
router.put("/users/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: "Status is required" });
  }

  try {
    if (status === "Pause") {
      await pool.query(
        `UPDATE sign_up SET status = $1, pause_start = NOW() WHERE id = $2`,
        [status, id]
      );
    } else {
      await pool.query(
        `UPDATE sign_up SET status = $1, pause_start = NULL WHERE id = $2`,
        [status, id]
      );
    }

    res.json({ success: true, message: `User status updated to '${status}'` });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete user permanently
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(`DELETE FROM sign_up WHERE id = $1`, [id]);
    res.json({ success: true, message: "User deleted permanently" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Fetch all plan purchases
router.get("/plan-purchases", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, user_id, email, plan, buy_date FROM plan_purchases ORDER BY buy_date DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching plan purchases:", err);
    res.status(500).json({ message: "Server Error" });
  }
});


module.exports = router;
