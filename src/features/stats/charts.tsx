import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";

/**
 * Recharts bar charts for the stats page (daily rhythm, hour of day, new words).
 * Colours, grid and ink are theme tokens, so light/dark need no JS.
 *
 * Each point carries its own axis label and tooltip rows: formatting stays with
 * the caller that owns the units (characters, minutes, words).
 */

export interface TooltipRow {
  label: string;
  value: string;
}

export interface ChartPoint {
  /** Stable category id (day key, hour), never shown. */
  key: string;
  /** Axis tick text. */
  label: string;
  /** Tooltip heading. */
  title: string;
  value: number;
  rows: TooltipRow[];
}

interface StatsBarChartProps {
  data: ChartPoint[];
  /** Y-axis tick text; the unit lives here. */
  valueFormat: (value: number) => string;
  /** Show a tick every `tickInterval + 1` points. */
  tickInterval?: number;
  color?: string;
  height?: number;
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 10 };

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="min-w-32 bg-popover px-2.5 py-2 text-[11px] shadow-md ring-1 ring-foreground/10">
      <p className="mb-1 font-medium">{point.title}</p>
      {point.rows.map((row) => (
        <p key={row.label} className="flex justify-between gap-4 text-muted-foreground">
          <span>{row.label}</span>
          <span className="font-medium tabular-nums text-foreground">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

export function StatsBarChart({ data, valueFormat, tickInterval = 0, color = "var(--chart-2)", height = 160 }: StatsBarChartProps) {
  const labelByKey = useMemo(() => new Map(data.map((d) => [d.key, d.label])), [data]);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="key"
            tickFormatter={(key: string) => labelByKey.get(key) ?? ""}
            interval={tickInterval}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            tick={AXIS_TICK}
          />
          <YAxis width={38} tickCount={4} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={valueFormat} />
          <Tooltip
            content={renderTooltip}
            cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }}
            wrapperStyle={{ outline: "none" }}
            animationDuration={120}
          />
          {/* minPointSize keeps a light day visible; a zero day stays empty. */}
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} minPointSize={(value) => (value ? 2 : 0)} animationDuration={400} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
