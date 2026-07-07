/**
 * ساخت کندل زنده از قیمت لحظه‌ای
 */

let liveCandle = null;

export function updateLiveCandle(price) {
  const now = Math.floor(Date.now() / 1000);
  const minute = Math.floor(now / 60);

  if (!liveCandle || liveCandle.minute !== minute) {
    liveCandle = {
      minute,
      time: minute * 60,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };
  } else {
    liveCandle.high = Math.max(liveCandle.high, price);
    liveCandle.low = Math.min(liveCandle.low, price);
    liveCandle.close = price;
  }

  return liveCandle;
}
