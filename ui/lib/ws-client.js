let ws = null;
let listeners = [];

// جلوگیری از reconnect پشت‌سرهم
let reconnectTimeout = null;

// ============================================================
// 🔥 اتصال WebSocket با مدیریت پیام‌های بزرگ
// ============================================================
export function connectWS() {
  if (ws) return ws;

  ws = new WebSocket("ws://5.255.121.157:9000");

  ws.onopen = () => {
    console.log("🔥 UI connected to Collector WS");
  };

  ws.onmessage = (msg) => {
    try {
      // پیام‌های بزرگ (depthRest) ممکن است سنگین باشند
      const raw = msg.data;

      // جلوگیری از parse دوباره
      const data = JSON.parse(raw);

      // اجرای listenerها
      for (const fn of listeners) fn(data);

    } catch (err) {
      console.error("⚠️ WS parse error:", err);
    }
  };

  ws.onclose = () => {
    console.log("❌ WS closed, reconnecting...");

    ws = null;

    // جلوگیری از reconnect سریع
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectWS();
      }, 2000);
    }
  };

  ws.onerror = (err) => {
    console.error("⚠️ WS error:", err);
  };

  return ws;
}

// ============================================================
// 🔥 ثبت Listener
// ============================================================
export function subscribe(fn) {
  listeners.push(fn);
}

// ============================================================
// 🔥 حذف Listener
// ============================================================
export function unsubscribe(fn) {
  listeners = listeners.filter((l) => l !== fn);
}
