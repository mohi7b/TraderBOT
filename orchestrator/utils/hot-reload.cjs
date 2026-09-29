/* ============================================================
 * File: hot-reload.cjs
 * Path: orchestrator/utils/hot-reload.cjs
 * Version: 1.0.0
 *
 * Role:
 *   - Watches config + worker files for changes
 *   - Reloads orchestrator or specific workers dynamically
 *   - Enables full hot-reload without restarting the system
 *   - Prevents crashes by safe reload logic
 *
 * Relations:
 *   - Used by: orchestrator
 *   - Watches: config/*.cjs, workers/./.cjs
 *   - Triggers : orchestrator.reload(), worker.restart()
 * ============================================================ */

const fs = require("fs");
const path = require("path");

class HotReload {

    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.log = orchestrator.log;

        this.configPath = path.join(__dirname, "../config");
        this.workersPath = path.join(__dirname, "../workers");

        this.debounceTimers = {};
    }

    /* ============================================================
     * Debounce helper (prevents multiple reloads)
     * ============================================================ */
    _debounce(key, fn, delay = 300) {
        if (this.debounceTimers[key]) {
            clearTimeout(this.debounceTimers[key]);
        }
        this.debounceTimers[key] = setTimeout(fn, delay);
    }

    /* ============================================================
     * Watch config files (modules, pipeline, workers, symbols)
     * ============================================================ */
    watchConfig() {
        fs.watch(this.configPath, { recursive: false }, (event, filename) => {
            if (!filename.endsWith(".cjs")) return;

            this._debounce("config", () => {
                this.log.warn(`Config changed: ${filename}`);
                this._reloadConfig(filename);
            });
        });

        this.log.info("HotReload: Config watcher active.");
    }

    /* ============================================================
     * Reload config files safely
     * ============================================================ */
    _reloadConfig(filename) {
        try {
            delete require.cache[require.resolve(`../config/${filename}`)];

            const modulesConfig = require("../config/modules.cjs");
            const pipelineConfig = require("../config/pipeline.cjs");

            this.orchestrator.moduleTree.reload({
                modulesConfig,
                pipelineConfig
            });

            this.log.warn(`Config reloaded: ${filename}`);
        } catch (err) {
            this.log.error(`HotReload config error: ${err}`);
        }
    }

    /* ============================================================
     * Watch worker files (fetch, normalize, strategy, execute...)
     * ============================================================ */
    watchWorkers() {
        fs.watch(this.workersPath, { recursive: true }, (event, filename) => {
            if (!filename.endsWith(".cjs")) return;

            const parts = filename.split("/");
            const symbol = parts[0];

            this._debounce(symbol, () => {
                this.log.warn(`Worker file changed: ${filename}`);
                this._reloadWorker(symbol);
            });
        });

        this.log.info("HotReload: Worker watcher active.");
    }

    /* ============================================================
     * Reload a specific worker safely
     * ============================================================ */
    _reloadWorker(symbol) {
        try {
            const worker = this.orchestrator.workers[symbol];
            if (!worker) return;

            worker.stop();

            // پاک کردن کش فایل اصلی worker
            delete require.cache[
                require.resolve(`../workers/${symbol}/${symbol}.worker.cjs`)
            ];

            const WorkerClass = require(`../workers/${symbol}/${symbol}.worker.cjs`);

            this.orchestrator.workers[symbol] = new WorkerClass({
                symbol,
                config: this.orchestrator.workersConfig[symbol] ||
                        this.orchestrator.workersConfig.default,
                moduleTree: this.orchestrator.moduleTree,
                stateTree: this.orchestrator.stateTree,
                router: this.orchestrator.router
            });

            this.orchestrator.workers[symbol].start();

            this.log.warn(`Worker reloaded: ${symbol}`);
        } catch (err) {
            this.log.error(`HotReload worker error (${symbol}): ${err}`);
        }
    }
}

module.exports = HotReload;
