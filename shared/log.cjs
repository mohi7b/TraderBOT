/*
 * Enterprise Log Router
 * Version: 1.0.0
 * Description:
 *   - Controls logging based on mode: run | debug | debug+
 *   - Prevents spam
 *   - Used by all collectors & processors
 */

const config = require("../orchestrator/config.cjs");

function log(mode, ...args) {
    const current = config.system.mode;

    // debug+ → همه چیز
    if (current === "debug+" && (mode === "debug+" || mode === "debug" || mode === "run")) {
        console.log(...args);
        return;
    }

    // debug → فقط مرحله‌ها
    if (current === "debug" && (mode === "debug" || mode === "run")) {
        console.log(...args);
        return;
    }

    // run → فقط رویدادهای مهم
    if (current === "run" && mode === "run") {
        console.log(...args);
        return;
    }
}

module.exports = log;
