module.exports = {
    tableName: "liquidity_bonds",
    columns: {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        timestamp: "TEXT",
        symbol: "TEXT",
        yield: "REAL",
        duration: "REAL",
        flow: "REAL"
    }
};
