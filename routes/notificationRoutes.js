// 🟩 routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// --- 🟢 GET all notifications for Admin (with user name + email)
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        n.id,
        n.user_id,
        s.full_name,
        s.email,
        n.message,
        n.created_at
      FROM notifications n
      JOIN sign_up s ON n.user_id = s.id
      ORDER BY n.created_at DESC
    `);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching notifications:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 🟡 GET all notifications for a specific user
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching notifications:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 🟠 POST a new notification
router.post("/", async (req, res) => {
  try {
    const { user_id, message } = req.body;

    if (!user_id || !message)
      return res
        .status(400)
        .json({ success: false, message: "user_id and message are required" });

    await pool.query(
      "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
      [user_id, message]
    );

    res.json({ success: true, message: "Notification added" });
  } catch (err) {
    console.error("Error adding notification:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 🔴 DELETE a specific notification
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const del = await pool.query("DELETE FROM notifications WHERE id = $1", [
      id,
    ]);

    if (del.rowCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });

    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    console.error("Error deleting notification:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- 🔵 DELETE all notifications for a user
router.delete("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
    res.json({ success: true, message: "All notifications cleared" });
  } catch (err) {
    console.error("Error clearing notifications:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/mark-read/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1", [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error marking as read" });
  }
});

router.get("/unread-count/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
      [userId]
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});


// --- 🟢 UPDATE (Edit) a notification message
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message)
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });

    const result = await pool.query(
      "UPDATE notifications SET message = $1 WHERE id = $2 RETURNING *",
      [message, id]
    );

    if (result.rowCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });

    res.json({
      success: true,
      message: "Notification updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating notification:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
