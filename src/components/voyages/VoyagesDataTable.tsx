"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { usePusher } from "@/hooks/use-pusher";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Search,
  LayoutGrid,
  Table as TableIcon,
  Trash2,
  FileDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/DeleteButton";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────

export interface VoyageRow {
  id: string;
  route: string;
  vesselName: string;
  loadPort: string;
  dischargePort: string;
  status: string;
  statusLabel: string;
  tce: number;
  voyagePnl: number | null;
  breakEvenFreight: number;
  offeredFreight: number | null;
  recommendation: string | null;
  updatedAt: string; // ISO string for serialization
  createdAt: string; // ISO string for serialization
  creatorName: string;
  isOwner: boolean;
  laycanStart: string | null;
  laycanEnd: string | null;
}

interface VoyagesDataTableProps {
  voyages: VoyageRow[];
}

// ─── Constants ──────────────────────────────────────────────────────

const recommendationColors: Record<string, string> = {
  STRONG_ACCEPT: "bg-green-500/20 text-green-400 border-green-500/30",
  ACCEPT: "bg-green-500/10 text-green-400 border-green-500/20",
  NEGOTIATE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  REJECT: "bg-red-500/10 text-red-400 border-red-500/20",
  STRONG_REJECT: "bg-red-500/20 text-red-400 border-red-500/30",
};

const recommendationLabels: Record<string, string> = {
  STRONG_ACCEPT: "Strong Accept",
  ACCEPT: "Accept",
  NEGOTIATE: "Negotiate",
  REJECT: "Reject",
  STRONG_REJECT: "Strong Reject",
};

const statusColors: Record<string, string> = {
  DRAFT: "",
  NEW: "bg-blue-500/20 text-blue-400",
  OFFERED: "bg-purple-500/20 text-purple-400",
  FIXED: "bg-emerald-500/20 text-emerald-400",
  COMPLETED: "bg-teal-500/20 text-teal-400",
  REJECTED: "bg-red-500/20 text-red-400",
  LOST: "bg-red-500/20 text-red-400",
  EXPIRED: "bg-gray-500/20 text-gray-400",
  WITHDRAWN: "bg-slate-500/20 text-slate-400",
};

// ─── Formatting Helpers ─────────────────────────────────────────────

function fmtTce(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day`;
}

function fmtUsd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFreight(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/MT`;
}

function fmtRelativeTime(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtLaycan(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!end) return s;
  const e = new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${s} – ${e}`;
}

function getLaycanUrgency(start: string | null): { label: string; color: string } {
  if (!start) return { label: "", color: "" };
  const now = new Date();
  const d = new Date(start);
  const daysUntil = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return { label: "Overdue", color: "text-gray-400" };
  if (daysUntil <= 3) return { label: "Urgent", color: "text-red-400" };
  if (daysUntil <= 7) return { label: "Active", color: "text-amber-400" };
  return { label: `${daysUntil}d`, color: "text-blue-400" };
}

function getPnlColor(pnl: number | null) {
  if (pnl === null) return "";
  return pnl >= 0 ? "text-green-400" : "text-red-400";
}

// ─── Component ──────────────────────────────────────────────────────

export function VoyagesDataTable({ voyages: initialVoyages }: VoyagesDataTableProps) {
  const [layout, setLayout] = useState<"table" | "grid">("grid");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [voyages, setVoyages] = useState(initialVoyages);
  const routeParams = useParams();
  const orgSlug = routeParams.orgSlug as string;
  const router = useRouter();

  // Status label map for instant patching
  const STATUS_LABELS: Record<string, string> = {
    DRAFT: "Draft", NEW: "New-Evaluating", OFFERED: "Offered-Negotiating",
    FIXED: "Fixed", COMPLETED: "Completed", REJECTED: "Rejected",
    LOST: "Lost", EXPIRED: "Expired", WITHDRAWN: "Withdrawn",
  };

  // ── Real-time: instant status patch from Pusher ──────────────────
  usePusher({
    onVoyageUpdated: useCallback((data: { voyageId: string; status: string }) => {
      setVoyages(prev => prev.map(v =>
        v.id === data.voyageId
          ? { ...v, status: data.status, statusLabel: STATUS_LABELS[data.status] || data.status, updatedAt: new Date().toISOString() }
          : v
      ));
      // Background: refresh server data for full consistency
      router.refresh();
    }, [router]),
  });

  const searchValue =
    (columnFilters.find((f) => f.id === "route")?.value as string) ?? "";

  const setSearch = (value: string) => {
    setColumnFilters((prev) => {
      const without = prev.filter((f) => f.id !== "route");
      if (!value) return without;
      return [...without, { id: "route", value }];
    });
  };

  // Download PDF report for a voyage
  const handleDownloadPdf = async (voyageId: string) => {
    setDownloadingId(voyageId);
    try {
      const { generateVoyagePdf } = await import("@/lib/pdf/voyage-pdf");
      await generateVoyagePdf(null, { voyageId });
      toast.success("Report generated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate report");
    } finally {
      setDownloadingId(null);
    }
  };

  // ─── Column Definitions ─────────────────────────────────────────

  const columns = useMemo<ColumnDef<VoyageRow>[]>(
    () => [
      {
        id: "route",
        accessorKey: "route",
        header: "Voyage",
        cell: ({ row }) => (
          <Link href={`/${orgSlug}/voyages/${row.original.id}`} className="group/link">
            <div className="min-w-[160px]">
              <p className="font-semibold group-hover/link:text-primary transition-colors">
                {row.original.route}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.original.vesselName}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                by {row.original.creatorName} · {fmtRelativeTime(row.original.createdAt)}
              </p>
            </div>
          </Link>
        ),
        filterFn: "includesString",
      },
      {
        id: "profitability",
        header: "Profitability",
        cell: ({ row }) => (
          <div className="min-w-[130px]">
            <p className={`text-sm font-medium tabular-nums ${row.original.tce > 0 ? "text-green-400" : "text-red-400"}`}>
              {fmtTce(row.original.tce)}
            </p>
            <p className={`text-xs tabular-nums ${getPnlColor(row.original.voyagePnl)}`}>
              P&L {row.original.voyagePnl !== null ? fmtUsd(row.original.voyagePnl) : "—"}
            </p>
          </div>
        ),
      },
      {
        id: "freight",
        header: "Freight",
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <p className="text-sm font-medium tabular-nums">
              {fmtFreight(row.original.breakEvenFreight)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Offered {row.original.offeredFreight !== null ? fmtFreight(row.original.offeredFreight) : "—"}
            </p>
          </div>
        ),
      },
      {
        id: "recommendation",
        header: "Signal",
        cell: ({ row }) => {
          const rec = row.original.recommendation;
          if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <Badge variant="outline" className={recommendationColors[rec] ?? ""}>
              {recommendationLabels[rec] ?? rec}
            </Badge>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`text-xs ${statusColors[row.original.status] ?? ""}`}>
              {row.original.statusLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {fmtRelativeTime(row.original.updatedAt)}
            </span>
          </div>
        ),
      },
      {
        id: "laycan",
        header: "Laycan",
        cell: ({ row }) => {
          const { laycanStart, laycanEnd } = row.original;
          if (!laycanStart) return <span className="text-xs text-muted-foreground">—</span>;
          const urgency = getLaycanUrgency(laycanStart);
          return (
            <div className="min-w-[100px]">
              <p className="text-sm tabular-nums">{fmtLaycan(laycanStart, laycanEnd)}</p>
              {urgency.label && (
                <p className={`text-xs font-medium ${urgency.color}`}>{urgency.label}</p>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="text-right w-full block">Actions</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${orgSlug}/voyages/${row.original.id}`}
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${orgSlug}/voyages/${row.original.id}`}
                    className="flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  disabled={downloadingId === row.original.id}
                  onClick={() => handleDownloadPdf(row.original.id)}
                >
                  {downloadingId === row.original.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Generate Report
                </DropdownMenuItem>
                {row.original.isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <DeleteButton
                        id={row.original.id}
                        type="voyage"
                        name={row.original.route}
                        variant="ghost"
                        size="sm"
                        showText={true}
                      />
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [orgSlug]
  );

  // ─── Table Instance ─────────────────────────────────────────────

  const table = useReactTable({
    data: voyages,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // For grid view — filter manually with same search value
  const filteredVoyages = useMemo(() => {
    if (!searchValue) return voyages;
    const q = searchValue.toLowerCase();
    return voyages.filter(
      (v) =>
        v.route.toLowerCase().includes(q) ||
        v.vesselName.toLowerCase().includes(q)
    );
  }, [voyages, searchValue]);

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search voyages..."
            value={searchValue}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {layout === "table"
            ? `${table.getFilteredRowModel().rows.length} voyage${table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}`
            : `${filteredVoyages.length} voyage${filteredVoyages.length !== 1 ? "s" : ""}`}
        </span>
        <div className="ml-auto flex items-center rounded-lg border border-border p-0.5">
          <Button
            variant={layout === "table" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setLayout("table")}
            title="Table view"
          >
            <TableIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={layout === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setLayout("grid")}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table Layout */}
      {layout === "table" && (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                  {hg.headers.map((header) => (
                    <TableHead key={header.id} className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getFilteredRowModel().rows.length ? (
                table.getFilteredRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No voyages found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grid Layout */}
      {layout === "grid" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredVoyages.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No voyages found.
            </div>
          ) : (
            filteredVoyages.map((voyage) => (
              <VoyageGridCard key={voyage.id} voyage={voyage} orgSlug={orgSlug} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grid Card ──────────────────────────────────────────────────────

function VoyageGridCard({ voyage, orgSlug }: { voyage: VoyageRow; orgSlug: string }) {
  const rec = voyage.recommendation;
  const router = useRouter();

  return (
    <Card
      className="transition-all hover:bg-accent/50 hover:border-primary/30 h-full cursor-pointer"
      onClick={() => router.push(`/${orgSlug}/voyages/${voyage.id}`)}
    >
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">
              {voyage.route}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {voyage.vesselName}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              by {voyage.creatorName} · {fmtRelativeTime(voyage.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-2 shrink-0">
            {rec && (
              <Badge variant="outline" className={recommendationColors[rec] ?? ""}>
                {recommendationLabels[rec] ?? rec}
              </Badge>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/${orgSlug}/voyages/${voyage.id}`}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/${orgSlug}/voyages/${voyage.id}`}
                      className="flex items-center gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <VoyageReportMenuItem voyageId={voyage.id} />
                  </DropdownMenuItem>
                  {voyage.isOwner && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <DeleteButton
                          id={voyage.id}
                          type="voyage"
                          name={voyage.route}
                          variant="ghost"
                          size="sm"
                          showText={true}
                        />
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <MetricItem
            label="TCE"
            value={fmtTce(voyage.tce)}
            className={voyage.tce > 0 ? "text-green-400" : "text-red-400"}
          />
          <MetricItem
            label="P&L"
            value={voyage.voyagePnl !== null ? fmtUsd(voyage.voyagePnl) : "—"}
            className={getPnlColor(voyage.voyagePnl)}
          />
          <MetricItem
            label="Break-even"
            value={fmtFreight(voyage.breakEvenFreight)}
          />
          <MetricItem
            label="Offered"
            value={voyage.offeredFreight !== null ? fmtFreight(voyage.offeredFreight) : "—"}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`text-xs ${statusColors[voyage.status] ?? ""}`}>
              {voyage.statusLabel}
            </Badge>
            {(() => {
              if (!voyage.laycanStart) {
                return <span className="text-xs text-muted-foreground">Laycan: Not set</span>;
              }
              const urgency = getLaycanUrgency(voyage.laycanStart);
              return (
                <span className={`text-xs ${urgency.color}`}>
                  {fmtLaycan(voyage.laycanStart, voyage.laycanEnd)}
                  {urgency.label ? ` · ${urgency.label}` : ""}
                </span>
              );
            })()}
          </div>
          <span className="text-xs text-muted-foreground">
            {fmtRelativeTime(voyage.updatedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${className}`}>{value}</p>
    </div>
  );
}

// ─── Grid Card Report Menu Item (for dropdown) ────────────────────

function VoyageReportMenuItem({ voyageId }: { voyageId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const { generateVoyagePdf } = await import("@/lib/pdf/voyage-pdf");
      await generateVoyagePdf(null, { voyageId });
      toast.success("Report generated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate report");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
      disabled={isLoading}
      onClick={handleClick}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      Generate Report
    </button>
  );
}
