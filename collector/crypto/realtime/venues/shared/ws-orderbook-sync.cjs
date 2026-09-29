/**
 * ============================================================
 * File: ws-orderbook-sync.cjs
 * Path: collector/crypto/realtime/venues/shared/ws-orderbook-sync.cjs
 * Version: v1.0.0
 * Description:
 *   Orderbook synchronization:
 *   - Snapshot
 *   - Delta
 *   - Sequence validation
 *   - Checksum verification
 * ============================================================
 */

module.exports = function wsOrderbookSync() {
    let snapshot = null;
    let lastUpdateId = null;

    return {
        applySnapshot(data) {
            snapshot = data;
            lastUpdateId = data.lastUpdateId;
        },

        applyDelta(delta) {
            if (!snapshot) return false;

            if (delta.u <= lastUpdateId) return false;
            if (delta.U > lastUpdateId + 1) return false;

            lastUpdateId = delta.u;
            return true;
        },

        verifyChecksum(checksumFn) {
            return checksumFn(snapshot);
        }
    };
};
