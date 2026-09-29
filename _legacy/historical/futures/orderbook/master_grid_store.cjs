/**
 * master_grid_store.cjs
 * ذخیرهٔ بلندمدت Master Grid
 */

const fs = require("fs");
const path = require("path");

class MasterGridStore {

    constructor({ filePath }) {
        this.filePath = filePath || path.join(__dirname, "master_grid.json");
    }

    save(data) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
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

module.exports = MasterGridStore;
