import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}

/** A single headline metric tile. */
export function StatCard({ icon: Icon, label, value, sub }: StatCardProps) {
  return (
    <Card size="sm" className="gap-2">
      <div className="flex items-center gap-2 px-3 text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="px-3">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}
