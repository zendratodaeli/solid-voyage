import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function PlatformSettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform Name Card */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-3.5 w-64" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-3 w-72" />
            </div>
            {/* Preview */}
            <div className="p-4 rounded-lg bg-muted/30 space-y-2">
              <Skeleton className="h-3 w-12" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-3 w-56" />
            </div>
          </CardContent>
        </Card>

        {/* Logo Card */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-3.5 w-80" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="w-20 h-20 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            </div>
            {/* Favicon */}
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit Area */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-44 rounded-md" />
      </div>
    </div>
  );
}
