// Minimal regex-based route matcher (no external deps). Converts "/tf/:symbol/:tf" style paths into a
// RegExp with named groups, matching the capture shape the server dispatch loop expects.
function pathToRegexp(pattern) {
    const keys = [];
    const source = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
            keys.push(name);
            return "([^/]+)";
        });
    const regex = new RegExp(`^${source}$`);
    regex.keys = keys;
    return { regex, keys };
}

function match(path, { regex, keys }) {
    const m = regex.exec(path);
    if (!m) return null;
    const params = {};
    keys.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
    return params;
}

module.exports = { pathToRegexp, match };
