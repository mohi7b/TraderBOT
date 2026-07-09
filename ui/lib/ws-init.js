"use client";

import { connectRealtime } from "./ws-client-realtime";
import { connectMedium } from "./ws-client-medium";
import { routeRealtime } from "./ws-router-realtime";
import { routeMedium } from "./ws-router-medium";

connectRealtime(routeRealtime);
connectMedium(routeMedium);
