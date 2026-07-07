export interface CandleCore {
  startTime: number;
  endTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface LiveData {
  lastPrice: number;
  marketDirection: string;
  liquidityGap: number;
  volumeRealtime: number;
  spoofing: boolean;
  absorption: boolean;

  volatility: {
    micro: number;
  };

  spike: {
    raw: number;
    maxSpike: number;
    count: number;
    direction: string;
  };

  orderbook: {
    buyDepth: number;
    sellDepth: number;
    totalBuy: number;
    totalSell: number;
    marketPressure: string;
  };

  trades: {
    count: number;
    buyVolume: number;
    sellVolume: number;
    bigTrades: any[];
  };
}

export interface SignalData {
  spikeRaw: number;
  spikeStrength: number;
  spikeCount: number;
  spikeDirection: string;
  microVolatility: number;
  orderbookDominance: number;
  depthImbalance: number;
  tradeImbalance: number;
  marketDirection: string;
  marketPressure: string;
  liquidityGap: number;
  bigTradeImpact: boolean;
  trendScore: number;
  marketState: string;
}

export interface CandleData {
  symbol: string;
  timeframe: string;
  candle: CandleCore;
  live: LiveData;
  signals: SignalData;
  updatedAt: number;
}
