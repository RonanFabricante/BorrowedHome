"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import type { HostDashboardSummary, HostBooking } from "@/lib/host/dashboard";
import { HostDashboardRequests } from "@/components/host-dashboard-requests";
import { HostDashboardBookings } from "@/components/host-dashboard-bookings";
import { HostDashboardCalendar } from "@/components/host-dashboard-calendar";
import { HostDashboardEarnings } from "@/components/host-dashboard-earnings";
import { DashboardHeader } from "@/components/host-dashboard/dashboard-header";
import { KpiCardGrid } from "@/components/host-dashboard/kpi-card-grid";
import { DashboardTabs } from "@/components/host-dashboard/dashboard-tabs";

interface HostDashboardContentProps {
  hostId: string;
  summary: HostDashboardSummary;
  activeTab: string;
  initialRequests?: HostBooking[];
}

export function HostDashboardContent({
  hostId,
  summary,
  activeTab,
  initialRequests,
}: HostDashboardContentProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader />

      {/* KPI Cards */}
      <KpiCardGrid summary={summary} />

      {/* Expiring Payments Alert */}
      {summary.expiringPayments.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Payment Deadlines Approaching</h3>
                <p className="text-sm text-slate-600 mb-2">
                  {summary.expiringPayments.length} payment{summary.expiringPayments.length !== 1 ? "s" : ""} expiring within 60 minutes:
                </p>
                <ul className="text-sm space-y-1">
                  {summary.expiringPayments.map((payment) => (
                    <li key={payment.bookingId}>
                      <Link 
                        href={`/bookings/${payment.bookingId}/confirm`}
                        className="text-primary hover:underline"
                      >
                        {payment.listingTitle}
                      </Link>
                      {" - "}
                      {new Date(payment.deadlineAt).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <DashboardTabs activeTab={activeTab} />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "requests" && (
          <HostDashboardRequests hostId={hostId} initialRequests={initialRequests} />
        )}
        {activeTab === "bookings" && (
          <HostDashboardBookings hostId={hostId} />
        )}
        {activeTab === "calendar" && (
          <HostDashboardCalendar hostId={hostId} />
        )}
        {activeTab === "earnings" && (
          <HostDashboardEarnings hostId={hostId} />
        )}
      </div>
    </div>
  );
}
