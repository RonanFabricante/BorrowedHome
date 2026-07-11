import { typographyClasses } from "@/lib/ui/tokens";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
}

export function DashboardHeader({
  title = "host dashboard",
  subtitle = "bookings · requests · earnings",
}: DashboardHeaderProps) {
  return (
    <div className="mb-8">
      <p className="bh-micro mb-2">host</p>
      <h1 className={typographyClasses.h1}>{title}</h1>
      <p className="bh-data mt-2 text-sm text-accent-ink">{subtitle}</p>
    </div>
  );
}
