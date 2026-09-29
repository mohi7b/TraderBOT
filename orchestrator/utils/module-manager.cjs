/* ============================================================
 * File: module-manager.cjs
 * Path: orchestrator/utils/module-manager.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Dynamic controller for enabling/disabling/reloading modules
 *   - Provides safe access to module-tree
 *   - Allows orchestrator + workers to check module availability
 *   - Supports hot-reload when modules.cjs or pipeline.cjs changes
 *
 * Relations:
 *   - Used by: orchestrator, workers
 *   - Uses: module-tree (enable/disable/reload)
 *   - Provides: isEnabled(), enable(), disable(), reload()
 * ============================================================ */

class ModuleManager {

    constructor(moduleTree) {
        this.moduleTree = moduleTree;
    }

    /* ============================================================
     * Check if module is enabled
     * ============================================================ */
    isEnabled(moduleName) {
        return this.moduleTree.isEnabled(moduleName);
    }

    /* ============================================================
     * Enable module dynamically
     * ============================================================ */
    enable(moduleName) {
        this.moduleTree.enable(moduleName);
    }

    /* ============================================================
     * Disable module dynamically
     * ============================================================ */
    disable(moduleName) {
        this.moduleTree.disable(moduleName);
    }

    /* ============================================================
     * Reload module-tree (modules + pipeline)
     * ============================================================ */
    reload(modulesConfig, pipelineConfig) {
        this.moduleTree.reload({ modulesConfig, pipelineConfig });
    }
}

module.exports = ModuleManager;
