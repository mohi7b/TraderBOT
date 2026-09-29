const express = require('express');
const router = express.Router();

const snapshotEngine = require('../snapshots/snapshotEngine.cjs');
const realtimeSnapshot = require('../snapshots/realtimeSnapshot.cjs');

// Snapshot 5-minute (from DB)
router.get('/latest', async (req, res) => {
    try {
        const snapshot = await snapshotEngine();

        if (snapshot.error) {
            return res.status(500).json({
                status: "error",
                message: "Snapshot engine failed"
            });
        }

        res.json({
            status: "ok",
            mode: "database_snapshot",
            snapshot
        });

    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
});

// Real-time Snapshot (live)
router.get('/realtime', async (req, res) => {
    try {
        const snapshot = await realtimeSnapshot();

        if (snapshot.error) {
            return res.status(500).json({
                status: "error",
                message: "Realtime snapshot failed"
            });
        }

        res.json({
            status: "ok",
            mode: "realtime_snapshot",
            snapshot
        });

    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
});

module.exports = router;
