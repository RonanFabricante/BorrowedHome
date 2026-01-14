"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { DollarSign, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { EarningsSummary, LedgerEntry } from "@/lib/host/dashboard";

interface HostDashboardEarningsProps {
  hostId: string;
}

export function HostDashboardEarnings({ hostId }: HostDashboardEarningsProps) {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEarnings();
  }, [hostId]);

  const loadEarnings = async () => {
    setLoading(true);
    try {
      const [summaryRes, ledgerRes] = await Promise.all([
        fetch("/api/host/earnings"),
        fetch("/api/host/ledger"),
      ]);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      if (ledgerRes.ok) {
        const ledgerData = await ledgerRes.json();
        setLedger(ledgerData);
      }
    } catch (error) {
      console.error("Failed to load earnings:", error);
    } finally {
      setLoading(false);
    }
  };

  const groupLedgerByWeek = (entries: LedgerEntry[]) => {
    const groups: Record<string, LedgerEntry[]> = {};
    
    entries.forEach((entry) => {
      const date = new Date(entry.created_at);
      const weekStart = format(date, "yyyy-MM-dd");
      if (!groups[weekStart]) {
        groups[weekStart] = [];
      }
      groups[weekStart].push(entry);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 4); // Last 4 weeks
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Earnings Will Populate After First Completed Booking</h3>
          <p className="text-muted-foreground">
            Once you have completed bookings, your earnings and payout information will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ledgerGroups = groupLedgerByWeek(ledger);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month Gross</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.monthGross)}</div>
            <p className="text-xs text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month Net</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.monthNet)}</div>
            <p className="text-xs text-muted-foreground">After fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.pendingPayouts)}</div>
            <p className="text-xs text-muted-foreground">Awaiting transfer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Payout</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summary.lastPayout ? (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summary.lastPayout.amount)}</div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(summary.lastPayout.date), "MMM d, yyyy")}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">—</div>
                <p className="text-xs text-muted-foreground">No payouts yet</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Ledger Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {ledgerGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <div className="space-y-6">
              {ledgerGroups.map(([weekStart, entries]) => (
                <div key={weekStart}>
                  <h3 className="text-sm font-semibold mb-3">
                    Week of {format(new Date(weekStart), "MMMM d, yyyy")}
                  </h3>
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 border rounded-md"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={
                                entry.type === "credit"
                                  ? "default"
                                  : entry.type === "payout"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {entry.type}
                            </Badge>
                            {entry.booking?.listing?.title && (
                              <span className="text-sm text-muted-foreground">
                                {entry.booking.listing.title}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), "MMM d, h:mm a")}
                          </div>
                        </div>
                        <div
                          className={`text-lg font-semibold ${
                            entry.type === "credit" || entry.type === "payout"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {entry.type === "credit" || entry.type === "payout" ? "+" : "-"}
                          {formatCurrency(entry.amount_cents)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
