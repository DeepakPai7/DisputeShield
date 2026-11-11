import express from 'express';
import { db } from '../db/database.js';
import { config } from '../config.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const disputes = db.prepare('SELECT * FROM disputes').all();
    const analyses = db.prepare('SELECT dispute_id, case_strength_score, recommendation, json FROM analyses').all();

    let totalAmountUSD = 0;
    let wonCount = 0;
    let refundedCount = 0;
    let underReviewCount = 0;
    let moneyProtectedUSD = 0;
    let smartRefundsCount = 0;

    for (const d of disputes) {
      const amountUSD = d.dispute_currency === 'INR' ? (d.dispute_amount * config.fxInrUsd) : d.dispute_amount;
      totalAmountUSD += amountUSD;

      const latestAnalysis = analyses.find(a => a.dispute_id === d.id);
      const isSmartRefund = latestAnalysis && latestAnalysis.recommendation === 'ACCEPT_AND_REFUND';
      if (isSmartRefund) {
        smartRefundsCount++;
      }

      if (d.status === 'RESOLVED' || d.status === 'CLOSED') {
        refundedCount++;
      } else if (d.status === 'UNDER_REVIEW') {
        underReviewCount++;
        wonCount++;
        moneyProtectedUSD += amountUSD;
      } else if (latestAnalysis && latestAnalysis.recommendation === 'FIGHT_DISPUTE' && latestAnalysis.case_strength_score >= 70) {
        wonCount++;
        moneyProtectedUSD += amountUSD;
      }
    }

    const totalDisputes = disputes.length;
    const hoursSaved = (totalDisputes * 2.5).toFixed(1);
    const winRate = totalDisputes > 0 ? Math.round((wonCount / totalDisputes) * 100) : 0;

    // Build timeline data only from actual records
    const timelineData = [];
    if (totalDisputes > 0) {
      const dateBuckets = {};
      for (const d of disputes) {
        const dateKey = d.created_at ? d.created_at.slice(5, 10) : 'Recent';
        if (!dateBuckets[dateKey]) {
          dateBuckets[dateKey] = { date: dateKey, won: 0, refunded: 0, under_review: 0, protected_value: 0 };
        }
        const amt = d.dispute_currency === 'INR' ? (d.dispute_amount * config.fxInrUsd) : d.dispute_amount;
        if (d.status === 'UNDER_REVIEW') {
          dateBuckets[dateKey].under_review++;
          dateBuckets[dateKey].protected_value += amt;
        } else if (d.status === 'RESOLVED') {
          dateBuckets[dateKey].refunded++;
        } else {
          dateBuckets[dateKey].won++;
          dateBuckets[dateKey].protected_value += amt;
        }
      }
      for (const key of Object.keys(dateBuckets)) {
        timelineData.push({
          ...dateBuckets[key],
          protected_value: Math.round(dateBuckets[key].protected_value)
        });
      }
    }

    res.json({
      total_disputes: totalDisputes,
      money_protected_usd: Math.round(moneyProtectedUSD),
      disputes_won_count: wonCount,
      win_rate_percent: winRate,
      hours_saved: parseFloat(hoursSaved),
      refunds_avoided_count: wonCount,
      smart_refunds_count: smartRefundsCount,
      timeline_data: timelineData
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stats: ' + err.message });
  }
});

export default router;
