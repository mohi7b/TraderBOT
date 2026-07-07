function autoReconnect(createWS, name) {
  let ws = createWS();

  function reconnect() {
    console.log(`🔄 Reconnecting ${name}...`);
    ws = createWS();
    attachHandlers();
  }

  function attachHandlers() {
    ws.on("close", reconnect);
    ws.on("error", reconnect);
  }

  attachHandlers();
}

module.exports = { autoReconnect };
