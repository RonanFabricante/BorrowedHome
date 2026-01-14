import { typographyClasses } from "@/lib/ui/tokens";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
}

export function DashboardHeader({
  title = "Host Dashboard",
  subtitle = "Manage your bookings, requests, and earnings",
}: DashboardHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className={typographyClasses.h1}>{title}</h1>
      <p className={`${typographyClasses.mutedText} mt-2`}>{subtitle}</p>
    </div>
  );
}
