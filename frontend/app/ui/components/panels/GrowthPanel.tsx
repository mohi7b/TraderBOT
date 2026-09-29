import GrowthCard from '../cards/GrowthCard';

export default function GrowthPanel({ series }) {
  return (
    <div className="growth-panel">
      {series?.map((s) => (
        <GrowthCard key={s.indicator.code} data={s} />
      ))}
    </div>
  );
}
