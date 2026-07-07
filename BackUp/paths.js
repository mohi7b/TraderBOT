import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "config/path.json");

let config = {};
try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
    console.error("ERROR: Cannot read config/path.json");
    process.exit(1);
}

export const BASE_PATH = config.basePath;

if (!fs.existsSync(BASE_PATH)) {
    console.error("ERROR: BASE_PATH does not exist:", BASE_PATH);
    process.exit(1);
}

console.log("[paths.js] BASE_PATH =", BASE_PATH);
