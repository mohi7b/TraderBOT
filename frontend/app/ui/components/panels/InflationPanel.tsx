import InflationCard from '@/app/ui/components/cards/InflationCard';
import { MacroSeries } from '@/app/ui/types/macro';

export default function InflationPanel({ series }: { series: MacroSeries[] }) {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      {series.map((s) => (
        <InflationCard key={s.indicator.code} data={s} />
      ))}
    </div>
  );
}
