"use client";

export function connectMedium(onMessage) {
  const ws = new WebSocket("ws://5.255.121.157:9002");

  ws.onopen = () => console.log("⏳ medium connected");
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = (e) => console.log("⚠️ medium error", e);
}
