// routes/homeDataRoutes.js
const express = require("express");
const multer = require("multer");
const pool = require("../config/db");

const router = express.Router();

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// POST /api/home-data - Store image as bytea in database
router.post("/home-data", upload.single("banner"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { buffer, originalname, mimetype, size } = req.file;

    // Insert image data as bytea into database
    const result = await pool.query(
      `INSERT INTO home_data (banner_data, banner_name, banner_type, banner_size) 
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [buffer, originalname, mimetype, size]
    );

    res.json({ 
      success: true, 
      message: "Banner uploaded successfully",
      id: result.rows[0].id
    });
  } catch (err) {
    console.error("Error inserting banner:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/home-data - Retrieve all banners
router.get("/home-data", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, banner_data, banner_name, banner_type, banner_size, created_at 
       FROM home_data 
       ORDER BY created_at DESC`
    );

    // Convert bytea to base64 data URLs for frontend
    const banners = result.rows.map(row => ({
      id: row.id,
      banner_url: `data:${row.banner_type};base64,${row.banner_data.toString('base64')}`,
      banner_name: row.banner_name,
      banner_type: row.banner_type,
      banner_size: row.banner_size,
      created_at: row.created_at
    }));

    res.json(banners);
  } catch (err) {
    console.error("Error fetching banners:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/home-data/image/:id - Get specific banner image
router.get("/home-data/image/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT banner_data, banner_type, banner_name 
       FROM home_data WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    const banner = result.rows[0];
    
    // Set appropriate headers and send the image data directly
    res.set({
      'Content-Type': banner.banner_type,
      'Content-Disposition': `inline; filename="${banner.banner_name}"`,
      'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
    });
    
    res.send(banner.banner_data);
  } catch (err) {
    console.error("Error fetching banner image:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /api/home-data/:id
router.delete("/home-data/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM home_data WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (err) {
    console.error("Error deleting banner:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;