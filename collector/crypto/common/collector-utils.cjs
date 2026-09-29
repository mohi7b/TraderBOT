/* ============================================================
 * File: collector-utils.cjs
 * Path: collector/crypto/common/collector-utils.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Shared utilities for all collector modules
 *   - Provides retry, throttle, debounce, WS helpers
 *
 * Relations:
 *   - Used by: realtime, historical, macro, sentiment
 * ============================================================ */

module.exports = {

    retry(fn, attempts = 3) {
        return async (...args) => {
            for (let i = 0; i < attempts; i++) {
                try { return await fn(...args); }
                catch (err) {
                    if (i === attempts - 1) throw err;
                }
            }
        };
    },

    throttle(fn, ms) {
        let last = 0;
        return (...args) => {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                return fn(...args);
            }
        };
    },

    debounce(fn, ms) {
        let timer = null;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }
};
