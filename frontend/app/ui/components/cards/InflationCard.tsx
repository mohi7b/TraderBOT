'use client';

import { MacroSeries } from '@/app/ui/types/macro';

export default function InflationCard({ data }: { data: MacroSeries }) {
  const { indicator, latest, unit, trend } = data;

  return (
    <div
      style={{
        padding: '16px',
        borderRadius: '10px',
        background: '#ffffff',
        border: '1px solid #e5e5e5',
        fontFamily: 'sans-serif',
        width: '260px'
      }}
    >
      <h3 style={{ margin: 0 }}>{indicator.label}</h3>

      <div style={{ marginTop: '12px', fontSize: '32px', fontWeight: 600 }}>
        {latest.value} {unit}
      </div>

      <div style={{ marginTop: '8px', fontSize: '14px', color: '#555' }}>
        YoY: {latest.yoy ?? '-'} {unit}
        <br />
        MoM: {latest.mom ?? '-'} {unit}
      </div>

      <div style={{ marginTop: '8px', fontSize: '12px', color: '#777' }}>
        آخرین بروزرسانی: {latest.date}
      </div>

      <div
        style={{
          marginTop: '12px',
          padding: '6px 10px',
          borderRadius: '6px',
          background:
            trend.direction === 'rising'
              ? '#ffe5e5'
              : trend.direction === 'falling'
              ? '#e5ffe5'
              : '#f0f0f0',
          color:
            trend.direction === 'rising'
              ? '#d60000'
              : trend.direction === 'falling'
              ? '#008000'
              : '#555',
          fontSize: '14px',
          fontWeight: 500,
          display: 'inline-block'
        }}
      >
        ترند: {trend.direction} ({trend.strength})
      </div>
    </div>
  );
}
