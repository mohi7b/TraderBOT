/**
 * File: ws-client.js
 * Description: اتصال UI به کالکتور و دریافت INIT + DELTA
 */

export function connectWS(onInit, onDelta) {
  const ws = new WebSocket("ws://5.255.121.157:9000");

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "init") {
      onInit(data.data);
      return;
    }

    if (data.type === "delta") {
      onDelta(data.path, data.data);
      return;
    }
  };

  return ws;
}
