export interface MacroSeries {
  country: { code: string; name: string };
  indicator: { code: string; label: string };
  latest: { value: number; yoy?: number; mom?: number; date: string };
  unit: string;
  frequency: string;
  trend: {
    direction: 'rising' | 'falling' | 'stable';
    strength: 'weak' | 'medium' | 'strong';
  };
}
