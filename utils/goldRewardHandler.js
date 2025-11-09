const pool = require("../config/db");

const milestones = [
  { count: 25, reward: 200 },
  { count: 75, reward: 500 },
  { count: 175, reward: 1000 },
  { count: 425, reward: 2000 },
  { count: 925, reward: 5000 },
  { count: 1925, reward: 20000 },
];

module.exports = async function updateGold1Rewards(uplineUserId) {
  try {

    // ✅ Step 1: Increase gold1_count by 1
    await pool.query(
      `UPDATE sign_up 
       SET gold1_count = COALESCE(gold1_count,0) + 1 
       WHERE id = $1`,
      [uplineUserId]
    );

    // ✅ Step 2: Get updated count
    const res = await pool.query(
      `SELECT gold1_count, coin FROM sign_up WHERE id = $1`,
      [uplineUserId]
    );

    const count = Number(res.rows[0].gold1_count);

    // ✅ Step 3: Check milestone hit
    for (const m of milestones) {
      if (count === m.count) {

        // ✅ Reward user
        await pool.query(
          `UPDATE sign_up 
           SET coin = COALESCE(coin,0) + $1 
           WHERE id = $2`,
          [m.reward, uplineUserId]
        );

        // ✅ Notification
        await pool.query(
          `INSERT INTO notifications (user_id, message) 
           VALUES ($1,$2)`,
          [
            uplineUserId,
            `🎉 You earned $${m.reward} for completing ${m.count} Gold 1 team members!`
          ]
        );

        console.log(`✅ Gold1 Reward Given: User ${uplineUserId} → ${m.reward} coins`);
      }
    }

  } catch (err) {
    console.error("Gold Reward Handler Error:", err.message);
  }
};
