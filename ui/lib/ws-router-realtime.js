"use client";

import { usePriceStore } from "../store/priceStore";
import { useVolumeStore } from "../store/volumeStore";
import { useDepthLayer0Store } from "../store/depthLayer0Store";
import { useDepthLayer1Store } from "../store/depthLayer1Store";

export function routeRealtime(msg) {
  switch (msg.path) {
    case "price":
      usePriceStore.getState().update(msg.data);
      break;

    case "volume":
      useVolumeStore.getState().update(msg.data);
      break;

    case "depthLayer0":
      useDepthLayer0Store.getState().update(msg.data);
      break;

    case "depthLayer1":
      useDepthLayer1Store.getState().update(msg.data);
      break;

    default:
      console.log("ignored realtime:", msg.path);
  }
}
