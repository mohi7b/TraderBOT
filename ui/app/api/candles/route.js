import axios from "axios";

export async function GET() {
  const url =
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500";

  const res = await axios.get(url);

  return Response.json(res.data);
}
