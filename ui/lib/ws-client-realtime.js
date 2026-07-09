"use client";

export function connectRealtime(onMessage) {
  const ws = new WebSocket("ws://5.255.121.157:9001");

  ws.onopen = () => console.log("⚡ RealTime WS Connected");
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = (e) => console.log("⚠️ RealTime WS Error:", e);
  ws.onclose = () => console.log("❌ RealTime WS Closed");
}
