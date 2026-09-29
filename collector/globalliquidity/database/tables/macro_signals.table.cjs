module.exports = {
    tableName: "macro_signals",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        rate: "REAL",
        vix: "REAL",
        liquidityIndex: "REAL"
    }
};
