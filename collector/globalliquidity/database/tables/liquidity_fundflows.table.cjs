module.exports = {
    tableName: "liquidity_fundflows",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        category: "TEXT",
        inflow: "REAL",
        outflow: "REAL"
    }
};
