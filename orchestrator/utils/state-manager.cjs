/* ============================================================
 * File: state-manager.cjs
 * Path: orchestrator/utils/state-manager.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Persistent storage manager for state-tree
 *   - Saves full system state to disk
 *   - Loads previous state on startup
 *   - Creates backups for recovery
 *   - Used by orchestrator during start/stop/reload
 *
 * Relations:
 *   - Used by: orchestrator, health-monitor
 *   - Uses: state-tree (read/write)
 *   - Provides: save(), load(), clear(), backup()
 * ============================================================ */

const fs = require("fs");
const path = require("path");

class StateManager {

    constructor() {
        this.storagePath = path.join(__dirname, "../../storage/state.json");
        this.backupPath = path.join(__dirname, "../../storage/state.backup.json");

        const storageDir = path.join(__dirname, "../../storage");
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
    }

    /* ============================================================
     * Save full state-tree to disk
     * ============================================================ */
    save(stateTree) {
        try {
            const data = JSON.stringify(stateTree.state, null, 2);
            fs.writeFileSync(this.storagePath, data, "utf8");
        } catch (err) {
            console.error("StateManager save error:", err);
        }
    }

    /* ============================================================
     * Load previous state-tree from disk
     * ============================================================ */
    load() {
        try {
            if (!fs.existsSync(this.storagePath)) {
                return null;
            }

            const raw = fs.readFileSync(this.storagePath, "utf8");
            return JSON.parse(raw);
        } catch (err) {
            console.error("StateManager load error:", err);
            return null;
        }
    }

    /* ============================================================
     * Clear saved state
     * ============================================================ */
    clear() {
        try {
            if (fs.existsSync(this.storagePath)) {
                fs.unlinkSync(this.storagePath);
            }
        } catch (err) {
            console.error("StateManager clear error:", err);
        }
    }

    /* ============================================================
     * Create backup of current state
     * ============================================================ */
    backup(stateTree) {
        try {
            const data = JSON.stringify(stateTree.state, null, 2);
            fs.writeFileSync(this.backupPath, data, "utf8");
        } catch (err) {
            console.error("StateManager backup error:", err);
        }
    }
}

module.exports = StateManager;
