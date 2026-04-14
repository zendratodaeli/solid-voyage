import { Skeleton } from "@/components/ui/skeleton";

export default function PageSlugLoading() {
  return (
    <div className="min-h-screen">
      {/* Navigation bar area */}
      <div className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        {/* Title */}
        <div className="space-y-3">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-4 w-48" />
        </div>

        {/* Content paragraphs */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-6 w-48 mt-6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-6 w-56 mt-6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-6 w-40 mt-6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
