module.exports = {
    minimum: {
        equity: 5000000,
        bonds: 3000000,
        commodities: 2000000,
        fx: 1000000,
        crypto: 500000
    },

    adaptive: {
        lookbackDays: 30,
        kFactor: {
            equity: 0.5,
            bonds: 0.7,
            commodities: 1.0,
            fx: 0.8,
            crypto: 1.5
        }
    },

    severity: {
        weak: 1.0,
        moderate: 2.0,
        strong: 3.0
    }
};
