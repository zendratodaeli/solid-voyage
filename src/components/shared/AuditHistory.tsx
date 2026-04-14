"use client";

import { useState, useEffect, useCallback } from "react";
import {
  History,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Share2,
  Eye,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  userId: string;
  userName: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

interface AuditHistoryProps {
  entityType?: "vessel" | "voyage";
  entityId?: string;
  limit?: number;
}

const actionConfig: Record<string, {
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
}> = {
  created: {
    icon: <Plus className="h-3.5 w-3.5" />,
    color: "text-green-400",
    bg: "bg-green-500/20",
    label: "Created",
  },
  updated: {
    icon: <Pencil className="h-3.5 w-3.5" />,
    color: "text-blue-400",
    bg: "bg-blue-500/20",
    label: "Updated",
  },
  deleted: {
    icon: <Trash2 className="h-3.5 w-3.5" />,
    color: "text-red-400",
    bg: "bg-red-500/20",
    label: "Deleted",
  },
  shared: {
    icon: <Share2 className="h-3.5 w-3.5" />,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    label: "Shared",
  },
  viewed: {
    icon: <Eye className="h-3.5 w-3.5" />,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "Viewed",
  },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") return val.toLocaleString();
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

export function AuditHistory({ entityType, entityId, limit = 20 }: AuditHistoryProps) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (entityType) params.set("entityType", entityType);
      if (entityId) params.set("entityId", entityId);
      params.set("limit", String(limit));

      const res = await fetch(`/api/audit-log?${params}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      }
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Activity History
            {logs.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {logs.length}
              </Badge>
            )}
          </CardTitle>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No activity recorded yet
            </p>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-0">
                {logs.map((log) => {
                  const config = actionConfig[log.action] || actionConfig.viewed;
                  const hasChanges = log.changes && Object.keys(log.changes).length > 0;
                  const isExpanded = expandedEntries.has(log.id);

                  return (
                    <div key={log.id} className="relative pl-9 py-2.5 group">
                      {/* Timeline dot */}
                      <div
                        className={`absolute left-[9px] top-[14px] w-[13px] h-[13px] rounded-full border-2 border-background ${config.bg} flex items-center justify-center`}
                      >
                        <div className={`w-[7px] h-[7px] rounded-full ${config.bg}`} />
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.color}`}>
                              {config.icon}
                              {config.label}
                            </span>
                            {!entityId && (
                              <span className="text-sm font-medium truncate">
                                {log.entityName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              by {log.userName}
                            </span>
                            <span className="text-xs text-muted-foreground/50">•</span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(log.createdAt)}
                            </span>
                          </div>
                        </div>

                        {hasChanges && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => toggleEntry(log.id)}
                          >
                            {isExpanded ? "Hide" : "Changes"}
                          </Button>
                        )}
                      </div>

                      {/* Expanded changes diff */}
                      {hasChanges && isExpanded && (
                        <div className="mt-2 rounded-md bg-muted/50 border border-border/50 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/50">
                                <th className="text-left py-1.5 px-3 font-medium text-muted-foreground">Field</th>
                                <th className="text-left py-1.5 px-3 font-medium text-red-400/70">Before</th>
                                <th className="text-left py-1.5 px-3 font-medium text-green-400/70">After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(log.changes!).map(([field, diff]) => (
                                <tr key={field} className="border-b border-border/30 last:border-0">
                                  <td className="py-1.5 px-3 text-muted-foreground font-medium capitalize">
                                    {field.replace(/([A-Z])/g, " $1").trim()}
                                  </td>
                                  <td className="py-1.5 px-3 text-red-400/80 line-through">
                                    {formatValue(diff.from)}
                                  </td>
                                  <td className="py-1.5 px-3 text-green-400/80">
                                    {formatValue(diff.to)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
