// backend/routes/adminCronRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// Manual cleanup trigger - Delete data older than 45 days
router.post("/manual-cleanup", async (req, res) => {
  try {
    console.log("🔄 Manual cleanup triggered - Deleting data older than 45 days");
    
    // Calculate date 45 days ago from today
    const deleteResult = await pool.query(
      "DELETE FROM quiz_history WHERE quiz_date < CURRENT_DATE - INTERVAL '45 days'"
    );
    
    // Get the cutoff date for the response message
    const cutoffDateResult = await pool.query(
      "SELECT TO_CHAR(CURRENT_DATE - INTERVAL '45 days', 'DD-Mon-YYYY') as cutoff_date"
    );
    const cutoffDate = cutoffDateResult.rows[0].cutoff_date;
    
    // Log this action
    await pool.query(
      "INSERT INTO admin_actions (action, performed_by, details) VALUES ($1, $2, $3)",
      ["manual_cleanup", "admin", `Cleaned up ${deleteResult.rowCount} records older than ${cutoffDate}`]
    );
    
    res.json({ 
      success: true, 
      message: `✅ Cleanup completed! Deleted ${deleteResult.rowCount} records older than ${cutoffDate} (45 days ago)` 
    });
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual daily check trigger - Deduct 1 from day_count for all users
router.post("/manual-daily-check", async (req, res) => {
  try {
    console.log("🔄 Manual daily check triggered - Deducting 1 from day_count");
    
    // First, check if day_count column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='sign_up' AND column_name='day_count'
    `);
    
    if (columnCheck.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "❌ 'day_count' column does not exist in sign_up table" 
      });
    }

    // Deduct 1 from day_count for all users (only if day_count > 0)
    const updateResult = await pool.query(`
      UPDATE sign_up 
      SET day_count = GREATEST(day_count - 1, 0)
      WHERE day_count > 0
    `);
    
    // Get count of users who were updated
    const affectedUsers = await pool.query(`
      SELECT COUNT(*) as updated_count FROM sign_up WHERE day_count > 0
    `);
    
    const updatedCount = affectedUsers.rows[0].updated_count;

    // Log this action
    await pool.query(
      "INSERT INTO admin_actions (action, performed_by, details) VALUES ($1, $2, $3)",
      ["manual_daily_check", "admin", `Deducted 1 day from ${updateResult.rowCount} users. ${updatedCount} users still have positive day_count`]
    );

    res.json({ 
      success: true, 
      message: `✅ Daily check completed! Deducted 1 day from ${updateResult.rowCount} users. ${updatedCount} users still have days remaining.` 
    });
  } catch (err) {
    console.error("❌ Daily check failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual quiz init trigger - Creates today's quizzes (NO NEED - but keeping for compatibility)
router.post("/manual-quiz-init", async (req, res) => {
  try {
    console.log("🔄 Manual quiz init triggered - No action needed as per requirements");
    
    res.json({ 
      success: true, 
      message: "✅ Quiz initialization not required - This function is disabled as per requirements" 
    });
  } catch (err) {
    console.error("❌ Quiz init failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual monthly deduction trigger - Process maintenance fees
router.post("/manual-monthly-deduction", async (req, res) => {
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

  try {
    console.log("🔄 Manual monthly deduction triggered");
    
    // Get all users with plans (excluding Bronze) who have first_plan_date
    const { rows: users } = await pool.query(`
      SELECT id, full_name, business_plan, coin, first_plan_date
      FROM sign_up
      WHERE business_plan IS NOT NULL
        AND business_plan != 'Bronze'
        AND first_plan_date IS NOT NULL
    `);

    const processedUsers = [];
    const notificationUsers = [];
    const downgradedUsers = [];
    const deductedUsers = [];

    const currentDate = new Date();

    for (const user of users) {
      const { id, full_name, business_plan, coin, first_plan_date } = user;
      const planPrice = planPrices[business_plan];
      
      if (!planPrice) {
        processedUsers.push({ 
          userId: id, 
          name: full_name, 
          action: "skipped", 
          reason: `Unknown plan: ${business_plan}` 
        });
        continue;
      }

      const startDate = new Date(first_plan_date);
      const daysDifference = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
      const fee = planPrice * 0.10;

      // Convert coin to number to handle numeric type properly
      const currentBalance = parseFloat(coin);
      const newBalance = currentBalance - fee;

      console.log(`👤 User: ${full_name}, Days: ${daysDifference}, Plan: ${business_plan}, Fee: $${fee}, Current Balance: $${currentBalance}, New Balance: $${newBalance}`);

      // If 25-30 days passed - Send notification only
      if (daysDifference >= 25 && daysDifference <= 30) {
        const daysRemaining = 31 - daysDifference;
        const notificationMessage = `⚠️ Maintenance fee of $${fee.toFixed(2)} for your ${business_plan} plan will be deducted in ${daysRemaining} days. Please maintain sufficient balance.`;
        
        await pool.query(
          `INSERT INTO notifications (user_id, message, type, created_at) 
           VALUES ($1, $2, 'warning', NOW())`,
          [id, notificationMessage]
        );

        notificationUsers.push({ 
          userId: id, 
          name: full_name, 
          plan: business_plan,
          action: "notification_sent", 
          days: daysDifference,
          days_remaining: daysRemaining,
          message: notificationMessage
        });

        console.log(`📢 Notification sent to ${full_name}: ${notificationMessage}`);
      }
      // If 31+ days passed - ALWAYS deduct fee
      else if (daysDifference >= 31) {
        // Check if user has enough balance to stay in current plan
        if (currentBalance >= fee) {
          // User has enough balance - deduct fee and keep plan, reset first_plan_date
          await pool.query(
            `UPDATE sign_up SET coin = $1, first_plan_date = NOW() WHERE id = $2`,
            [newBalance, id]
          );

          const deductionMessage = `💸 Maintenance fee of $${fee.toFixed(2)} deducted for ${business_plan} plan. New balance: $${newBalance.toFixed(2)}`;
          
          await pool.query(
            `INSERT INTO notifications (user_id, message, type, created_at) 
             VALUES ($1, $2, 'deduction', NOW())`,
            [id, deductionMessage]
          );

          deductedUsers.push({ 
            userId: id, 
            name: full_name, 
            plan: business_plan,
            action: "fee_deducted", 
            amount: fee, 
            oldBalance: currentBalance,
            newBalance,
            days: daysDifference
          });

          console.log(`✅ Fee deducted from ${full_name}: $${fee} (New balance: $${newBalance})`);
        } else {
          // User doesn't have enough balance - deduct fee AND downgrade to Bronze
          await pool.query(
            `UPDATE sign_up SET coin = $1, business_plan = 'Bronze', first_plan_date = NULL WHERE id = $2`,
            [newBalance, id]
          );

          const downgradeMessage = `⚠️ Auto-downgraded to Bronze plan. Maintenance fee of $${fee.toFixed(2)} deducted. Balance: $${currentBalance} - $${fee} = $${newBalance}`;
          
          await pool.query(
            `INSERT INTO notifications (user_id, message, type, created_at) 
             VALUES ($1, $2, 'downgrade', NOW())`,
            [id, downgradeMessage]
          );

          downgradedUsers.push({ 
            userId: id, 
            name: full_name, 
            previousPlan: business_plan,
            newPlan: "Bronze",
            action: "fee_deducted_and_downgraded", 
            amount: fee, 
            oldBalance: currentBalance,
            newBalance,
            days: daysDifference,
            reason: `Insufficient balance: $${currentBalance} - $${fee} = $${newBalance}`
          });

          console.log(`💸 Fee deducted from ${full_name}: $${fee} AND downgraded to Bronze (New balance: $${newBalance})`);
        }
      } else {
        processedUsers.push({ 
          userId: id, 
          name: full_name, 
          action: "no_action", 
          reason: `Only ${daysDifference} days passed - waiting for day 25+` 
        });
        
        console.log(`⏳ ${full_name}: Only ${daysDifference} days passed - no action needed`);
      }
    }

    // Log this action
    await pool.query(
      "INSERT INTO admin_actions (action, performed_by, details) VALUES ($1, $2, $3)",
      ["manual_monthly_deduction", "admin", 
       `Notifications: ${notificationUsers.length}, Deductions: ${deductedUsers.length + downgradedUsers.length}, Downgrades: ${downgradedUsers.length}`]
    );

    res.json({ 
      success: true, 
      message: `✅ Monthly deduction completed! 
               - Notifications sent: ${notificationUsers.length}
               - Fees deducted: ${deductedUsers.length + downgradedUsers.length} 
               - Users downgraded: ${downgradedUsers.length}
               - No action needed: ${processedUsers.length}`,
      summary: {
        notifications: notificationUsers.length,
        deductions: deductedUsers.length + downgradedUsers.length,
        downgrades: downgradedUsers.length,
        no_action: processedUsers.length
      },
      notifications: notificationUsers,
      deductions: deductedUsers,
      downgrades: downgradedUsers,
      no_action: processedUsers
    });
  } catch (err) {
    console.error("❌ Monthly deduction failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run all cron jobs at once
router.post("/run-all", async (req, res) => {
  try {
    console.log("🔄 Running ALL cron jobs triggered");
    const results = {};
    
    // 1. Run Cleanup (45 days)
    try {
      console.log("🔄 Running cleanup (45 days)...");
      const cleanupResult = await pool.query(
        "DELETE FROM quiz_history WHERE quiz_date < CURRENT_DATE - INTERVAL '45 days'"
      );
      results.cleanup = { 
        success: true, 
        message: `Cleanup completed (${cleanupResult.rowCount} records older than 45 days deleted)` 
      };
      console.log("✅ Cleanup completed");
    } catch (err) {
      results.cleanup = { success: false, error: err.message };
      console.error("❌ Cleanup failed:", err.message);
    }

    // 2. Run Daily Check (day_count -1)
    try {
      console.log("🔄 Running daily check (day_count -1)...");
      const updateResult = await pool.query(`
        UPDATE sign_up 
        SET day_count = GREATEST(day_count - 1, 0)
        WHERE day_count > 0
      `);
      results.dailyCheck = { 
        success: true, 
        message: `Daily check completed (${updateResult.rowCount} users day_count decreased by 1)` 
      };
      console.log("✅ Daily check completed");
    } catch (err) {
      results.dailyCheck = { success: false, error: err.message };
      console.error("❌ Daily check failed:", err.message);
    }

    // 3. Run Monthly Deduction
    try {
      console.log("🔄 Running monthly deduction...");
      
      const planPrices = {
        "Silver": 60, "Gold 1": 100, "Gold 2": 200, 
        "Premium 1": 500, "Premium 2": 1000, "Premium 3": 2000, 
        "Premium 4": 5000, "Premium 5": 10000,
      };
      
      const { rows: users } = await pool.query(`
        SELECT id, business_plan, coin, first_plan_date 
        FROM sign_up 
        WHERE business_plan IS NOT NULL AND business_plan != 'Bronze' AND first_plan_date IS NOT NULL
      `);
      
      let notifications = 0;
      let deductions = 0;
      let downgrades = 0;
      
      const currentDate = new Date();
      
      for (const user of users) {
        const planPrice = planPrices[user.business_plan];
        if (planPrice) {
          const startDate = new Date(user.first_plan_date);
          const daysDifference = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
          const fee = planPrice * 0.10;

          if (daysDifference >= 25 && daysDifference <= 30) {
            // Send notification
            notifications++;
          } else if (daysDifference >= 31) {
            if (user.coin >= fee) {
              // Deduct fee
              await pool.query(
                `UPDATE sign_up SET coin = coin - $1, first_plan_date = NOW() WHERE id = $2`,
                [fee, user.id]
              );
              deductions++;
            } else {
              // Downgrade
              await pool.query(
                `UPDATE sign_up SET business_plan = 'Bronze', first_plan_date = NULL WHERE id = $1`,
                [user.id]
              );
              downgrades++;
            }
          }
        }
      }
      
      results.monthlyDeduction = { 
        success: true, 
        message: `Monthly deduction completed (Notifications: ${notifications}, Deductions: ${deductions}, Downgrades: ${downgrades})` 
      };
      console.log("✅ Monthly deduction completed");
    } catch (err) {
      results.monthlyDeduction = { success: false, error: err.message };
      console.error("❌ Monthly deduction failed:", err.message);
    }

    // Log this action
    await pool.query(
      "INSERT INTO admin_actions (action, performed_by, details) VALUES ($1, $2, $3)",
      ["run_all_cron_jobs", "admin", "All 3 cron jobs executed manually"]
    );

    res.json({ 
      success: true, 
      message: "✅ All cron jobs executed successfully!",
      results 
    });
  } catch (err) {
    console.error("❌ Run all failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add this route to backend/routes/adminCronRoutes.js

// In backend/routes/adminCronRoutes.js - Update the last-executed endpoint
router.get("/last-executed", async (req, res) => {
  try {
    console.log("📊 Fetching last executed times from admin_actions");
    
    // Get the most recent execution time for each action type
    const query = `
      SELECT action, MAX(created_at) as last_executed
      FROM admin_actions 
      WHERE action IN ('manual_cleanup', 'manual_daily_check', 'manual_quiz_init', 'manual_monthly_deduction', 'run_all_cron_jobs')
      GROUP BY action
    `;
    
    const result = await pool.query(query);
    console.log("Database result:", result.rows);
    
    // Convert to object format for easier frontend use
    const lastExecuted = {};
    result.rows.forEach(row => {
      lastExecuted[row.action] = row.last_executed;
    });

    console.log("Last executed object:", lastExecuted);

    res.json({
      success: true,
      lastExecuted
    });
  } catch (err) {
    console.error("❌ Error fetching last executed times:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;