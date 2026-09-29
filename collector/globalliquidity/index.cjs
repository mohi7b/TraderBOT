const express = require('express');
const app = express();

app.use('/api/liquidity', require('./api/liquidity.routes.cjs'));
app.use('/api/alerts', require('./api/alerts.routes.cjs'));
app.use('/api/markets', require('./api/markets.routes.cjs'));
app.use('/api/snapshots', require('./api/snapshots.routes.cjs'));

app.listen(3000, () => {
    console.log("Global Liquidity API running on port 3000");
});
