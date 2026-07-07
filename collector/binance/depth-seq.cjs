// depth-seq.cjs
// مدیریت sequence number برای diff های اوردر بوک

let lastUpdateId = null;

function checkSequence(data) {
  const U = data.U;  // اولین seq در diff
  const u = data.u;  // آخرین seq در diff

  // اولین بار
  if (lastUpdateId === null) {
    lastUpdateId = u;
    return { ok: true };
  }

  // اگر diff بعدی دقیقاً ادامهٔ قبلی نباشد → گپ داریم
  if (U !== lastUpdateId + 1) {
    console.log("⚠️ GAP DETECTED — need snapshot reload");
    lastUpdateId = null;
    return { ok: false };
  }

  // همه‌چیز درست است
  lastUpdateId = u;
  return { ok: true };
}

module.exports = { checkSequence };
