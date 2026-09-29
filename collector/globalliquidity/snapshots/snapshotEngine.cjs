const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger.cjs');

const snapshotBuilder = require('./snapshotBuilder.cjs');
const snapshotFormatter = require('./snapshotFormatter.cjs');

const dbPath = path.join(__dirname, '..', 'database', 'storage', 'globalliquidity.db');

function getLatestRecord(tableName) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);

        const sql = `
            SELECT *
            FROM ${tableName}
            ORDER BY timestamp DESC
            LIMIT 1;
        `;

        db.get(sql, (err, row) => {
            db.close();

            if (err) {
                logger.error(`SnapshotEngine error reading ${tableName}: ${err.message}`);
                return reject(err);
            }

            resolve(row || null);
        });
    });
}

async function snapshotEngine() {
    try {
        // 1) گرفتن آخرین رکوردها از دیتابیس
        const equity = await getLatestRecord("liquidity_equity");
        const bonds = await getLatestRecord("liquidity_bonds");
        const commodities = await getLatestRecord("liquidity_commodities");
        const fx = await getLatestRecord("liquidity_fx");
        const crypto = await getLatestRecord("liquidity_crypto");
        const macro = await getLatestRecord("macro_signals");
        const alerts = await getLatestRecord("liquidity_alerts");

        // 2) ساخت snapshot خام
        const rawSnapshot = {
            timestamp: new Date().toISOString(),
            equity,
            bonds,
            commodities,
            fx,
            crypto,
            macro,
            alerts
        };

        // 3) ساختاردهی snapshot
        const builtSnapshot = snapshotBuilder(rawSnapshot);

        // 4) قالب‌بندی خروجی برای API
        const formattedSnapshot = snapshotFormatter(builtSnapshot);

        return formattedSnapshot;

    } catch (err) {
        logger.error(`snapshotEngine exception: ${err.message}`);
        return { error: true };
    }
}

module.exports = snapshotEngine;
