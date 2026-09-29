import { ChartLab } from "./ChartLab";

export const metadata = {
  title: "Chart Lab — مرجع چارت ماژولار",
};

/**
 * /dashboard/chart-lab
 * آزمایشگاه چشمی موتور چارت مرجع (BaseChart):
 * تعویض تم · زوم · سیگنال · لایه — همه از بیرون تزریق می‌شوند.
 */
export default function ChartLabPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-medium">Chart Lab — مرجع چارت ماژولار</h1>
        <p className="text-xs text-muted">
          یک موتور واحد (<code>BaseChart</code>) برای همهٔ دامنه‌ها: داده + تم + چینش + سیگنال + لایه.
          هیچ‌کدام از این‌ها داخل چارت هاردکد نشده‌اند.
        </p>
      </header>
      <ChartLab />
    </main>
  );
}
