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