module.exports = {
    tableName: "liquidity_fx",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        pair: "TEXT",
        rate: "REAL",
        dxy: "REAL",
        flow: "REAL"
    }
};
