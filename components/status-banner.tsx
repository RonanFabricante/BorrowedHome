import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type StatusVariant = "info" | "success" | "warning" | "error";

const variantClasses: Record<StatusVariant, string> = {
  info: "bh-status-banner bh-status-banner--info",
  success: "bh-status-banner bh-status-banner--success",
  warning: "bh-status-banner bh-status-banner--warning",
  error: "bh-status-banner bh-status-banner--error",
};

interface StatusBannerProps {
  variant?: StatusVariant;
  title: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function StatusBanner({
  variant = "info",
  title,
  children,
  icon: Icon,
  className,
}: StatusBannerProps) {
  return (
    <div className={cn(variantClasses[variant], className)} role="status">
      <div className="flex gap-3">
        {Icon && (
          <Icon className="h-5 w-5 shrink-0 mt-0.5 text-primary" aria-hidden />
        )}
        <div>
          <p className="font-semibold">{title}</p>
          {children && (
            <div className="text-sm text-muted-foreground mt-1">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
