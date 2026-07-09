/**
 * File: ws-server-slow.cjs
 * Description: Slow-Time REST API (hourly data)
 */

const express = require("express");
const app = express();

app.use(express.json());

let slowData = {
  report: null,
  updatedAt: null,
};

// API برای دریافت دادهٔ ساعتی
app.get("/api/slow", (req, res) => {
  res.json({
    type: "slow",
    updatedAt: slowData.updatedAt,
    data: slowData.report,
  });
});

// تابع برای آپدیت دادهٔ ساعتی
function updateSlowData(report) {
  slowData.report = report;
  slowData.updatedAt = Date.now();
  console.log("\x1b[36m🕒 Slow Data Updated\x1b[0m");
}

app.listen(9003, () => {
  console.log("\x1b[36m🕒 Slow-Time API running on port 9003\x1b[0m");
});

module.exports = { updateSlowData };
