/**
 * depth_history_store.cjs
 * ذخیرهٔ تاریخچهٔ نقدینگی
 */

const fs = require("fs");
const path = require("path");

class DepthHistoryStore {

    constructor({ filePath }) {
        this.filePath = filePath || path.join(__dirname, "depth_history.json");
    }

    save(records) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2));
            return true;
        } catch {
            return false;
        }
    }

    load() {
        try {
            if (!fs.existsSync(this.filePath)) return [];
            const raw = fs.readFileSync(this.filePath);
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }

    clear() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify([]));
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = DepthHistoryStore;
