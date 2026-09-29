/* ============================================================
 * File: symbol-map.cjs
 * Path: collector/crypto/common/symbol-map.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Maps exchange-specific symbols to unified symbols
 *
 * Relations:
 *   - Used by: all exchange plugins
 * ============================================================ */

module.exports = {

    toUnified(symbol) {
        return symbol.replace(/[-_]/g, "").toUpperCase();
    },

    fromExchange(exchange, symbol) {
        // اگر بعداً نیاز شد، اینجا می‌تونی نگاشت‌های خاص هر صرافی را اضافه کنی
        return symbol;
    }
};
