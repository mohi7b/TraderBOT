const assert = require("node:assert/strict");
const collectorConfig = require("../collector/aanode/config/collector.cjs");

const plan = collectorConfig.buildCollectorPlan(["BTCUSDT"]);
assert.ok(Array.isArray(plan));
assert.ok(plan.length > 0);
assert.ok(plan.every(task => task.symbol === "BTCUSDT"));
assert.ok(plan.some(task => task.source === "realtime"));
assert.ok(plan.some(task => task.exchange === "binance"));
console.log(`collector plan valid: ${plan.length} tasks for BTCUSDT`);
