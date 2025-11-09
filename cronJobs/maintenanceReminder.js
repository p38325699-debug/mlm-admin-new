// // backend/cronJobs/maintenanceReminder.js
// const pool = require("../config/db");
// const cron = require("node-cron");

// // cron.schedule("0 12 * * *", async () => {
//   cron.schedule("59 23 * * *", async () => {
//   console.log("🔔 Checking for maintenance reminders...");

//   try {
//     // Calculate date thresholds
//     const today = new Date();
//     const twentyFiveDaysAgo = new Date();
//     twentyFiveDaysAgo.setDate(today.getDate() - 25);
    
//     const thirtyDaysAgo = new Date(); 
//     thirtyDaysAgo.setDate(today.getDate() - 30);

//     // Find users who reached 25 days since first_plan_date
//     const usersDueForReminder = await pool.query(
//   `SELECT id, first_plan_date, email 
//    FROM sign_up 
//    WHERE first_plan_date IS NOT NULL
//    AND DATE(first_plan_date) <= $1
//    AND DATE(first_plan_date) > $2`,
//   [
//     twentyFiveDaysAgo.toISOString().split('T')[0],
//     thirtyDaysAgo.toISOString().split('T')[0]
//   ]
// );


//     console.log(`📊 Found ${usersDueForReminder.rows.length} users due for reminder`);

//     // Send notifications
//     for (const user of usersDueForReminder.rows) {
//       const monthName = new Date().toLocaleString("en-US", { month: "long" });
//       const message = `⚠️ On 30th ${monthName}, $6 will be deducted for account maintenance. Please ensure your wallet has enough balance.`;
      
//       await pool.query(
//         "INSERT INTO notifications (user_id, message, created_at) VALUES ($1, $2, NOW())",
//         [user.id, message]
//       );
      
//       console.log(`✅ Reminder sent to user ${user.id}`);
//     }

//     // Process deductions for users who reached 30 days
//     const usersDueForDeduction = await pool.query(
//       `SELECT id, first_plan_date, coin 
//        FROM sign_up 
//        WHERE first_plan_date IS NOT NULL 
//        AND DATE(first_plan_date) = $1
//        AND coin >= 6`,
//       [thirtyDaysAgo.toISOString().split('T')[0]]
//     );

//     console.log(`💰 Processing deductions for ${usersDueForDeduction.rows.length} users`);

//     for (const user of usersDueForDeduction.rows) {
//       // Deduct $6 from coin balance
//       await pool.query(
//         "UPDATE sign_up SET coin = coin - 6 WHERE id = $1",
//         [user.id]
//       );

//       // Record the transaction
//       await pool.query(
//         `INSERT INTO transactions (user_id, amount, type, description, created_at) 
//          VALUES ($1, 6, 'deduction', 'Monthly maintenance fee', NOW())`,
//         [user.id]
//       );

//       // Send deduction notification
//       await pool.query(
//         "INSERT INTO notifications (user_id, message, created_at) VALUES ($1, $2, NOW())",
//         [user.id, "💳 $6 has been deducted from your account for monthly maintenance."]
//       );

//       console.log(`✅ $6 deducted from user ${user.id}`);
//     }

//     console.log("🎯 Maintenance reminder process completed.");
//   } catch (error) {
//     console.error("❌ Error in maintenance reminder process:", error.message);
//   }
// }, { timezone: "Asia/Kolkata" });