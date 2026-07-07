import { NextResponse } from "next/server";
import { getState } from "../../../lib/store";

export async function GET() {
  return NextResponse.json({
    price: getState().price,
    volume: getState().volume,
  });
}
