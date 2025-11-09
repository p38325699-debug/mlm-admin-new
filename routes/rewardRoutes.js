const express = require("express");
const router = express.Router();
const pool = require("../config/db");

const milestones = [
  { count: 25, reward: 200 },
  { count: 75, reward: 500 },
  { count: 175, reward: 1000 },
  { count: 425, reward: 2000 },
  { count: 925, reward: 5000 },
  { count: 1925, reward: 20000 }
];

// ✅ Test Route — Increase gold1_count manually
router.get("/test-gold1", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.json({ status: false, message: "User ID required" });

    await pool.query(
      `UPDATE sign_up SET gold1_count = gold1_count + 1 WHERE id = $1`,
      [id]
    );

    res.json({ status: true, message: "✅ Test increment done" });
  } catch (err) {
    console.error(err);
    res.json({ status: false, message: "Server Error" });
  }
});


// ✅ API: Increase Gold1 and Give Rewards
router.get("/add-gold1", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.json({ status: false, message: "User ID required" });

    // Increase gold1_count
    const update = await pool.query(
      `UPDATE sign_up 
       SET gold1_count = gold1_count + 1 
       WHERE id = $1 
       RETURNING id, gold1_count, coin`,
      [id]
    );

    if (update.rowCount === 0)
      return res.json({ status: false, message: "User not found" });

    const user = update.rows[0];
    const newCount = user.gold1_count;

    // Check milestone hit
    const milestone = milestones.find(m => m.count === newCount);
    if (!milestone) {
      return res.json({
        status: true,
        message: `✅ Gold1 increased to ${newCount}`
      });
    }

    // Reward user
    await pool.query(
      `UPDATE sign_up 
       SET coin = coin + $1 
       WHERE id = $2`,
      [milestone.reward, id]
    );

    // Store in reward history
      await pool.query(
  `INSERT INTO gold1_rewards (user_id, milestone, reward)
   VALUES ($1, $2, $3)`,
  [id, milestone.count, milestone.reward]
);



    // Store notification
    await pool.query(
      `INSERT INTO notifications (user_id, message) 
       VALUES ($1, $2)`,
      [id, `🎉 Earned $${milestone.reward} for ${milestone.count} Gold1 members!`]
    );

    res.json({
      status: true,
      message: `🎯 Milestone ${milestone.count} reached — Reward $${milestone.reward} added`,
      gold1_count: newCount,
      reward: milestone.reward
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
});

// ✅ API: Reduce Gold1 and Give Rewards
router.get("/reduce-gold1", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.json({ status: false, message: "User ID required" });

    const user = await pool.query(
      `SELECT id, gold1_count, coin FROM sign_up WHERE id = $1`,
      [id]
    );

    if (user.rows.length === 0)
      return res.json({ status: false, message: "User not found" });

    let count = user.rows[0].gold1_count;

    if (count <= 0)
      return res.json({
        status: false,
        message: "No Gold1 members remaining"
      });

    count -= 1;

    await pool.query(
      `UPDATE sign_up SET gold1_count = $1 WHERE id = $2`,
      [count, id]
    );

    let rewardGiven = false;
    let rewardAmount = 0;

    for (const m of milestones) {
      if (count === m.count) {

        // ✅ Give reward coins
        await pool.query(
          `UPDATE sign_up SET coin = coin + $1 WHERE id = $2`,
          [m.reward, id]
        );

        // ✅ Save notification
        await pool.query(
          `INSERT INTO notifications (user_id, message) VALUES ($1, $2)`,
          [id, `🎉 You earned ${m.reward} coins for achieving ${m.count} Gold1 team members!`]
        );

        rewardGiven = true;
        rewardAmount = m.reward;
      }
    }

    res.json({
      status: true,
      message: rewardGiven
        ? `✅ Gold1 decreased, milestone hit! +${rewardAmount} coins`
        : `Gold1 decreased`,
      remaining_gold1: count
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
});


module.exports = router;
