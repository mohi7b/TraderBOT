/**
 * ============================================================
 *  File: pipeline.cjs
 *  Path: orchestrator/config/pipeline.cjs
 *  Version: 5.0.0
 *  Description:
 *      Pipeline configuration for TraderBOT Enterprise.
 *      Controls the 13-stage processing pipeline including:
 *      raw data, normalization, math analysis, indicators,
 *      prediction, strategies, decision, execution, feedback,
 *      and learning engines.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    /* ============================================================
     *  Stage 1 — Raw Data (Realtime / Historical / Macro / Sentiment)
     * ============================================================ */
    raw: {
        enabled: true,
        realtime: true,
        historical: false,
        macro: false,
        sentiment: false
    },

    /* ============================================================
     *  Stage 2 — Normalized Data
     * ============================================================ */
    normalized: {
        enabled: true
    },

    /* ============================================================
     *  Stage 3 — Math Analysis (Basic Math)
     * ============================================================ */
    math: {
        enabled: false
    },

    /* ============================================================
     *  Stage 4 — Complex Analysis (Advanced Math)
     * ============================================================ */
    complex: {
        enabled: false
    },

    /* ============================================================
     *  Stage 5 — Indicators (RSI, MACD, EMA, etc.)
     * ============================================================ */
    indicators: {
        enabled: false
    },

    /* ============================================================
     *  Stage 6 — Prediction Engine (AI/ML)
     * ============================================================ */
    prediction: {
        enabled: false
    },

    /* ============================================================
     *  Stage 7 — Base Strategies (Simple Strategies)
     * ============================================================ */
    strategies: {
        enabled: false
    },

    /* ============================================================
     *  Stage 8 — Composite Strategies (Multi-Layer Strategies)
     * ============================================================ */
    composite: {
        enabled: false
    },

    /* ============================================================
     *  Stage 9 — Decision Dashboard (Final Decision Layer)
     * ============================================================ */
    decision: {
        enabled: false
    },

    /* ============================================================
     *  Stage 10 — Kill Switch (Safety Layer)
     * ============================================================ */
    killswitch: {
        enabled: false
    },

    /* ============================================================
     *  Stage 11 — Execution Layer (Order Execution)
     * ============================================================ */
    execution: {
        enabled: false
    },

    /* ============================================================
     *  Stage 12 — Feedback Engine (Post-Execution Feedback)
     * ============================================================ */
    feedback: {
        enabled: false
    },

    /* ============================================================
     *  Stage 13 — Learning Engine (AI Training)
     * ============================================================ */
    learning: {
        enabled: false
    }
};
