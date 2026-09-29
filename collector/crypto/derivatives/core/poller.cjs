/* ============================================================
 * File: collector/crypto/derivatives/core/poller.cjs
 * Section: collector/crypto/derivatives/core
 * Version: 1.0.0
 *
 * Role:
 *   A self-scheduling interval poller for one (venue × symbol × data
 *   type) task.
 *
 *   Why not setInterval: setInterval drifts and, when a request takes
 *   longer than the interval, it stacks overlapping requests. This
 *   poller schedules the NEXT run only after the previous one settled,
 *   which keeps at most one in-flight request per task and makes the
 *   cadence a fixed *gap* rather than a fixed start time.
 *
 *   Failure isolation: a throwing task never kills the loop — it counts
 *   an error, calls onError and schedules the next attempt. Timers and
 *   the clock are injectable so tests are deterministic.
 * ============================================================ */

class Poller {
    constructor({
        name,
        intervalMs,
        task,
        jitterMs = 0,
        onError = null,
        onSuccess = null,
        timer = setTimeout,
        clear = clearTimeout,
        now = Date.now,
        runImmediately = true,
        random = Math.random
    }) {
        this.name = name;
        this.intervalMs = Math.max(1, Number(intervalMs) || 1000);
        this.jitterMs = Math.max(0, Number(jitterMs) || 0);
        this.task = task;
        this.onError = onError || (() => {});
        this.onSuccess = onSuccess || (() => {});
        this.timer = timer;
        this.clear = clear;
        this.now = now;
        this.runImmediately = runImmediately !== false;
        this.random = random;

        this.running = false;
        this.handle = null;
        this.stats = { runs: 0, ok: 0, errors: 0, lastRunAt: null, lastOkAt: null, lastErrorAt: null, lastError: null, lastDurationMs: null };
    }

    start() {
        if (this.running) return this;
        this.running = true;
        if (this.runImmediately) {
            this.handle = this.timer(() => this.runOnce(), 0);
        } else {
            this.schedule();
        }
        return this;
    }

    stop() {
        this.running = false;
        if (this.handle) this.clear(this.handle);
        this.handle = null;
        return this;
    }

    nextDelay() {
        const jitter = this.jitterMs > 0 ? Math.floor(this.random() * this.jitterMs) : 0;
        return this.intervalMs + jitter;
    }

    schedule() {
        if (!this.running) return;
        this.handle = this.timer(() => this.runOnce(), this.nextDelay());
    }

    /** One execution. Never throws: the error is reported through stats/onError. */
    async runOnce() {
        if (!this.running) return null;

        const startedAt = this.now();
        this.stats.runs += 1;
        this.stats.lastRunAt = startedAt;

        try {
            const result = await this.task();
            this.stats.ok += 1;
            this.stats.lastOkAt = this.now();
            this.stats.lastDurationMs = this.now() - startedAt;
            this.stats.lastError = null;
            this.onSuccess(result, this);
            return result;
        } catch (err) {
            this.stats.errors += 1;
            this.stats.lastErrorAt = this.now();
            this.stats.lastError = err && err.message ? err.message : String(err);
            this.stats.lastDurationMs = this.now() - startedAt;
            this.onError(err, this);
            return null;
        } finally {
            this.schedule();
        }
    }

    snapshot() {
        return { name: this.name, intervalMs: this.intervalMs, running: this.running, ...this.stats };
    }
}

module.exports = { Poller };
