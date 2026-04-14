import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function LaytimeCalculatorLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-9 w-52" />
          </div>
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Calculation Cards */}
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                {/* Left: Icon + Info */}
                <div className="flex items-center gap-4 flex-1">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-4 w-14 rounded-full" />
                      <Skeleton className="h-3.5 w-12" />
                    </div>
                  </div>
                </div>

                {/* Right: Result */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right space-y-1">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-6 w-28" />
                  </div>
                  <Skeleton className="h-3.5 w-24 hidden md:block" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
