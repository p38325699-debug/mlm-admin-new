// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

/* -------------------------------------------------------------------------- */
/* 🟢 CORS Configuration (Render + Local + Admin Frontend)                   */
/* -------------------------------------------------------------------------- */
const allowedOrigins = [
  "http://localhost:5173",
  "https://knowo.world",
  "https://www.knowo.world",
  "https://mlm-admin.onrender.com",
  "https://admin-front-tx87.onrender.com"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* -------------------------------------------------------------------------- */
/* 🟠 Detect Browser Requests                                                 */
/* -------------------------------------------------------------------------- */
app.use((req, res, next) => {
  const ua = req.headers["user-agent"] || "";
  req.isBrowserRequest = /mozilla|chrome|safari|firefox|edge|opera/i.test(
    ua.toLowerCase()
  );
  next();
});

/* -------------------------------------------------------------------------- */
/* 🟣 Body Parsing + Static Files                                             */
/* -------------------------------------------------------------------------- */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/videos", express.static(path.join(__dirname, "uploads/videos")));

/* -------------------------------------------------------------------------- */
/* 🔵 Request Logger                                                          */
/* -------------------------------------------------------------------------- */
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.url}`);
  next();
});

/* -------------------------------------------------------------------------- */
/* 🟡 Import Routes                                                           */
/* -------------------------------------------------------------------------- */
const authRoutes = require("./routes/authRoutes");
const otpRoutes = require("./routes/otpRoutes");
const adminRoutes = require("./routes/adminRoutes");
const homeDataRoutes = require("./routes/homeDataRoutes");
const quizRoutes = require("./routes/quizRoutes");
const userRoutes = require("./routes/userRoutes");
const referralRoutes = require("./routes/referralRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const coinRoutes = require("./routes/coinRoutes");
const planRoutes = require("./routes/planRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const upiRoutes = require("./routes/upiRoutes");
const walletRoutes = require("./routes/walletRoutes");
const dashboardRoutes = require("./routes/dashboard");
const cryptoRoutes = require("./routes/cryptoRoutes");
const contactRoutes = require("./routes/contactRoutes");
const mpinRoutes = require("./routes/mpinRoutes");
const cronRoutes = require("./routes/cronRoutes");
const rewardRoutes = require("./routes/rewardRoutes");
const goldRewardsRoutes = require("./routes/goldRewards");
const manualCronTrigger = require("./routes/manualCronTrigger");
const adminCronRoutes = require('./routes/adminCronRoutes');


/* -------------------------------------------------------------------------- */
/* 🧭 Mount Routes                                                            */
/* -------------------------------------------------------------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", homeDataRoutes);
app.use("/api", quizRoutes);
app.use("/api/users", userRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api", coinRoutes);
app.use("/api/plan", planRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", upiRoutes);
app.use("/api", walletRoutes);
app.use("/api", cryptoRoutes);
app.use("/api", contactRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", mpinRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api", rewardRoutes);
app.use("/api/gold-rewards", goldRewardsRoutes);
app.use("/api/test", manualCronTrigger);
app.use('/api/admin', adminCronRoutes);

/* -------------------------------------------------------------------------- */
/* 🕒 Cron Jobs                                                               */
/* -------------------------------------------------------------------------- */
// require("./cronJobs/dayCountDecrement");
// require("./cronJobs/cleanup");
// require("./cronJobs/dailyQuizInit");
// require("./cronJobs/monthlyDeduction");
// require("./cronJobs/maintenanceReminder");
// require("./cronJobs/dailyCheck");
// require("./cronJobs/planDeduction");
// require("./cronJobs/unverifyIfNoMpin");
// require("./utils/cronJobs");

/* -------------------------------------------------------------------------- */
/* 🚀 Start Server                                                            */
/* -------------------------------------------------------------------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* -------------------------------------------------------------------------- */
/* 🧠 Root Health Check                                                       */
/* -------------------------------------------------------------------------- */
app.get("/", (req, res) => {
  res.json({ success: true, message: "Backend is running 🚀" });
});
