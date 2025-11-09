// routes/dashboard.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// Get all dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    // Get all stats in parallel for better performance
    const [
      usersCount,
      totalRevenue,
      pendingWithdrawals,
      pendingPayments,
      todayQuizCompletions,
      activePlans
    ] = await Promise.all([
      // Total Users Count
      pool.query('SELECT COUNT(*) as count FROM sign_up'),
      
      // Total Revenue (completed wallet transactions)
      pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM wallet WHERE status = $1', ['completed']),
      
      // Pending Withdrawals Count
      pool.query('SELECT COUNT(*) as count FROM wallet_withdrawals WHERE status = $1', ['pending']),
      
      // Pending Payments Count
      pool.query('SELECT COUNT(*) as count FROM wallet WHERE status = $1', ['pending']),
      
      // Today's Quiz Completions
      pool.query('SELECT COUNT(*) as count FROM quiz_history WHERE quiz_date = CURRENT_DATE'),
      
      // Active Plans Count (users with payment_status = true)
      pool.query('SELECT COUNT(*) as count FROM sign_up WHERE payment_status = $1', [true])
    ]);

    const stats = {
      totalUsers: parseInt(usersCount.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].total),
      pendingWithdrawals: parseInt(pendingWithdrawals.rows[0].count),
      pendingPayments: parseInt(pendingPayments.rows[0].count),
      todayQuizCompletions: parseInt(todayQuizCompletions.rows[0].count),
      activePlans: parseInt(activePlans.rows[0].count)
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (err) {
    console.error("💥 Dashboard Stats Error:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Server error while fetching dashboard stats" 
    });
  }
});

// Get recent activities (last 10 activities)
router.get("/recent-activities", async (req, res) => {
  try {
    // Combine recent activities from multiple tables
    const recentActivities = await pool.query(`
      (
        SELECT 
          'user_registration' as type,
          full_name as title,
          'User registered' as description,
          created_at as date,
          id as item_id
        FROM sign_up 
        ORDER BY created_at DESC 
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 
          'payment' as type,
          'Payment received' as title,
          'Amount: $' || amount as description,
          payment_date as date,
          id as item_id
        FROM wallet 
        WHERE status = 'completed'
        ORDER BY payment_date DESC 
        LIMIT 3
      )
      UNION ALL
      (
        SELECT 
          'withdrawal' as type,
          'Withdrawal request' as title,
          'Amount: $' || amount as description,
          created_at as date,
          id as item_id
        FROM wallet_withdrawals 
        WHERE status = 'pending'
        ORDER BY created_at DESC 
        LIMIT 2
      )
      ORDER BY date DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      data: recentActivities.rows
    });

  } catch (err) {
    console.error("💥 Recent Activities Error:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Server error while fetching recent activities" 
    });
  }
});

module.exports = router;