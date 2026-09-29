export default function Tabs({ tabs }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.label}>{t.label}</button>
      ))}
    </div>
  );
}
