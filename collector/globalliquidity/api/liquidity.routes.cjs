const express = require('express');
const router = express.Router();

router.get('/score', (req, res) => {
    res.json({
        status: "ok",
        route: "liquidity_score",
        message: "Liquidity score endpoint skeleton"
    });
});

router.get('/flows', (req, res) => {
    res.json({
        status: "ok",
        route: "liquidity_flows",
        message: "Liquidity flows endpoint skeleton"
    });
});

module.exports = router;
