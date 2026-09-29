const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const models = require('../models.cjs');

const dbPath = path.join(__dirname, 'globalliquidity.db');
const db = new sqlite3.Database(dbPath);

function createTable(model) {
    const columns = Object.entries(model.columns)
        .map(([name, type]) => `${name} ${type}`)
        .join(', ');

    const sql = `CREATE TABLE IF NOT EXISTS ${model.tableName} (${columns});`;

    return new Promise((resolve, reject) => {
        db.run(sql, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function runMigrations() {
    console.log("Running migrations...");

    try {
        for (const key of Object.keys(models)) {
            const model = models[key];
            await createTable(model);
            console.log(`Created table: ${model.tableName}`);
        }

        console.log("All migrations completed.");
        db.close();

    } catch (err) {
        console.error("Migration error:", err.message);
        db.close();
    }
}

runMigrations();
