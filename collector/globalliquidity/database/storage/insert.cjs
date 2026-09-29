const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const models = require('../models.cjs');
const logger = require('../../utils/logger.cjs');

const dbPath = path.join(__dirname, 'globalliquidity.db');

function insertRecord(tableName, data) {
    return new Promise((resolve, reject) => {
        const model = models[tableName];

        if (!model) {
            return reject(new Error(`Model not found: ${tableName}`));
        }

        const columns = Object.keys(model.columns).filter(c => c !== 'id');
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => data[col] || null);

        const sql = `
            INSERT INTO ${model.tableName}
            (${columns.join(', ')})
            VALUES (${placeholders});
        `;

        const db = new sqlite3.Database(dbPath);

        db.run(sql, values, function (err) {
            db.close();

            if (err) {
                logger.error(`Insert error in ${tableName}: ${err.message}`);
                return reject(err);
            }

            resolve({ success: true, id: this.lastID });
        });
    });
}

module.exports = insertRecord;
