module.exports = {
    tableName: "liquidity_alerts",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        severity: "TEXT",
        score: "REAL",
        message: "TEXT"
    }
};
