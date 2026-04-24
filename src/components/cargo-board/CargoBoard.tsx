"use client";

/**
 * CargoBoard — Enterprise Cargo Inquiry Pipeline
 * 
 * Table view + Kanban view with KPI strip, urgency badges,
 * inline status editing, and real-time pipeline analytics.
 */

import { useState, useEffect, useMemo, useCallback, useTransition } from "react";
import {
  Package,
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  RefreshCw,
  TrendingUp,
  Target,
  Clock,
  DollarSign,
  AlertCircle,
  ChevronDown,
  X,
  Trash2,
  Pencil,
  ArrowUpDown,
  Users,
  BarChart3,
} from "lucide-react";
import {
  getCargoInquiries,
  getInquiryStats,
  getFleetFitCounts,
  updateCargoInquiry,
  deleteCargoInquiry,
  type CargoInquiryItem,
  type InquiryStats,
} from "@/actions/cargo-inquiry-actions";
import { InquiryForm } from "./InquiryForm";
import { InquiryDetail } from "./InquiryDetail";
import { KanbanBoard } from "./KanbanBoard";
import { BrokerScorecard } from "./BrokerScorecard";
import { PipelineAnalytics } from "./PipelineAnalytics";
import { VoyageForm } from "@/components/voyages/VoyageForm";
import { getVesselsForInquiry } from "@/actions/cargo-inquiry-actions";
import { usePusher } from "@/hooks/use-pusher";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const STATUSES = ["DRAFT", "NEW", "OFFERED", "FIXED", "COMPLETED", "REJECTED", "LOST", "EXPIRED", "WITHDRAWN"] as const;
const ACTIVE_STATUSES = ["DRAFT", "NEW", "EVALUATING", "OFFERED", "NEGOTIATING", "FIXED"];
const CLOSED_STATUSES = ["COMPLETED", "REJECTED", "LOST", "EXPIRED", "WITHDRAWN"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/30" },
  NEW: { label: "New-Evaluating", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  EVALUATING: { label: "New-Evaluating", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  OFFERED: { label: "Offered-Negotiating", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  NEGOTIATING: { label: "Offered-Negotiating", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  FIXED: { label: "Fixed", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  COMPLETED: { label: "Completed", color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/30" },
  REJECTED: { label: "Rejected", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  LOST: { label: "Lost", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  EXPIRED: { label: "Expired", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/30" },
  WITHDRAWN: { label: "Withdrawn", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/30" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  URGENT: { label: "Urgent", color: "text-red-400", dot: "bg-red-500" },
  ACTIVE: { label: "Active", color: "text-amber-400", dot: "bg-amber-500" },
  PLANNING: { label: "Planning", color: "text-emerald-400", dot: "bg-emerald-500" },
  OVERDUE: { label: "Overdue", color: "text-gray-400", dot: "bg-gray-500" },
};

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function CargoBoard() {
  const [inquiries, setInquiries] = useState<CargoInquiryItem[]>([]);
  const [stats, setStats] = useState<InquiryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "kanban" | "analytics" | "brokers">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState<CargoInquiryItem | null>(null);
  const [selectedInquiry, setSelectedInquiry] = useState<CargoInquiryItem | null>(null);
  const [selectedInquiryTab, setSelectedInquiryTab] = useState<"overview" | "vessels">("overview");
  const [fitCounts, setFitCounts] = useState<Record<string, number>>({});
  const [sortKey, setSortKey] = useState<string>("urgency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isPending, startTransition] = useTransition();
  const [showClosed, setShowClosed] = useState(true);
  const [vessels, setVessels] = useState<any[]>([]);

  // ─── Data Loading ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [inquiriesRes, statsRes, fitRes, vesselsRes] = await Promise.all([
      getCargoInquiries(),
      getInquiryStats(),
      getFleetFitCounts(),
      getVesselsForInquiry(),
    ]);
    if (inquiriesRes.success && inquiriesRes.data) setInquiries(inquiriesRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (fitRes.success && fitRes.data) setFitCounts(fitRes.data);
    if (vesselsRes.success && vesselsRes.data) setVessels(vesselsRes.data);
    setLoading(false);
  }, []);

  // Silent refresh — no loading spinner (used by Pusher real-time updates)
  const silentLoadData = useCallback(async () => {
    const [inquiriesRes, statsRes, fitRes] = await Promise.all([
      getCargoInquiries(),
      getInquiryStats(),
      getFleetFitCounts(),
    ]);
    if (inquiriesRes.success && inquiriesRes.data) setInquiries(inquiriesRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (fitRes.success && fitRes.data) setFitCounts(fitRes.data);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Real-time: Pusher subscription (instant patch + silent background refresh) ──
  usePusher({
    onCargoUpdated: useCallback((event: { inquiryId: string; status: string }) => {
      // Instant: patch inquiry status in local state
      setInquiries(prev => prev.map(inq =>
        inq.id === event.inquiryId ? { ...inq, status: event.status } : inq
      ));
      // Silent background refresh for stats, vessel candidates, etc.
      silentLoadData();
    }, [silentLoadData]),
    onVoyageUpdated: useCallback(() => {
      // Voyage status changed — silent refresh to reflect any linked inquiry changes
      silentLoadData();
    }, [silentLoadData]),
  });

  // ─── Filtered + Sorted Data ─────────────────────────────────
  const filteredInquiries = useMemo(() => {
    let items = [...inquiries];

    // Status filter
    if (statusFilter === "ACTIVE") {
      items = items.filter(i => ACTIVE_STATUSES.includes(i.status));
    } else if (statusFilter === "CLOSED") {
      items = items.filter(i => CLOSED_STATUSES.includes(i.status));
    } else if (statusFilter === "NEW") {
      items = items.filter(i => i.status === "NEW" || i.status === "EVALUATING");
    } else if (statusFilter === "OFFERED") {
      items = items.filter(i => i.status === "OFFERED" || i.status === "NEGOTIATING");
    } else if (statusFilter !== "ALL") {
      items = items.filter(i => i.status === statusFilter);
    } else if (!showClosed) {
      items = items.filter(i => ACTIVE_STATUSES.includes(i.status));
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.cargoType.toLowerCase().includes(q) ||
        i.loadPort.toLowerCase().includes(q) ||
        i.dischargePort.toLowerCase().includes(q) ||
        i.brokerName?.toLowerCase().includes(q) ||
        i.source?.toLowerCase().includes(q)
      );
    }

    // Sort
    const urgencyOrder = { OVERDUE: 0, URGENT: 1, ACTIVE: 2, PLANNING: 3 };
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "urgency":
          const uA = a.urgency ? urgencyOrder[a.urgency] ?? 4 : 4;
          const uB = b.urgency ? urgencyOrder[b.urgency] ?? 4 : 4;
          cmp = uA - uB;
          break;
        case "laycan":
          cmp = (a.laycanStart || "9").localeCompare(b.laycanStart || "9");
          break;
        case "quantity":
          cmp = a.cargoQuantityMt - b.cargoQuantityMt;
          break;
        case "revenue":
          cmp = (a.estimatedRevenue || 0) - (b.estimatedRevenue || 0);
          break;
        case "created":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        default:
          cmp = a.cargoType.localeCompare(b.cargoType);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return items;
  }, [inquiries, statusFilter, searchQuery, sortKey, sortDir, showClosed]);

  // ─── Actions ────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    // Validate: FIXED requires the inquiry to be assigned to a vessel on the Fleet Schedule
    if (newStatus === "FIXED") {
      const inquiry = inquiries.find(i => i.id === id);
      if (inquiry && !inquiry.voyageId) {
        toast.warning("Cannot mark as Fixed", {
          description: "This inquiry has not been assigned to a vessel on the Fleet Schedule yet. Please drag it onto a vessel row first.",
          duration: 5000,
        });
        return;
      }
    }

    // ── Optimistic update: apply immediately ──
    const prevInquiries = inquiries;
    setInquiries(prev => prev.map(i =>
      i.id === id ? { ...i, status: newStatus } : i
    ));

    // ── Server sync (background) ──
    startTransition(async () => {
      const result = await updateCargoInquiry(id, { status: newStatus });
      if (result.success && result.data) {
        // Replace with authoritative server data
        setInquiries(prev => prev.map(i => i.id === id ? result.data! : i));
        const statsRes = await getInquiryStats();
        if (statsRes.success && statsRes.data) setStats(statsRes.data);
        try { sessionStorage.removeItem("fleet_dock_inquiries"); } catch {}
      } else {
        // Rollback on failure
        setInquiries(prevInquiries);
        toast.error("Failed to update status", {
          description: result.error || "An unexpected error occurred.",
        });
      }
    });
  }, [inquiries]);

  const handleDelete = useCallback(async (id: string) => {
    const inquiry = inquiries.find(i => i.id === id);
    const label = inquiry ? `${inquiry.cargoType} (${inquiry.loadPort} → ${inquiry.dischargePort})` : "Inquiry";

    // ── Optimistic update: remove immediately ──
    const prevInquiries = inquiries;
    setInquiries(prev => prev.filter(i => i.id !== id));

    // ── Server sync (background) ──
    startTransition(async () => {
      const result = await deleteCargoInquiry(id);
      if (result.success) {
        toast.success("Inquiry deleted", {
          description: label,
        });
        const statsRes = await getInquiryStats();
        if (statsRes.success && statsRes.data) setStats(statsRes.data);
        try { sessionStorage.removeItem("fleet_dock_inquiries"); } catch {}
      } else {
        // Rollback on failure
        setInquiries(prevInquiries);
        toast.error("Failed to delete inquiry", {
          description: result.error || "An unexpected error occurred. Please try again.",
        });
      }
    });
  }, [inquiries]);

  const handleSaved = useCallback(() => {
    setShowForm(false);
    setEditingInquiry(null);
    loadData();
  }, [loadData]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ─── Render ─────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* ═══ KPI Strip ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          label="Total Inquiries"
          value={stats?.total || 0}
          sub={`${stats?.byStatus?.NEW || 0} new`}
          accent="blue"
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="Win Rate"
          value={`${(stats?.winRate || 0).toFixed(1)}%`}
          sub={`${stats?.byStatus?.FIXED || 0} fixed`}
          accent="emerald"
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Pipeline Value"
          value={`$${((stats?.pipelineValue || 0) / 1000).toFixed(0)}K`}
          sub="Weighted"
          accent="purple"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Offered-Negotiating"
          value={(stats?.byStatus?.OFFERED || 0) + (stats?.byStatus?.NEGOTIATING || 0)}
          sub="Assigned to vessels"
          accent="purple"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="New-Evaluating"
          value={(stats?.byStatus?.NEW || 0) + (stats?.byStatus?.EVALUATING || 0)}
          sub="Pending assignment"
          accent="cyan"
        />
      </div>

      {/* ═══ Command Bar ═══ */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search cargo, port, broker..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-md bg-muted/50 border border-border text-sm focus:outline-none"
          >
            <option value="ALL">All Inquiries</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          {statusFilter === "ALL" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={e => setShowClosed(e.target.checked)}
                className="rounded"
              />
              Show closed
            </label>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setView("table")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "table" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              title="Table View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "kanban" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              title="Kanban View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("analytics")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "analytics" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              title="Pipeline Analytics"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("brokers")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "brokers" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
              title="Broker Scorecard"
            >
              <Users className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={loadData}
            className="h-9 w-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* + New Inquiry */}
          <button
            onClick={() => { setEditingInquiry(null); setShowForm(true); }}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90 transition"
          >
            <Plus className="h-4 w-4" />
            New Inquiry
          </button>
        </div>
      </div>

      {/* Count badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{filteredInquiries.length}</span>
        {filteredInquiries.length === 1 ? "inquiry" : "inquiries"}
        {searchQuery && <span>matching "{searchQuery}"</span>}
      </div>

      {/* ═══ Content ═══ */}
      {view === "table" ? (
        <InquiryTable
          inquiries={filteredInquiries}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onStatusChange={handleStatusChange}
          onEdit={inq => setSelectedInquiry(inq)}
          onDelete={handleDelete}
          isPending={isPending}
          fitCounts={fitCounts}
          onVesselClick={inq => { setSelectedInquiry(inq); setSelectedInquiryTab("vessels"); }}
        />
      ) : view === "kanban" ? (
        <KanbanBoard
          inquiries={filteredInquiries}
          onStatusChange={handleStatusChange}
          onEdit={inq => setSelectedInquiry(inq)}
          onDelete={handleDelete}
        />
      ) : view === "analytics" ? (
        <PipelineAnalytics inquiries={inquiries} stats={stats} />
      ) : (
        <BrokerScorecard />
      )}

      {/* ═══ Detail Slide-over ═══ */}
      {selectedInquiry && (
        <InquiryDetail
          inquiry={selectedInquiry}
          initialTab={selectedInquiryTab}
          onClose={() => { setSelectedInquiry(null); setSelectedInquiryTab("overview"); }}
          onUpdated={() => { loadData(); }}
        />
      )}

      {/* ═══ Create Inquiry — Full VoyageForm Slide-over ═══ */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowForm(false); setEditingInquiry(null); }}
          />
          {/* Slide-over */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-lg font-semibold">New Cargo Inquiry</h2>
                <p className="text-xs text-muted-foreground">
                  Full voyage calculation — paste an email or fill manually
                </p>
              </div>
              <button
                onClick={() => { setShowForm(false); setEditingInquiry(null); }}
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <VoyageForm
                vessels={vessels}
                mode="inquiry"
                onInquirySaved={handleSaved}
                onClose={() => { setShowForm(false); setEditingInquiry(null); }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════════════

function KpiCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  accent: string;
}) {
  const colors: Record<string, string> = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    purple: "text-purple-400",
    amber: "text-amber-400",
    cyan: "text-cyan-400",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={colors[accent] || "text-muted-foreground"}>{icon}</span>
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TABLE VIEW
// ═══════════════════════════════════════════════════════════════════

function InquiryTable({
  inquiries, sortKey, sortDir, onSort, onStatusChange, onEdit, onDelete, isPending, fitCounts, onVesselClick,
}: {
  inquiries: CargoInquiryItem[];
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onEdit: (inq: CargoInquiryItem) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  fitCounts: Record<string, number>;
  onVesselClick: (inq: CargoInquiryItem) => void;
}) {
  if (inquiries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center gap-3">
        <Package className="h-10 w-10 text-muted-foreground/50" />
        <div className="text-muted-foreground">No cargo inquiries yet</div>
        <div className="text-xs text-muted-foreground">Click "+ New Inquiry" to create your first cargo inquiry</div>
      </div>
    );
  }

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <th
      className="text-left py-3 px-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field && (
          <ArrowUpDown className="h-3 w-3 text-primary" />
        )}
      </span>
    </th>
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <th className="w-8 py-3 px-3" />
              <SortHeader label="Cargo" field="cargo" />
              <SortHeader label="Quantity" field="quantity" />
              <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">Route</th>
              <SortHeader label="Laycan" field="laycan" />
              <SortHeader label="Freight" field="revenue" />
              <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">Broker</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground">Vessels</th>
              <th className="w-20 py-3 px-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inquiries.map(inq => (
              <tr
                key={inq.id}
                className="hover:bg-muted/20 transition-colors group cursor-pointer"
                onClick={() => onEdit(inq)}
              >
                {/* Urgency dot */}
                <td className="py-3 px-3">
                  {inq.urgency && (
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${URGENCY_CONFIG[inq.urgency]?.dot || ""} animate-pulse`}
                      title={URGENCY_CONFIG[inq.urgency]?.label}
                    />
                  )}
                </td>

                {/* Cargo */}
                <td className="py-3 px-3 font-medium">{inq.cargoType}</td>

                {/* Quantity */}
                <td className="py-3 px-3 text-muted-foreground">
                  {inq.cargoQuantityMt.toLocaleString()} MT
                </td>

                {/* Route */}
                <td className="py-3 px-3">
                  <span className="text-muted-foreground">{inq.loadPort}</span>
                  <span className="text-muted-foreground/50 mx-1">→</span>
                  <span className="text-muted-foreground">{inq.dischargePort}</span>
                </td>

                {/* Laycan */}
                <td className="py-3 px-3 text-muted-foreground text-xs">
                  {inq.laycanStart ? (
                    <>
                      {new Date(inq.laycanStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {inq.laycanEnd && (
                        <> – {new Date(inq.laycanEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>

                {/* Freight */}
                <td className="py-3 px-3">
                  {inq.freightOffered ? (
                    <span className="text-emerald-400 font-medium">${inq.freightOffered.toFixed(2)}/MT</span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>

                {/* Broker */}
                <td className="py-3 px-3 text-muted-foreground text-xs">
                  {inq.brokerName || inq.source || "—"}
                </td>

                {/* Status */}
                <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                  <StatusDropdown
                    currentStatus={inq.status}
                    onChange={s => onStatusChange(inq.id, s)}
                    disabled={isPending}
                  />
                </td>

                {/* Vessels — auto-computed fleet fit */}
                <td className="py-3 px-3" onClick={e => { e.stopPropagation(); onVesselClick(inq); }}>
                  {inq.voyageId ? (
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 cursor-pointer hover:bg-emerald-500/20 transition">
                      Assigned
                    </span>
                  ) : (fitCounts[inq.id] ?? 0) > 0 ? (
                    <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5 cursor-pointer hover:bg-blue-500/20 transition">
                      {fitCounts[inq.id]} Fit
                    </span>
                  ) : (
                    <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 cursor-pointer hover:bg-red-500/20 transition" title="No vessel in fleet can carry this cargo">
                      No Fit
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(inq)}
                      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
                      title="View Details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(inq.id)}
                      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STATUS DROPDOWN
// ═══════════════════════════════════════════════════════════════════

function StatusDropdown({ currentStatus, onChange, disabled }: {
  currentStatus: string;
  onChange: (status: string) => void;
  disabled: boolean;
}) {
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.NEW;
  return (
    <select
      value={currentStatus}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`text-xs font-medium rounded-full px-2.5 py-1 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring appearance-none ${config.bg} ${config.color}`}
      style={{ backgroundImage: "none" }}
    >
      {STATUSES.map(s => (
        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-6 w-16 bg-muted rounded" />
            <div className="h-3 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="h-9 bg-muted/50 rounded-md" />
      <div className="rounded-xl border border-border overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-border last:border-b-0">
            <div className="h-4 w-4 bg-muted rounded-full" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
