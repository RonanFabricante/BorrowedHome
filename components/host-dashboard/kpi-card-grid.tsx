"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HostDashboardSummary } from "@/lib/host/dashboard";
import { Clock, DollarSign, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { surfaceClasses, typographyClasses } from "@/lib/ui/tokens";

interface KpiCardGridProps {
  summary: HostDashboardSummary;
}

export function KpiCardGrid({ summary }: KpiCardGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleCardClick = (tab: string, status?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (status) {
      params.set("status", status);
    }
    router.push(`/host/dashboard?${params.toString()}`);
  };

  const kpis = [
    {
      label: "Pending Requests",
      value: summary.pendingRequestsCount,
      helper: "Awaiting your response",
      icon: Clock,
      onClick: () => handleCardClick("requests"),
      hasAction: summary.pendingRequestsCount > 0,
    },
    {
      label: "Awaiting Payment",
      value: summary.awaitingPaymentCount,
      helper: "Payment pending",
      icon: DollarSign,
      onClick: () => handleCardClick("bookings", "PAYMENT_PENDING"),
      hasAction: summary.awaitingPaymentCount > 0,
    },
    {
      label: "Today",
      value: summary.todaysBookingsCount,
      helper: "Bookings today",
      icon: Calendar,
      onClick: () => handleCardClick("bookings"),
      hasAction: summary.todaysBookingsCount > 0,
    },
    {
      label: "Upcoming",
      value: summary.upcomingBookingsCount,
      helper: "Future bookings",
      icon: CheckCircle2,
      onClick: () => handleCardClick("bookings"),
      hasAction: summary.upcomingBookingsCount > 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={kpi.label}
            className={`${surfaceClasses.card} cursor-pointer transition-all hover:shadow-md ${
              kpi.hasAction ? "border-l-4 border-l-primary" : ""
            }`}
            onClick={kpi.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className={`${typographyClasses.sectionLabel}`}>
                {kpi.label}
              </span>
              <Icon className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {kpi.value}
              </div>
              <p className={`${typographyClasses.smallMuted} mt-1`}>
                {kpi.helper}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
