// backend/cronJobs/cleanup.js
const cron = require("node-cron");
const pool = require("../config/db");


// Run daily at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    await pool.query("DELETE FROM quiz_history WHERE quiz_date < CURRENT_DATE - INTERVAL '90 days'");
    console.log("✅ Old quiz history cleaned up");
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
  }
});


// server/cronJobs/dailyCheck.js
import cron from "node-cron";
import fetch from "node-fetch";
import pool from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL;

// 🕛 Runs daily at 11:59 PM for maintenance cycle check
// cron.schedule("* * * * *", async () => {
  cron.schedule("59 23 * * *", async () => {

 console.log("🕛 Running daily maintenance cycle check (11:59 PM)...");


  try {
    const { rows: users } = await pool.query("SELECT id FROM sign_up");
    if (users.length === 0) {
      console.log("⚠️ No users found to process.");
      return;
    }

    for (const user of users) {
      const url = `${API_BASE_URL}/api/cron/manual-run/${user.id}?from=cron`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`❌ Failed for user ${user.id}: ${res.statusText}`);
        } else {
          console.log(`✅ Checked user ID ${user.id}`);
        }
      } catch (err) {
        console.error(`❌ Fetch error for user ${user.id}:`, err.message);
      }
    }

    console.log("✅ All user checks complete");
  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
}, {
  timezone: "UTC",
});

console.log("🟢 dailyCheck.js loaded and scheduled successfully");


// backend/cronJobs/dailyQuizInit.js
const cron = require("node-cron");
const pool = require("../config/db");

// Runs every day at midnight (00:00)
cron.schedule("0 0 * * *", async () => {
  console.log("🌅 Running daily quiz initialization...");

  try {
    // Insert today's quiz rows for all users if not already present
    const insertQuery = `
      INSERT INTO quiz_history (user_id, quiz_date)
      SELECT s.id, CURRENT_DATE
      FROM sign_up s
      WHERE NOT EXISTS (
        SELECT 1 FROM quiz_history q
        WHERE q.user_id = s.id
        AND q.quiz_date = CURRENT_DATE
      );
    `;

    const result = await pool.query(insertQuery);
    console.log(`✅ Daily quiz rows inserted successfully`);
  } catch (err) {
    console.error("❌ Error inserting daily quiz rows:", err.message);
  }
});


// backend/cronJobs/monthlyDeduction.js
const pool = require("../config/db");
const cron = require("node-cron");

// 💰 Plan prices
const planPrices = {
  "Silver": 60,
  "Gold 1": 100,
  "Gold 2": 200,
  "Premium 1": 500,
  "Premium 2": 1000,
  "Premium 3": 2000,
  "Premium 4": 5000,
  "Premium 5": 10000,
};

// 🧪 For testing: Runs every 1 minute
// cron.schedule("* * * * *", async () => {
//   console.log("⏰ Running plan testing cron...");
cron.schedule("59 23 * * *", async () => {
  console.log("⏰ Running daily maintenance cron at 11:59 PM...");

  try {
    const { rows: users } = await pool.query(`
      SELECT id, full_name, business_plan, coin, first_plan_date
      FROM sign_up
      WHERE business_plan IS NOT NULL
        AND business_plan != 'Bronze'
        AND first_plan_date IS NOT NULL
    `);

    const now = new Date();

    for (const user of users) {
      const { id, full_name, business_plan, coin, first_plan_date } = user;
      const planPrice = planPrices[business_plan];
      if (!planPrice) continue;

      const firstDate = new Date(first_plan_date);
      const daysPassed = Math.floor((now - firstDate) / (1000 * 60 * 60 * 24));

      console.log(`👤 User: ${full_name}, Days: ${daysPassed}, Plan: ${business_plan}`);

      // ✅ Day 1: Insert popup notification once
      // if (daysPassed === 1) {
      // if (daysPassed === 1 && coin >= planPrice * 0.10) {
      // ✅ Day 25–29: Show warning notification once per cycle
      if (daysPassed >= 25 && daysPassed <= 29 && coin >= planPrice * 0.10) {

        const { rowCount: alreadyWarned } = await pool.query(`
          SELECT 1 FROM notifications
          WHERE user_id = $1
            AND message LIKE '%Maintenance fee will be deducted soon%'
        `, [id]);

        if (alreadyWarned === 0) {
          await pool.query(`
            INSERT INTO notifications (user_id, message, type)
            VALUES ($1, '⚠️ Maintenance fee will be deducted in a few days!', 'warning')
          `, [id]);

          console.log(`⚠️ Popup notification created for ${full_name}`);
        }
      }

      // ✅ Day 2: Deduct once (check with different condition)
      // if (daysPassed === 2) {
      // ✅ Day 30: Deduct once
      if (daysPassed === 30) {

        const { rowCount: alreadyDeducted } = await pool.query(`
          SELECT 1 FROM notifications
          WHERE user_id = $1
            AND message LIKE '💸 Maintenance fee deducted:%'
        `, [id]);

        if (alreadyDeducted > 0) {
          console.log(`⏩ Already deducted for ${full_name}, skipping`);
          continue;
        }

        const fee = planPrice * 0.10;
        const newBalance = coin - fee;

        if (newBalance >= 0) {
          // ✅ DEDUCTION + RESET first_plan_date for next cycle
          await pool.query(`
            UPDATE sign_up SET coin = $1, first_plan_date = NOW()
            WHERE id = $2
          `, [newBalance, id]);

          await pool.query(`
            INSERT INTO notifications (user_id, message, type)
            VALUES ($1, '💸 Maintenance fee deducted: -$${fee.toFixed(2)}. New balance: $${newBalance.toFixed(2)}', 'deduction')
          `, [id]);

          console.log(`✅ Fee $${fee} deducted for ${full_name}, New balance: $${newBalance}`);
        } else {
          // 🟩 Auto downgrade immediately (allow balance to go negative)
          await pool.query(`
            UPDATE sign_up 
            SET business_plan = 'Bronze', first_plan_date = NULL, coin = $1
            WHERE id = $2
          `, [newBalance, id]);

          await pool.query(`
            INSERT INTO notifications (user_id, message, type)
            VALUES ($1, '⚠️ Insufficient balance. Auto downgraded to Bronze. Previous plan: ${business_plan}', 'downgrade')
          `, [id]);

          console.log(`⬇️ ${full_name} downgraded to Bronze (insufficient funds)`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
}, { timezone: "UTC" });

console.log("✅ Cron Job Loaded Successfully ✅");


// backend/cronJobs/planDeduction.js
const pool = require("../config/db");
const cron = require("node-cron");

// 💰 Define plan prices
const PLAN_PRICES = {
  Bronze: 10,
  Silver: 50,
  "Gold 1": 100,
  "Gold 2": 200,
  "Premium 1": 300,
  "Premium 2": 400,
  "Premium 3": 500,
  "Premium 4": 600,
  "Premium 5": 700,
};

// 🕛 Run daily at 12:10 PM (IST safe if you use timezone below)
// cron.schedule("10 12 * * *",
// 🕛 Run daily at 11:59 PM
 cron.schedule("59 23 * * *",
  async () => {
    console.log("🔁 Running daily plan deduction check...");

    try {
      const now = new Date();

      // Fetch all users with a plan start date
      const { rows: users } = await pool.query(`
        SELECT id, full_name, first_plan_date, business_plan, coin
        FROM sign_up
        WHERE first_plan_date IS NOT NULL
      `);

      for (const user of users) {
        const price = PLAN_PRICES[user.business_plan];
        if (!price) continue;

        const start = new Date(user.first_plan_date);
        const daysPassed = Math.floor((now - start) / (1000 * 60 * 60 * 24));

        // 🟡 1 day passed → send warning
        // if (daysPassed === 1) {
        // 🟡 Day 25–29 → send notification daily
 if (daysPassed >= 25 && daysPassed <= 29) {
          const warnMsg = `⚠️ Reminder: Your monthly ${user.business_plan} plan ($${(
            price * 0.1
          ).toFixed(2)}) fee will be deducted soon.`;

          await pool.query(
            `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
            [user.id, warnMsg, "warning"]
          );

          console.log(`📢 Sent warning to ${user.full_name}`);
        }

        // 🔴 2 days passed → deduct 10%
        // if (daysPassed === 2) {
        // 🔴 Day 30 → deduct 10%
 if (daysPassed === 30) {
          const deductAmount = price * 0.1;

          if (parseFloat(user.coin) >= deductAmount) {
            await pool.query(`UPDATE sign_up SET coin = coin - $1 WHERE id = $2`, [
              deductAmount,
              user.id,
            ]);

            const successMsg = `💳 10% (${deductAmount.toFixed(
              2
            )}$) has been deducted for your monthly ${user.business_plan} plan renewal.`;

            await pool.query(
              `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
              [user.id, successMsg, "deduct"]
            );

            console.log(`✅ Deducted ${deductAmount}$ from ${user.full_name}`);
          } else {
            const failMsg = `❌ Deduction failed! Not enough balance for ${user.business_plan} plan fee.`;

            await pool.query(
              `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
              [user.id, failMsg, "error"]
            );

            console.log(`⚠️ ${user.full_name} has insufficient balance`);
          }
        }
      }

      console.log("🎯 Plan deduction cron completed successfully.");
    } catch (error) {
      console.error("💥 Plan deduction cron error:", error.message);
    }
  },
  { timezone: "Asia/Kolkata" } // 🕐 ensure timing works in IST
);


const pool = require("../config/db");
const cron = require("node-cron");

const reminderNotification = () => {
  // Runs every day at 12:00 UTC
  cron.schedule("0 12 25-29 * *", async () => {
    console.log("🔔 Sending maintenance reminders...");

    const monthName = new Date().toLocaleString("en-US", { month: "long" });
    const message = `⚠️ On 30th ${monthName}, $6 will be deducted for account maintenance. Please ensure you have enough balance.`;

    try {
      const users = await pool.query("SELECT id FROM sign_up");

      for (const user of users.rows) {
        await pool.query(
          "INSERT INTO notifications (user_id, message, created_at) VALUES ($1, $2, NOW())",
          [user.id, message]
        );
      }

      console.log("✅ Reminders sent successfully.");
    } catch (error) {
      console.error("❌ Reminder notification error:", error.message);
    }
  }, { timezone: "UTC" });
};

module.exports = reminderNotification;


// backend/cronJobs/unverifyIfNoMpin.js
const pool = require("../config/db");
const cron = require("node-cron");

// Runs every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  try {
    const res = await pool.query(`
      UPDATE sign_up
      SET verified = false
      WHERE verified = true 
        AND (mpin IS NULL OR mpin = '')
        AND verified_at IS NOT NULL
        AND NOW() - verified_at > INTERVAL '1 hour'
      RETURNING email;
    `);

    if (res.rowCount > 0) {
      console.log(`⏰ Unverified ${res.rowCount} users (no MPIN set after 1h).`);
    }
  } catch (err) {
    console.error("❌ Error un-verifying users:", err.message);
  }
});
