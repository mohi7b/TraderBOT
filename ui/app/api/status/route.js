import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";

export async function GET() {
  return NextResponse.json({
    depthStatus: getState().depthStatus,
    depthImbalance: getState().depthImbalance,
    totalLiquidity: getState().totalLiquidity,
    weightedLiquidity: getState().weightedLiquidity,
    marketMakerPressure: getState().marketMakerPressure,
    depthMeta: getState().depthMeta,
  });
}
