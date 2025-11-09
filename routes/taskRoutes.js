const express = require("express");
const quizController = require("../controllers/quizController");
const videoController = require("../controllers/videoController");

const router = express.Router();

// === QUIZ ROUTES ===
router.post("/tasks/quizzes", quizController.createQuiz); // matches frontend
router.get("/quizzes", quizController.getQuizzes);
router.delete("/quizzes/:id", quizController.deleteQuiz);

// === VIDEO ROUTES ===
router.post("/videos", videoController.createVideo);
router.get("/videos", videoController.getVideos);
router.delete("/videos/:id", videoController.deleteVideo);

module.exports = router;
