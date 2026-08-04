/**
 * ============================================================
 *  File: processor-cluster.cjs
 *  Path: orchestrator/cluster/roles/processor-cluster.cjs
 *  Version: 5.0.0 (UPDATED FOR NEW ARCHITECTURE)
 *  Description:
 *      Processor Cluster Role Handler for TraderBOT Distributed Engine.
 *      - Runs orderbook processors (depth-levels, speed, liquidity, etc.)
 *      - Receives snapshots from EventBus IPC
 *      - Sends processed output back to Master
 *      - Fully integrated with WorkerContext + EventBusIPC
 * ============================================================
 */

const context = require("../worker-context.cjs");
const eventbus = context.eventbus;

class ProcessorCluster {

    start(pipe) {

        context.info(`⚙️ ProcessorCluster starting → ${pipe}`);

        let processor = null;

        try {
            // مسیر جدید پردازشگرها
            const processorPath = `../../../collector/realtime/spot/orderbook/${pipe}.cjs`;
            processor = require(processorPath);

            context.info(`⚙️ Processor loaded → ${processorPath}`);

        } catch (err) {
            context.error(`ProcessorCluster Load Error (${pipe}): ${err.message}`);
            eventbus.publish("processor.error", { pipe, error: err.message });
            return;
        }

        /**
         * ============================================================
         *  دریافت snapshot از CollectorCluster
         * ============================================================
         */
        eventbus.subscribe("depth.snapshot", (snapshot) => {

            try {
                const output = processor.run(snapshot);

                // ارسال خروجی پردازشگر به Master
                eventbus.publish(`processor.${pipe}.output`, output);

            } catch (err) {
                context.error(`Processor Error (${pipe}): ${err.message}`);
                eventbus.publish("processor.error", { pipe, error: err.message });
            }
        });

        /**
         * ============================================================
         *  Reload پردازشگر (Hot Reload)
         * ============================================================
         */
        eventbus.subscribe("processor.reload", (data) => {

            if (data.pipe !== pipe) return;

            context.info(`🔄 Reloading processor → ${pipe}`);

            try {
                const processorPath = `../../../collector/realtime/spot/orderbook/${pipe}.cjs`;
                delete require.cache[require.resolve(processorPath)];
                processor = require(processorPath);

                context.info(`🔄 Processor reloaded → ${pipe}`);

            } catch (err) {
                context.error(`Reload Error (${pipe}): ${err.message}`);
            }
        });

        context.info(`🚀 ProcessorCluster fully initialized → ${pipe}`);
    }
}

module.exports = new ProcessorCluster();
