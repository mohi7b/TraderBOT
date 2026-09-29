const express = require('express');
const router = express.Router();
const markets = require('../config/markets.config.cjs');

router.get('/list', (req, res) => {
    res.json({
        status: "ok",
        route: "markets_list",
        markets
    });
});

module.exports = router;
