import { connectWS, subscribe } from "./ws-client";

const state = {
  price: null,
  volume: null,

  depthImportant: null,
  depthTop20: null,

  pressureScore: null,
  dominantSide: null,
  balancePoint: null,

  depthStatus: null,
  depthImbalance: null,

  totalLiquidity: null,
  weightedLiquidity: null,
  marketMakerPressure: null,

  depthMeta: null,

  // 🔥 عمق کامل 5000 سطحی
  depthRest: {
    bids: [],
    asks: []
  }
};

const listeners = [];

// ============================================================
// 🔥 جلوگیری از آپدیت‌های سنگین UI
// ============================================================
let lastDepthUpdate = 0;

export function initStore() {
  connectWS();

  subscribe((msg) => {
    if (msg.type !== "delta") return;

    switch (msg.path) {
      case "price":
        state.price = msg.data;
        break;

      case "volume":
        state.volume = msg.data;
        break;

      case "depthImportant":
        state.depthImportant = msg.data;
        break;

      case "depthTop20":
        state.depthTop20 = msg.data;
        break;

      case "pressureScore":
        state.pressureScore = msg.data;
        break;

      case "dominantSide":
        state.dominantSide = msg.data;
        break;

      case "balancePoint":
        state.balancePoint = msg.data;
        break;

      case "depthStatus":
        state.depthStatus = msg.data;
        break;

      case "depthImbalance":
        state.depthImbalance = msg.data;
        break;

      case "totalLiquidity":
        state.totalLiquidity = msg.data;
        break;

      case "weightedLiquidity":
        state.weightedLiquidity = msg.data;
        break;

      case "marketMakerPressure":
        state.marketMakerPressure = msg.data;
        break;

      case "depthMeta":
        state.depthMeta = msg.data;
        break;

      // ============================================================
      // 🔥 عمق کامل 5000 سطحی (snapshot)
      // ============================================================
      case "depthRest":
        {
          const now = performance.now();

          // جلوگیری از آپدیت UI بیش از حد
          if (now - lastDepthUpdate < 200) return;
          lastDepthUpdate = now;

          state.depthRest = msg.data;
        }
        break;
    }

    listeners.forEach((fn) => fn(state));
  });
}

export function useStore(fn) {
  listeners.push(fn);
  fn(state);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function getState() {
  return state;
}
