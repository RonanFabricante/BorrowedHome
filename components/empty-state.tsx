import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  actionOnClick?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  actionOnClick,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "bh-card flex flex-col items-center text-center px-6 py-12 sm:py-16",
        className
      )}
    >
      {Icon && (
        <Icon className="h-10 w-10 text-muted-foreground mb-4" aria-hidden />
      )}
      <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      {actionLabel && !actionHref && actionOnClick && (
        <Button type="button" onClick={actionOnClick}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
