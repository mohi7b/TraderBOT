// Quick sanity test for TimeShift logic (no test runner needed).
// Run: node frontend/scripts/test-timeshift.mjs
// Expect: Jan = -300 (EST), Jul = -240 (EDT), and NY close at 16:00.

function parts(iso, tz) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = f.formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  let h = g("hour");
  if (h === "24") h = "00";
  return { y: +g("year"), mo: +g("month"), da: +g("day"), h: +h, mi: +g("minute") };
}

function offset(iso, tz) {
  const d = new Date(iso);
  const z = parts(iso, tz);
  const asUtc = Date.UTC(z.y, z.mo - 1, z.da, z.h, z.mi);
  return Math.round((asUtc - d.getTime()) / 60000);
}

function toNyClose(iso, tz = "America/New_York", closeHour = 16) {
  const d = new Date(iso);
  const z = parts(iso, tz);
  const off = offset(iso, tz);
  const localMs = Date.UTC(z.y, z.mo - 1, z.da, closeHour, 0, 0);
  return Math.floor((localMs - off * 60000) / 1000);
}

let ok = true;
function check(name, got, exp) {
  const pass = got === exp;
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}: got=${got} expect=${exp}`);
}

check("NY offset Jan (EST)", offset("2026-01-15T12:00:00Z", "America/New_York"), -300);
check("NY offset Jul (EDT)", offset("2026-07-15T12:00:00Z", "America/New_York"), -240);

// NY close 16:00 EDT (Jul) on 2026-07-15 => 20:00 UTC => 1784232000
const closeJul = toNyClose("2026-07-15T12:00:00Z");
// 16:00 local (-4) => 20:00 UTC
check("NY close Jul sec", closeJul, Math.floor(Date.UTC(2026, 6, 15, 20, 0, 0) / 1000));

const closeJan = toNyClose("2026-01-15T12:00:00Z");
// 16:00 local (-5) => 21:00 UTC
check("NY close Jan sec", closeJan, Math.floor(Date.UTC(2026, 0, 15, 21, 0, 0) / 1000));

console.log(ok ? "\\nALL PASSED" : "\\nSOME FAILED");
process.exit(ok ? 0 : 1);
