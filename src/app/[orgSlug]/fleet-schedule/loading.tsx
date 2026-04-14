import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function FleetScheduleLoading() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-3 flex items-center gap-2.5">
              <Skeleton className="w-4 h-4 rounded" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-2 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-32 ml-2" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>

      {/* Timeline skeleton */}
      <Card>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex border-b border-border/50 h-14 items-center">
            <div className="w-[200px] shrink-0 px-3 space-y-1.5 border-r border-border/30">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex-1 px-2">
              <Skeleton className="h-8 rounded" style={{ width: `${50 - i * 8}%`, marginLeft: `${10 + i * 5}%` }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
