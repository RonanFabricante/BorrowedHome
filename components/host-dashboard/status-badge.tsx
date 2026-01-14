import { statusStyles, type BookingStatus } from "@/lib/ui/tokens";

interface StatusBadgeProps {
  status: BookingStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const style = statusStyles[status as BookingStatus];
  
  if (!style) {
    // Fallback for unknown statuses
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 ${className}`}>
        {status.replace("_", " ")}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.badgeClasses} ${className}`}>
      {style.label}
    </span>
  );
}
