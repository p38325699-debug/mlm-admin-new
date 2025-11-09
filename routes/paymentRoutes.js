// backend/routes/paymentRoutes.js
const path = require("path");
const express = require("express");
const router = express.Router();
const { upgradePlan } = require("../controllers/paymentController");
const multer = require("multer");

// Configure multer for better file handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
  }
});

const upload = multer({  
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Add route logging middleware
router.use((req, res, next) => {
  console.log(`Payment route hit: ${req.method} ${req.path}`);
  next();
});

router.post("/upgrade", upload.single("screenshot"), upgradePlan);

module.exports = router;