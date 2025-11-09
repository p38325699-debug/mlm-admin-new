const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// POST /api/contact
router.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    await pool.query(
      "INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)",
      [name, email, message]
    );

    res.status(200).json({ success: true, message: "Message stored successfully!" });
  } catch (err) {
    console.error("❌ Error saving message:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------- 🟢 GET: Fetch all contact messages -------------------- */
router.get("/contact-messages", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.contact_messages ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------- 🔴 DELETE: Delete a message by ID -------------------- */
router.delete("/contact-messages/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM public.contact_messages WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json({
      success: true,
      message: "Message deleted successfully!",
    });
  } catch (err) {
    console.error("❌ Error deleting message:", err);
    res.status(500).json({ error: "Server error" });
  }
});



module.exports = router;
