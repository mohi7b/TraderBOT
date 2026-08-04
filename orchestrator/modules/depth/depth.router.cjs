/**
 * -------------------------------------------------------------
 *  File: depth.router.cjs
 *  Module: Depth Processing Engine
 *  Layer: Routing Layer (Worker → Orchestrator)
 *  Version: 1.0.0
 *  Author: Mohsen + Copilot
 *  Location: orchestrator/modules/depth/
 *
 *  Description:
 *      مسیریابی خروجی ورکرهای عمق به orchestrator.
 *      این فایل هیچ پردازشی انجام نمی‌دهد و ultra-light است.
 *      فقط دادهٔ نهایی را از ورکر دریافت کرده و به eventbus ارسال می‌کند.
 *
 *  Notes:
 *      - این ماژول یک کلاستر مستقل نیست.
 *      - داخل همان Process orchestrator اجرا می‌شود.
 *      - مناسب VPS دو‌هسته‌ای و معماری سبک.
 *
 *  Dependencies:
 *      - eventbus-ipc.cjs
 *      - log-ipc.cjs
 *
 * -------------------------------------------------------------
 */

const { eventbus } = require("../../ipc/eventbus-ipc.cjs");
const { log } = require("../../ipc/log-ipc.cjs");

class DepthRouter {
    route(market, symbol, type, subtype, payload) {
        try {
            const msg = {
                market,
                symbol,
                type,
                subtype,
                payload,
                ts: Date.now()
            };

            eventbus.emit("depth.output", msg);
            eventbus.emit("processor.input", msg);

        } catch (err) {
            log.error(`[DepthRouter] Routing error for ${market}:${symbol}`, err);
        }
    }
}

module.exports = DepthRouter;
