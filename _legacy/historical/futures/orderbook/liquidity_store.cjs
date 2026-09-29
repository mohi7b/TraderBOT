/**
 * liquidity_store.cjs
 * ذخیرهٔ امتیاز دیوارهای نقدینگی
 */

const fs = require("fs");
const path = require("path");

class LiquidityStore {

    constructor({ filePath }) {
        this.filePath = filePath || path.join(__dirname, "liquidity_scores.json");
    }

    save(scores) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(scores, null, 2));
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

module.exports = LiquidityStore;
