/* ============================================================
 * File: module-tree.cjs
 * Section: orchestrator/core
 * Role:
 *   Defines the 3 main processing trees:
 *   Collector Tree, Analyzer Tree, Executor Tree
 *
 *   All submodules are now inside their own subsystem trees.
 *   Orchestrator only knows these 3 roots.
 *
 * Version: 2.0.0
 * ============================================================ */

module.exports = {
    collectorTree: {
        name: "Collector",
        description: "Stages 1–3: Raw → Normalized → Math",
        active: true
    },

    analyzerTree: {
        name: "Analyzer",
        description: "Stages 4–9: Complex → Indicators → Strategies → Decision",
        active: true
    },

    executorTree: {
        name: "Executor",
        description: "Stages 10–13: Kill Switch → Execution → Feedback → Learning",
        active: true
    }
};
