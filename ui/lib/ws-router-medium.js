"use client";

import { useDepthLayer2Store } from "../store/depthLayer2Store";
import { useDepthLayer3Store } from "../store/depthLayer3Store";

export function routeMedium(msg) {
  switch (msg.path) {
    case "depthLayer2":
      useDepthLayer2Store.getState().update(msg.data);
      break;

    case "depthLayer3":
      useDepthLayer3Store.getState().update(msg.data);
      break;

    default:
      console.log("ignored medium:", msg.path);
  }
}
