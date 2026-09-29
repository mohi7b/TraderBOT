const assert = require("node:assert/strict");
const { buildExchangePlan, getEnabledExchanges } = require("../orchestrator/aanode/config/exchanges.cjs");

const plan = buildExchangePlan(["BTCUSDT", "ETHUSDT"]);
const enabled = getEnabledExchanges();

assert.ok(Array.isArray(enabled));
assert.ok(enabled.includes("binance"));
assert.ok(enabled.includes("bybit"));
assert.ok(enabled.includes("bitget"));
assert.ok(enabled.includes("kucoin"));
assert.ok(enabled.includes("okx"));
assert.equal(plan.length, enabled.length * 2);
assert.ok(plan.every(task => ["BTCUSDT", "ETHUSDT"].includes(task.symbol)));
assert.ok(plan.every(task => enabled.includes(task.exchange)));
assert.ok(plan.some(task => task.exchange === "binance" && task.symbol === "BTCUSDT"));
console.log(`exchange plan valid: ${plan.length} tasks for ${enabled.length} exchanges × ${new Set(plan.map(item => item.symbol)).size} symbols`);
