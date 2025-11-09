// backend/cron.js
require("dotenv").config();
require("./config/db"); // ensures DB connection works

console.log("🚀 Cron worker started...");

// Import only cron jobs (not Express server)
require("./cronJobs/dayCountDecrement");
require("./cronJobs/cleanup");
require("./cronJobs/dailyQuizInit");
require("./cronJobs/monthlyDeduction");
require("./cronJobs/dailyCheck");
require("./cronJobs/planDeduction");
require("./cronJobs/unverifyIfNoMpin");

console.log("✅ All cron jobs loaded successfully");
