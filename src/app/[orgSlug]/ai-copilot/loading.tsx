import { Skeleton } from "@/components/ui/skeleton";

export default function AICopilotLoading() {
  return (
    <div className="flex h-[calc(100vh-120px)] max-w-5xl mx-auto">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-1">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3.5 w-72" />
            </div>
          </div>
        </div>

        {/* Empty state — Quick Actions */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 py-12">
          <div className="text-center space-y-3 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-2xl" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-4 w-80" />
          </div>

          {/* Quick action cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-muted/20"
              >
                <Skeleton className="h-5 w-5 rounded shrink-0" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-border pt-4">
          <div className="flex items-end gap-3">
            <Skeleton className="flex-1 h-[52px] rounded-xl" />
            <Skeleton className="h-[52px] w-[52px] rounded-xl shrink-0" />
          </div>
          <div className="flex justify-center mt-3">
            <Skeleton className="h-3 w-80" />
          </div>
        </div>
      </div>
    </div>
  );
}
