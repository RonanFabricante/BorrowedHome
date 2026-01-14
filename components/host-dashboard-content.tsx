"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  DollarSign, 
  Calendar, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Eye
} from "lucide-react";
import { HostDashboardSummary } from "@/lib/host/dashboard";
import { HostDashboardRequests } from "@/components/host-dashboard-requests";
import { HostDashboardBookings } from "@/components/host-dashboard-bookings";
import { HostDashboardCalendar } from "@/components/host-dashboard-calendar";
import { HostDashboardEarnings } from "@/components/host-dashboard-earnings";
import { formatCurrency } from "@/lib/utils";

interface HostDashboardContentProps {
  hostId: string;
  summary: HostDashboardSummary;
  activeTab: string;
  initialRequests?: any[];
}

export function HostDashboardContent({
  hostId,
  summary,
  activeTab,
}: HostDashboardContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/host/dashboard?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Host Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your bookings, requests, and earnings
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setTab("requests")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pendingRequestsCount}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting your response
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setTab("bookings")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Payment</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.awaitingPaymentCount}</div>
            <p className="text-xs text-muted-foreground">
              Payment pending
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setTab("bookings")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.todaysBookingsCount}</div>
            <p className="text-xs text-muted-foreground">
              Bookings today
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setTab("earnings")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.upcomingBookingsCount}</div>
            <p className="text-xs text-muted-foreground">
              Future bookings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Payments Alert */}
      {summary.expiringPayments.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Payment Deadlines Approaching</h3>
                <p className="text-sm text-muted-foreground mb-2">
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
      <div className="border-b">
        <nav className="flex space-x-8">
          <button
            onClick={() => setTab("requests")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "requests"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
            }`}
          >
            Requests
          </button>
          <button
            onClick={() => setTab("bookings")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "bookings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
            }`}
          >
            Bookings
          </button>
          <button
            onClick={() => setTab("calendar")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "calendar"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
            }`}
          >
            Calendar
          </button>
          <button
            onClick={() => setTab("earnings")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "earnings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
            }`}
          >
            Earnings
          </button>
        </nav>
      </div>

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
