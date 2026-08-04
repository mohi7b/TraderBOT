/**
 * ============================================================
 *  File: clusters.cjs
 *  Path: orchestrator/config/clusters.cjs
 *  Version: 5.0.0
 *  Description:
 *      Cluster configuration for TraderBOT Enterprise.
 *      Controls worker allocation for MarketCluster,
 *      ProcessorCluster, CollectorCluster, AggregatorCluster,
 *      AnalysisCluster, PredictionCluster, and LogicCluster.
 *
 *      In TEST MODE all clusters are disabled to ensure
 *      lightweight realtime testing without worker overhead.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    /* ============================================================
     *  Cluster System (Disabled for Test Mode)
     * ============================================================ */
    enabled: false,
    workers: 0,
    safeMode: true,

    /* ============================================================
     *  MarketCluster (Disabled)
     * ============================================================ */
    market: {},

    /* ============================================================
     *  ProcessorCluster (Disabled)
     * ============================================================ */
    processors: {},

    /* ============================================================
     *  CollectorCluster (Disabled)
     * ============================================================ */
    collectors: {},

    /* ============================================================
     *  AggregatorCluster (Disabled)
     * ============================================================ */
    aggregators: {},

    /* ============================================================
     *  AnalysisCluster (Disabled)
     * ============================================================ */
    analysis: {},

    /* ============================================================
     *  PredictionCluster (Disabled)
     * ============================================================ */
    prediction: {},

    /* ============================================================
     *  LogicCluster (Disabled)
     * ============================================================ */
    logic: {}
};
