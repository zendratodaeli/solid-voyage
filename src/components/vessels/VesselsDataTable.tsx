"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Anchor,
  MoreHorizontal,
  Pencil,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Ship,
  FileDown,
  Loader2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export interface VesselRow {
  id: string;
  name: string;
  vesselType: string;
  vesselTypeLabel: string;
  dwt: number;
  ladenSpeed: number;
  ladenConsumption: number | null;
  dailyOpex: number | null;
  commercialControl: string;
  voyagesCount: number;
  createdByName: string | null;
}

interface VesselsDataTableProps {
  vessels: VesselRow[];
  showDelete: boolean;
}

// ─── Formatting Helpers ─────────────────────────────────────────────

function fmtNum(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Component ──────────────────────────────────────────────────────

export function VesselsDataTable({ vessels, showDelete }: VesselsDataTableProps) {
  const [layout, setLayout] = useState<"table" | "grid">("table");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const routeParams = useParams();
  const orgSlug = routeParams.orgSlug as string;

  // Search value (shared between table filtering and grid filtering)
  const searchValue =
    (columnFilters.find((f) => f.id === "name")?.value as string) ?? "";

  const setSearch = (value: string) => {
    setColumnFilters((prev) => {
      const withoutName = prev.filter((f) => f.id !== "name");
      if (!value) return withoutName;
      return [...withoutName, { id: "name", value }];
    });
  };

  // ─── Column Definitions ─────────────────────────────────────────

  const columns = useMemo<ColumnDef<VesselRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Vessel",
        cell: ({ row }) => (
          <Link
            href={`/${orgSlug}/vessels/${row.original.id}/edit`}
            className="group/link"
          >
            <div className="min-w-[160px]">
              <p className="font-semibold group-hover/link:text-primary transition-colors">
                {row.original.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.original.vesselTypeLabel}
              </p>
            </div>
          </Link>
        ),
        filterFn: "includesString",
      },
      {
        id: "specs",
        header: "Specs",
        cell: ({ row }) => (
          <div className="min-w-[130px]">
            <p className="text-sm font-medium tabular-nums">
              {fmtNum(row.original.dwt)}{" "}
              <span className="text-muted-foreground font-normal">MT</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.ladenSpeed} kn
            </p>
          </div>
        ),
      },
      {
        id: "economics",
        header: "Economics",
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <p className="text-sm font-medium tabular-nums">
              {row.original.ladenConsumption}{" "}
              <span className="text-muted-foreground font-normal">MT/day</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.commercialControl === "TIME_CHARTER"
                ? "Hire "
                : row.original.commercialControl !== "VOYAGE_CHARTER"
                  ? "OPEX "
                  : ""}
              {row.original.dailyOpex != null
                ? `${fmtCurrency(row.original.dailyOpex)}/day`
                : "—"}
            </p>
          </div>
        ),
      },
      {
        id: "activity",
        header: "Activity",
        cell: ({ row }) => (
          <div className="min-w-[100px]">
            <Badge variant="secondary" className="text-xs">
              {row.original.voyagesCount} voyage
              {row.original.voyagesCount !== 1 ? "s" : ""}
            </Badge>
            {row.original.createdByName && (
              <p className="text-xs text-muted-foreground mt-1">
                by {row.original.createdByName}
              </p>
            )}
          </div>
        ),
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
                    href={`/${orgSlug}/vessels/${row.original.id}`}
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${orgSlug}/vessels/${row.original.id}/edit`}
                    className="flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${orgSlug}/voyages/new?vesselId=${row.original.id}`}
                    className="flex items-center gap-2"
                  >
                    <Ship className="h-4 w-4" />
                    New Voyage
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onClick={async () => {
                    try {
                      const { generateVesselPdf } = await import("@/lib/pdf/vessel-pdf");
                      await generateVesselPdf(row.original.id);
                      toast.success("Report generated successfully!");
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to generate report");
                    }
                  }}
                >
                  <FileDown className="h-4 w-4" />
                  Generate Report
                </DropdownMenuItem>
                {showDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <DeleteButton
                        id={row.original.id}
                        type="vessel"
                        name={row.original.name}
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
    [showDelete, orgSlug]
  );

  // ─── Table Instance ─────────────────────────────────────────────

  const table = useReactTable({
    data: vessels,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // For the grid view, filter manually using the same search value
  const filteredVessels = useMemo(() => {
    if (!searchValue) return vessels;
    const q = searchValue.toLowerCase();
    return vessels.filter((v) => v.name.toLowerCase().includes(q));
  }, [vessels, searchValue]);

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search vessels..."
            value={searchValue}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {layout === "table"
            ? `${table.getFilteredRowModel().rows.length} vessel${table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}`
            : `${filteredVessels.length} vessel${filteredVessels.length !== 1 ? "s" : ""}`}
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
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getFilteredRowModel().rows.length ? (
                table.getFilteredRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No vessels found.
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
          {filteredVessels.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No vessels found.
            </div>
          ) : (
            filteredVessels.map((vessel) => (
              <VesselGridCard
                key={vessel.id}
                vessel={vessel}
                showDelete={showDelete}
                orgSlug={orgSlug}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grid Card ──────────────────────────────────────────────────────

function VesselGridCard({
  vessel,
  showDelete,
  orgSlug,
}: {
  vessel: VesselRow;
  showDelete: boolean;
  orgSlug: string;
}) {
  const router = useRouter();

  return (
    <Card
      className="transition-all hover:bg-accent/50 hover:border-primary/30 cursor-pointer"
      onClick={() => router.push(`/${orgSlug}/vessels/${vessel.id}`)}
    >
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Anchor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{vessel.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {vessel.vesselTypeLabel}
            </p>
          </div>
        </div>
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
                  href={`/${orgSlug}/vessels/${vessel.id}`}
                  className="flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/${orgSlug}/vessels/${vessel.id}/edit`}
                  className="flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/${orgSlug}/voyages/new?vesselId=${vessel.id}`}
                  className="flex items-center gap-2"
                >
                  <Ship className="h-4 w-4" />
                  New Voyage
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={async () => {
                  try {
                    const { generateVesselPdf } = await import("@/lib/pdf/vessel-pdf");
                    await generateVesselPdf(vessel.id);
                    toast.success("Report generated successfully!");
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to generate report");
                  }
                }}
              >
                <FileDown className="h-4 w-4" />
                Generate Report
              </DropdownMenuItem>
              {showDelete && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <DeleteButton
                      id={vessel.id}
                      type="vessel"
                      name={vessel.name}
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
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <GridSpecItem label="DWT" value={`${fmtNum(vessel.dwt)} MT`} />
          <GridSpecItem label="Speed" value={`${vessel.ladenSpeed} kn`} />
          <GridSpecItem
            label="Consumption"
            value={`${vessel.ladenConsumption} MT/day`}
          />
          {vessel.commercialControl === "TIME_CHARTER" ? (
            <GridSpecItem
              label="Daily Hire"
              value={fmtCurrency(vessel.dailyOpex ?? 0)}
            />
          ) : vessel.commercialControl !== "VOYAGE_CHARTER" ? (
            <GridSpecItem
              label="Daily OPEX"
              value={fmtCurrency(vessel.dailyOpex ?? 0)}
            />
          ) : (
            <GridSpecItem label="Charter" value="Voyage Charter" />
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {vessel.voyagesCount} voyage
              {vessel.voyagesCount !== 1 ? "s" : ""}
            </Badge>
            {vessel.createdByName && (
              <span className="text-xs text-muted-foreground">
                by {vessel.createdByName}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GridSpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
