const express = require('express');
const router = express.Router();

router.get('/latest', (req, res) => {
    res.json({
        status: "ok",
        route: "alerts_latest",
        message: "Latest alerts endpoint skeleton"
    });
});

router.get('/history', (req, res) => {
    res.json({
        status: "ok",
        route: "alerts_history",
        message: "Alerts history endpoint skeleton"
    });
});

module.exports = router;
