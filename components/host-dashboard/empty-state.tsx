import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  actionOnClick?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  actionOnClick,
}: EmptyStateProps) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-12 text-center">
        <Icon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2 text-slate-900">{title}</h3>
        <p className="text-slate-600 mb-6 max-w-sm mx-auto">{description}</p>
        {actionLabel && (actionHref || actionOnClick) && (
          <Button
            variant="default"
            asChild={!!actionHref}
            onClick={actionOnClick}
          >
            {actionHref ? (
              <a href={actionHref}>{actionLabel}</a>
            ) : (
              actionLabel
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
