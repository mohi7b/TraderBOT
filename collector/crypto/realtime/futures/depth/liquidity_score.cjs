/**
 * liquidity_score.cjs
 * ارزش‌دهی به دیوارهای نقدینگی
 */

class LiquidityScore {

    constructor(config = {}) {
        this.weightQty = config.weightQty || 1.0;
        this.weightRepeats = config.weightRepeats || 1.5;
        this.weightDuration = config.weightDuration || 0.5;
        this.weightHistory = config.weightHistory || 1.2;

        this.maxDurationMs = config.maxDurationMs || 3600000;
        this.maxRepeats = config.maxRepeats || 50;
    }

    /**
     * scoreQty
     * امتیاز بر اساس حجم
     */
    scoreQty(qty) {
        return qty * this.weightQty;
    }

    /**
     * scoreRepeats
     * امتیاز بر اساس تعداد دفعات دیده شدن
     */
    scoreRepeats(repeats) {
        const r = Math.min(repeats, this.maxRepeats);
        return r * this.weightRepeats;
    }

    /**
     * scoreDuration
     * امتیاز بر اساس مدت زمان حضور در عمق
     */
    scoreDuration(durationMs) {
        const d = Math.min(durationMs, this.maxDurationMs);
        return (d / 1000) * this.weightDuration;
    }

    /**
     * scoreHistory
     * امتیاز بر اساس تاریخچهٔ نقدینگی
     */
    scoreHistory(historyStats) {
        if (!historyStats) return 0;

        const { repeats, avgQty } = historyStats;

        const scoreRepeats = repeats * this.weightHistory;
        const scoreQty = avgQty * this.weightHistory;

        return scoreRepeats + scoreQty;
    }

    /**
     * calculate
     * محاسبهٔ امتیاز نهایی دیوار نقدینگی
     */
    calculate(level, historyStats = null) {
        const qtyScore = this.scoreQty(level.qty);
        const repeatScore = this.scoreRepeats(level.repeats || 1);
        const durationScore = this.scoreDuration(level.durationMs || 0);
        const historyScore = this.scoreHistory(historyStats);

        return qtyScore + repeatScore + durationScore + historyScore;
    }
}

module.exports = LiquidityScore;
