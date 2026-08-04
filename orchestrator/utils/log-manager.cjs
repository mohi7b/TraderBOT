/**
 * ============================================================
 *  File: log-manager.cjs
 *  Path: orchestrator/utils/log-manager.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Centralized Logging System for TraderBOT Enterprise.
 *
 *      وظایف:
 *      - مدیریت لاگ‌های سیستم (info, warn, error, success, debug)
 *      - ذخیره لاگ‌ها در حافظه + فایل
 *      - سازگار با تمام Engineها و Managerهای Orchestrator
 *
 *      نکته:
 *      - ساختار جدید فقط از symbol / collectors / processors / engines استفاده می‌کند.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

class LogManager {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        this.logs = [];
        this.logFilePath = path.join(process.cwd(), "logs", "orchestrator.log");

        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        const dir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }

    format(level, message, context = null) {
        return {
            time: new Date().toISOString(),
            level,
            message,
            context
        };
    }

    save(entry) {
        this.logs.push(entry);
    }

    saveToFile(entry) {
        const line =
            `[${entry.time}] [${entry.level.toUpperCase()}] ${entry.message}` +
            (entry.context ? ` | ${JSON.stringify(entry.context)}` : "") +
            "\n";

        fs.appendFileSync(this.logFilePath, line);
    }

    log(level, message, context = null) {
        const entry = this.format(level, message, context);

        this.save(entry);
        this.saveToFile(entry);

        switch (level) {
            case "info":
                console.log(`ℹ️  ${message}`);
                break;
            case "warn":
                console.warn(`⚠️  ${message}`);
                break;
            case "error":
                console.error(`❌ ${message}`);
                break;
            case "success":
                console.log(`✅ ${message}`);
                break;
            case "debug":
                console.log(`🔍 ${message}`);
                break;
        }
    }

    info(message, context = null) {
        this.log("info", message, context);
    }

    warn(message, context = null) {
        this.log("warn", message, context);
    }

    error(message, context = null) {
        this.log("error", message, context);
    }

    success(message, context = null) {
        this.log("success", message, context);
    }

    debug(message, context = null) {
        this.log("debug", message, context);
    }

    dump() {
        return this.logs;
    }
}

module.exports = LogManager;
