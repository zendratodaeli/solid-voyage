"use client";

/**
 * KanbanBoard — Drag-between-columns status management
 */

import { useState, useRef } from "react";
import { GripVertical, Trash2, Pencil, Ship } from "lucide-react";
import type { CargoInquiryItem } from "@/actions/cargo-inquiry-actions";

const COLUMNS = [
  { key: "DRAFT", label: "Draft", color: "border-gray-500/50", headerBg: "bg-gray-500/10 text-gray-400", statuses: ["DRAFT"] },
  { key: "NEW", label: "New-Evaluating", color: "border-blue-500/50", headerBg: "bg-blue-500/10 text-blue-400", statuses: ["NEW", "EVALUATING"] },
  { key: "OFFERED", label: "Offered-Negotiating", color: "border-purple-500/50", headerBg: "bg-purple-500/10 text-purple-400", statuses: ["OFFERED", "NEGOTIATING"] },
  { key: "FIXED", label: "Fixed", color: "border-emerald-500/50", headerBg: "bg-emerald-500/10 text-emerald-400", statuses: ["FIXED"] },
  { key: "COMPLETED", label: "Completed", color: "border-teal-500/50", headerBg: "bg-teal-500/10 text-teal-400", statuses: ["COMPLETED"] },
  { key: "REJECTED", label: "Rejected", color: "border-orange-500/50", headerBg: "bg-orange-500/10 text-orange-400", statuses: ["REJECTED"] },
  { key: "LOST", label: "Lost", color: "border-red-500/50", headerBg: "bg-red-500/10 text-red-400", statuses: ["LOST"] },
  { key: "EXPIRED", label: "Expired", color: "border-gray-500/50", headerBg: "bg-gray-500/10 text-gray-400", statuses: ["EXPIRED"] },
  { key: "WITHDRAWN", label: "Withdrawn", color: "border-slate-500/50", headerBg: "bg-slate-500/10 text-slate-400", statuses: ["WITHDRAWN"] },
] as const;

const URGENCY_DOT: Record<string, string> = {
  URGENT: "bg-red-500",
  ACTIVE: "bg-amber-500",
  PLANNING: "bg-emerald-500",
  OVERDUE: "bg-gray-500",
};

interface KanbanBoardProps {
  inquiries: CargoInquiryItem[];
  onStatusChange: (id: string, status: string) => void;
  onEdit: (inq: CargoInquiryItem) => void;
  onDelete: (id: string) => void;
}

export function KanbanBoard({ inquiries, onStatusChange, onEdit, onDelete }: KanbanBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(columnKey);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (id) {
      const inquiry = inquiries.find(i => i.id === id);
      if (inquiry && inquiry.status !== columnKey) {
        onStatusChange(id, columnKey);
      }
    }
    setDragId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {COLUMNS.map(col => {
        const items = inquiries.filter(i => (col.statuses as readonly string[]).includes(i.status));
        const isOver = dropTarget === col.key;

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-64 rounded-xl border bg-card flex flex-col transition-all duration-200 ${
              isOver ? `${col.color} border-2 bg-muted/20` : "border-border"
            }`}
            onDragOver={e => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, col.key)}
          >
            {/* Column Header */}
            <div className={`px-3 py-2.5 rounded-t-xl flex items-center justify-between ${col.headerBg}`}>
              <span className="text-xs font-semibold uppercase tracking-wider">{col.label}</span>
              <span className="text-xs font-bold opacity-60">{items.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[500px]">
              {items.length === 0 && (
                <div className="text-xs text-muted-foreground/40 text-center py-6">
                  Drop here
                </div>
              )}
              {items.map(inq => (
                <div
                  key={inq.id}
                  draggable
                  onDragStart={e => handleDragStart(e, inq.id)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-lg border border-border bg-background p-3 space-y-2 cursor-grab active:cursor-grabbing transition-all duration-150 hover:border-primary/30 hover:shadow-md group ${
                    dragId === inq.id ? "opacity-40 scale-95" : ""
                  }`}
                >
                  {/* Top row: urgency + cargo */}
                  <div className="flex items-center gap-2">
                    {inq.urgency && (
                      <div className={`h-2 w-2 rounded-full ${URGENCY_DOT[inq.urgency] || ""} shrink-0`} />
                    )}
                    <span className="text-sm font-medium truncate">{inq.cargoType}</span>
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 ml-auto shrink-0" />
                  </div>

                  {/* Quantity + Route */}
                  <div className="text-xs text-muted-foreground">
                    {inq.cargoQuantityMt.toLocaleString()} MT
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inq.loadPort} → {inq.dischargePort}
                  </div>

                  {/* Laycan */}
                  {inq.laycanStart && (
                    <div className="text-xs text-muted-foreground/60">
                      {new Date(inq.laycanStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {inq.laycanEnd && (
                        <> – {new Date(inq.laycanEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
                      )}
                    </div>
                  )}

                  {/* Freight */}
                  {inq.freightOffered && (
                    <div className="text-xs text-emerald-400 font-medium">
                      ${inq.freightOffered.toFixed(2)}/MT
                    </div>
                  )}

                  {/* Vessels */}
                  {inq.vesselCandidates.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-blue-400">
                      <Ship className="h-3 w-3" />
                      {inq.vesselCandidates.length} vessel{inq.vesselCandidates.length > 1 ? "s" : ""}
                    </div>
                  )}

                  {/* Broker */}
                  {inq.brokerName && (
                    <div className="text-[10px] text-muted-foreground/50 truncate">
                      via {inq.brokerName}
                    </div>
                  )}

                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(inq)}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDelete(inq.id)}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
