import LaborCard from '../cards/LaborCard';

export default function LaborPanel({ series }) {
  return (
    <div className="labor-panel">
      {series?.map((s) => (
        <LaborCard key={s.indicator.code} data={s} />
      ))}
    </div>
  );
}
