import { Card, CardContent } from "@/components/ui/card";

export function LoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-slate-200 animate-pulse">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {/* Left section */}
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              </div>
              {/* Right section */}
              <div className="flex gap-2">
                <div className="h-9 w-20 bg-slate-200 rounded"></div>
                <div className="h-9 w-20 bg-slate-200 rounded"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
