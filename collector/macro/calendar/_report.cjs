const s = require("./store.cjs");
const db = s.openStore();
const rows = db.prepare("SELECT source, count(*) n, MIN(release_date) f, MAX(release_date) t FROM release_events WHERE status='scheduled' GROUP BY source ORDER BY source").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
