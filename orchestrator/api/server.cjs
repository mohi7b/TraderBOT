const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "../public");
const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8"
};

function json(response, statusCode, body) {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
}

function start(port = 3000) {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
        const statusMatch = url.pathname.match(/^\/api\/status\/([^/]+)$/);
        const chartMatch = url.pathname.match(/^\/api\/charts\/([^/]+)$/);

        if (statusMatch) {
            const symbol = decodeURIComponent(statusMatch[1]).toUpperCase();
            return json(response, 200, global.getMarketStatus ? global.getMarketStatus(symbol) : { aggregate: null, indicators: null, charts: null });
        }
        if (chartMatch) {
            const symbol = decodeURIComponent(chartMatch[1]).toUpperCase();
            const charts = global.chartSeries instanceof Map ? global.chartSeries.get(symbol) || null : null;
            return json(response, 200, { symbol, definitions: global.chartDefinitions || [], charts });
        }
        if (url.pathname === "/api/health") {
            return json(response, 200, { marketHealth: global.marketHealth || [], liquidation: global.liquidationHealth || [] });
        }

        const requested = url.pathname === "/" ? "/index.html" : url.pathname;
        const filePath = path.resolve(publicDir, `.${requested}`);
        if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return json(response, 404, { error: "Not found" });
        response.writeHead(200, { "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream", "cache-control": "no-store" });
        fs.createReadStream(filePath).pipe(response);
    });

    server.listen(port, "127.0.0.1", () => console.log(`[DASHBOARD] http://127.0.0.1:${port}`));
    return server;
}

module.exports = { start };
