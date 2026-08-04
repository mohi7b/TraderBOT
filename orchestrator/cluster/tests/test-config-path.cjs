console.log("🔍 Testing config.cjs path resolution...\n");

try {
    const config = require("../../config.cjs");
    console.log("✅ config.cjs loaded successfully.");
    console.log("cluster.groups:", config.cluster.groups);
} catch (err) {
    console.log("❌ FAILED to load config.cjs");
    console.log(err);
}
