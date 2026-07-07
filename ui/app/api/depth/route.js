// ui/app/api/depth/route.js

import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";

export async function GET() {
  return NextResponse.json({
    depthImportant: getState().depthImportant,
    pressureScore: getState().pressureScore,
    dominantSide: getState().dominantSide,
    balancePoint: getState().balancePoint,
  });
}
