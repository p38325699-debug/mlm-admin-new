//  backend/routes/quizRoutes.js
const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const multer = require("multer");
const path = require("path");
const pool = require("../config/db");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => 
    cb(null, Date.now() + path.extname(file.originalname)),
});
  
const upload = multer({ storage });

// Quiz routes
router.post("/quizzes", quizController.addQuiz);
router.get("/quizzes", quizController.getQuizzes);
router.delete("/quizzes/:id", (req, res) => {
  req.params.type = "quiz";
  quizController.deleteItem(req, res);
});
 
// Video routes
router.post("/videos", upload.single("videoFile"), quizController.addVideo); // <-- updated
router.delete("/videos/:id", (req, res) => {
  req.params.type = "video";
  quizController.deleteItem(req, res);
}); 

router.get("/start/:userId", (req, res) => { 
  res.json({
    message: "Use POST method instead of GET to start quiz.",
    example: "POST /api/quiz/start/15",
  });
});
 
// Start quiz
// router.post("/start/:userId", async (req, res) => {
//  const { userId } = req.params;
//   try {
//     if (!userId) {
//       return res.status(400).json({ success: false, message: "User ID required" });
//     }

//     const today = new Date().toISOString().split("T")[0];
//     const check = await pool.query(
//       `SELECT * FROM quiz_history WHERE user_id = $1 AND quiz_date = $2`,
//       [userId, today]
//     );

//     if (check.rowCount > 0) {
//       return res.json({
//         success: true,
//         canPlay: false,
//         message: "You have already played today's quiz.",
//       });
//     }

//     await pool.query(
//       `INSERT INTO quiz_history (user_id, quiz_date, score, correct_answers, credit_amount)
//        VALUES ($1, $2, 0, 0, 0)`,
//       [userId, today]
//     );

//     res.json({ success: true, canPlay: true, message: "Quiz started successfully" });
//   } catch (err) {
//     console.error("❌ Error starting quiz:", err.message);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// ✅ Start quiz - set click_time when user clicks play
// router.post("/start/:userId", async (req, res) => {
//   const { userId } = req.params;

//   try {
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User ID required",
//       });
//     }

//     const today = new Date().toISOString().split("T")[0];

//     // 🧠 Check if user already has click_time for today
//     const check = await pool.query(
//       `SELECT click_time FROM quiz_history WHERE user_id = $1 AND quiz_date = $2`,
//       [userId, today]
//     );

//     if (check.rowCount > 0 && check.rows[0].click_time !== null) {
//       return res.json({
//         success: false,
//         canPlay: false,
//         message: "You have already played today's quiz.",
//       });
//     }

//     // 🟢 INSERT or UPDATE with click_time
//     if (check.rowCount === 0) {
//       // First time - insert new record with click_time
//       await pool.query(
//         `INSERT INTO quiz_history (user_id, quiz_date, score, correct_answers, credit_amount, click_time)
//          VALUES ($1, $2, 0, 0, 0, NOW())`,
//         [userId, today]
//       );
//     } else {
//       // Record exists but click_time is null - update it
//       await pool.query(
//         `UPDATE quiz_history SET click_time = NOW() 
//          WHERE user_id = $1 AND quiz_date = $2`,
//         [userId, today]
//       );
//     }

//     res.json({
//       success: true,
//       canPlay: true,
//       message: "Quiz started successfully",
//     });
//   } catch (err) {
//     console.error("❌ Error starting quiz:", err.message);
//     res.status(500).json({ success: false, message: "Server error during quiz start" });
//   }
// });

// ✅ Start quiz - only set click_time, do not modify day_count
router.post("/start/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID required",
      });
    }

    const today = new Date().toISOString().split("T")[0];

    // Check if already played today
    const check = await pool.query(
      `SELECT click_time FROM quiz_history WHERE user_id = $1 AND quiz_date = $2`,
      [userId, today]
    );

    if (check.rowCount > 0 && check.rows[0].click_time !== null) {
      return res.json({
        success: false,
        canPlay: false,
        message: "You have already played today's quiz.",
      });
    }

    if (check.rowCount === 0) {
      await pool.query(
        `INSERT INTO quiz_history (user_id, quiz_date, score, correct_answers, credit_amount, click_time)
         VALUES ($1, $2, 0, 0, 0, NOW())`,
        [userId, today]
      );
    } else {
      await pool.query(
        `UPDATE quiz_history SET click_time = NOW() 
         WHERE user_id = $1 AND quiz_date = $2`,
        [userId, today]
      );
    }

    return res.json({
      success: true,
      canPlay: true,
      message: "Quiz started successfully",
    });
  } catch (err) {
    console.error("❌ Error starting quiz:", err.message);
    res.status(500).json({ success: false, message: "Server error during quiz start" });
  }
});


// ✅ Check if user can play based on click_time
router.get("/check/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      `SELECT click_time 
         FROM quiz_history 
        WHERE user_id = $1 
          AND quiz_date = $2
        LIMIT 1`,
      [userId, today]
    );

    // 🟢 If no record OR click_time is null → allow to play
    if (result.rows.length === 0 || result.rows[0].click_time === null) {
      return res.json({
        success: true,
        canPlay: true,
        message: "You can start today's quiz!",
      });
    }

    // 🔴 If click_time is NOT null → restrict
    return res.json({
      success: true,
      canPlay: false,
      message: "You have already played today's quiz. Try again tomorrow!",
    });

  } catch (error) {
    console.error("❌ Error checking quiz eligibility:", error);
    return res.status(500).json({
      success: false,
      canPlay: false,
      message: "Server error while checking quiz eligibility.",
    });
  }
});


// Admin: fetch quizzes + videos
router.get("/quiz-with-videos", quizController.getQuizWithVideos);

// Coins
router.get("/coins/:userId", quizController.getCoins);
router.post("/update-coins", quizController.updateCoins);

router.post("/save-quiz-history", quizController.saveQuizHistory);
router.get("/today-quiz/:userId", quizController.getTodayQuizHistory);
router.delete("/cleanup-history", quizController.cleanupOldQuizHistory);


// router.get("/history/:userId", async (req, res) => {
//   const { userId } = req.params;
//   const { from, to } = req.query;

//   try {
//     let query = "SELECT * FROM quiz_history WHERE user_id = $1";
//     const params = [userId];

//     if (from && to) {
//       query += " AND DATE(quiz_date) BETWEEN $2 AND $3";
//       params.push(from, to);
//     }

//     query += " ORDER BY quiz_date DESC";

//     const result = await pool.query(query, params);
//     res.json({ success: true, history: result.rows });
//   } catch (err) {
//     console.error("Error fetching quiz history:", err);
//     res.status(500).json({ success: false });
//   }
// });

router.get("/history/:userId", async (req, res) => {
  const { userId } = req.params;
  const { from, to } = req.query;

  try {
    let query = "SELECT * FROM quiz_history WHERE user_id = $1 AND correct_answers > 0";
    const params = [userId];

    if (from && to) {
      query += " AND DATE(quiz_date) BETWEEN $2 AND $3";
      params.push(from, to);
    }

    query += " ORDER BY quiz_date DESC";

    const result = await pool.query(query, params);
    res.json({ success: true, history: result.rows });
  } catch (err) {
    console.error("Error fetching quiz history:", err);
    res.status(500).json({ success: false });
  } 
});

module.exports = router;
