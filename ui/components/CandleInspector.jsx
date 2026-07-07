// ui/components/CandleInspector.jsx
// 🟦 این کامپوننت اطلاعات دقیق یک کندل را نمایش می‌دهد
// نکته: کامنت‌ها فارسی هستند اما خروجی UI باید انگلیسی باشد

export default function CandleInspector({ candle }) {
  // اگر کندل وجود نداشت
  if (!candle) {
    return (
      <div className="p-4 bg-gray-900 text-gray-400 rounded">
        No candle selected
      </div>
    );
  }

  // 🟦 در ساختار جدید، candle خودش یک آبجکت کندل است
  const c = candle;

  return (
    <div className="p-4 bg-gray-900 rounded text-white">
      <h2 className="text-xl font-bold mb-3">Candle Inspector</h2>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>Open: {c.open}</div>
        <div>High: {c.high}</div>

        <div>Low: {c.low}</div>
        <div>Close: {c.close}</div>

        <div>Volume: {c.volume}</div>
        <div>Start Time: {c.startTime}</div>

        <div>End Time: {c.endTime}</div>
      </div>
    </div>
  );
}
