// src/pages/reports/ChartTooltip.tsx
interface ChartTooltipPayloadEntry {
  name?: string | number;
  value?: number;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipPayloadEntry[];
  formatter?: (value: number, name: string) => [string, string];
}

/**
 * Shared recharts tooltip content. Recharts' default tooltip colors each value
 * row using that series' own color as the TEXT color — on this app's dark
 * background, low-contrast series colors (purple, indigo) become close to
 * unreadable. This renders every label/value in a fixed, readable color and
 * demotes the series color to a small swatch instead.
 */
export function ChartTooltip({ active, label, payload, formatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 10px', fontSize: 11, minWidth: 120 }}>
      {label != null && <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((entry, i) => {
        const rawName = String(entry.name ?? entry.dataKey ?? '');
        const [val, name] = formatter ? formatter(Number(entry.value ?? 0), rawName) : [String(entry.value ?? ''), rawName];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color ?? '#94a3b8', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}
