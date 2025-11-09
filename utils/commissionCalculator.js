// backend/utils/commissionCalculator.js
function calculateCommission(
  business_plan = "Bronze",
  day_count = 0,
  score = 0,
  videosWatched = 0
) {
  // Convert safely
  const scoreNum = Number(score) || 0;
  const videosNum = Number(videosWatched) || 0;
  const days = Number(day_count) || 0;

  // Default Bronze rates
  let quizRate = 0.05;
  let videoRate = 0.05;

  // Plan-based rates
  const planRates = {
    Silver: 0.21,
    Gold1: 0.40,
    Gold2: 0.80,
    Premium1: 2.25,
    Premium2: 4.5,
    Premium3: 9,
    Premium4: 22.5,
    Premium5: 45,
  };

  // ✅ If user has valid active plan (days left between 1 and 45)
  if (days >= 1 && days <= 45) {
    const planKey = business_plan.replace(/\s+/g, ""); // remove spaces e.g. "Gold 1" → "Gold1"
    if (planRates[planKey]) {
      quizRate = planRates[planKey];
      videoRate = planRates[planKey];
    }
  } else {
    // ❌ Expired or no plan → Bronze fallback
    quizRate = 0.05;
    videoRate = 0.05;
  }

  // Calculate final commission
  const quizCommission = scoreNum * quizRate;
  const videoCommission = videosNum * videoRate;

  return Number((quizCommission + videoCommission).toFixed(3));
}

module.exports = calculateCommission;
