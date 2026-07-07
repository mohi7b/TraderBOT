const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9000");

ws.on("open", () => {
  console.log("Connected to WebSocket Server");
});

ws.on("message", (msg) => {
  console.log("Received:", msg.toString());
});
