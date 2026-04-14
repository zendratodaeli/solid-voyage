"use client";

/**
 * BrokerScorecard — Enterprise broker performance analytics
 * Shows win rate, deal value, and comparative rankings
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Trophy,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Loader2,
  Medal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getBrokerScorecard,
  type BrokerScore,
} from "@/actions/cargo-inquiry-actions";

export function BrokerScorecard() {
  const [scores, setScores] = useState<BrokerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<keyof BrokerScore>("winRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await getBrokerScorecard();
    if (res.success && res.data) setScores(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const sorted = [...scores].sort((a, b) => {
    const av = a[sortField] as number;
    const bv = b[sortField] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const toggleSort = (field: keyof BrokerScore) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const totalInquiries = scores.reduce((s, b) => s + b.totalInquiries, 0);
  const totalWon = scores.reduce((s, b) => s + b.won, 0);
  const totalRevenue = scores.reduce((s, b) => s + b.totalRevenue, 0);
  const avgWinRate = scores.length > 0
    ? scores.reduce((s, b) => s + b.winRate, 0) / scores.length
    : 0;

  if (loading) {
    return (
      <div className="rounded-xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading broker analytics...
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center gap-3">
        <Users className="h-10 w-10 text-muted-foreground/50" />
        <div className="text-muted-foreground">No broker data yet</div>
        <div className="text-xs text-muted-foreground">Add brokers to inquiries to see performance analytics</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <ScorecardKPI
          icon={<Users className="h-4 w-4" />}
          label="Active Brokers"
          value={scores.length.toString()}
          sub={`${totalInquiries} total inquiries`}
          accent="blue"
        />
        <ScorecardKPI
          icon={<Trophy className="h-4 w-4" />}
          label="Total Fixed"
          value={totalWon.toString()}
          sub={`${avgWinRate.toFixed(1)}% avg win rate`}
          accent="emerald"
        />
        <ScorecardKPI
          icon={<DollarSign className="h-4 w-4" />}
          label="Fixed Revenue"
          value={`$${(totalRevenue / 1_000_000).toFixed(1)}M`}
          sub="From fixed deals"
          accent="purple"
        />
        <ScorecardKPI
          icon={<BarChart3 className="h-4 w-4" />}
          label="Top Broker"
          value={sorted[0]?.brokerName || "—"}
          sub={`${sorted[0]?.winRate.toFixed(0)}% win rate`}
          accent="amber"
        />
      </div>

      {/* Broker Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground w-8">#</th>
              <SortableHeader label="Broker" field="brokerName" current={sortField} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Inquiries" field="totalInquiries" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Fixed" field="won" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Lost" field="lost" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Win Rate" field="winRate" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Avg Freight" field="avgFreight" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Revenue" field="totalRevenue" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((broker, index) => (
              <tr key={broker.brokerName} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 text-muted-foreground">
                  {index < 3 ? (
                    <Medal className={`h-4 w-4 ${
                      index === 0 ? "text-amber-400" : index === 1 ? "text-slate-300" : "text-amber-700"
                    }`} />
                  ) : (
                    <span className="text-xs">{index + 1}</span>
                  )}
                </td>
                <td className="py-3 px-4 font-medium">{broker.brokerName}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{broker.totalInquiries}</td>
                <td className="py-3 px-4 text-right">
                  <span className="text-emerald-400 font-medium">{broker.won}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="text-red-400">{broker.lost}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <WinRateBar rate={broker.winRate} />
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {broker.avgFreight > 0 ? `$${broker.avgFreight.toFixed(2)}` : "—"}
                </td>
                <td className="py-3 px-4 text-right">
                  {broker.totalRevenue > 0 ? (
                    <span className="text-purple-400 font-medium">
                      ${(broker.totalRevenue / 1000).toFixed(0)}K
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────

function ScorecardKPI({ icon, label, value, sub, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  const colors: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  };
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${colors[accent] || colors.blue}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs opacity-60">{sub}</div>
    </div>
  );
}

function WinRateBar({ rate }: { rate: number }) {
  const color = rate >= 60 ? "bg-emerald-500" : rate >= 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium ${rate >= 60 ? "text-emerald-400" : rate >= 30 ? "text-amber-400" : "text-red-400"}`}>
        {rate.toFixed(0)}%
      </span>
    </div>
  );
}

function SortableHeader({ label, field, current, dir, onSort, align }: {
  label: string;
  field: string;
  current: string;
  dir: "asc" | "desc";
  onSort: (f: any) => void;
  align?: string;
}) {
  return (
    <th
      className={`py-3 px-4 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {current === field && (
          dir === "desc" ? <ChevronDown className="h-3 w-3 text-primary" /> : <ChevronUp className="h-3 w-3 text-primary" />
        )}
      </span>
    </th>
  );
}
