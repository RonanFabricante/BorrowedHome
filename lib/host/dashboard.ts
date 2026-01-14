// Server-side data access functions for Host Dashboard
import { createClient } from "@/lib/supabase/server";

export interface HostDashboardSummary {
  pendingRequestsCount: number;
  awaitingPaymentCount: number;
  todaysBookingsCount: number;
  upcomingBookingsCount: number;
  expiringPayments: Array<{
    bookingId: string;
    listingTitle: string;
    deadlineAt: string;
  }>;
}

export interface HostBooking {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  created_at: string;
  payment_deadline_at: string | null;
  total_amount: number;
  guests_count: number;
  listing: {
    id: string;
    title: string;
    location_text: string;
  };
  guest: {
    id: string;
    full_name: string | null;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  status: string;
  listingId: string;
  listingTitle: string;
  guestName: string | null;
}

export interface EarningsSummary {
  monthGross: number;
  monthNet: number;
  pendingPayouts: number;
  lastPayout: {
    amount: number;
    date: string;
  } | null;
}

export interface LedgerEntry {
  id: string;
  booking_id: string | null;
  type: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  booking?: {
    id: string;
    listing?: {
      title: string;
    };
  };
}

/**
 * Get dashboard summary for a host
 */
export async function getHostDashboardSummary(
  hostId: string
): Promise<HostDashboardSummary> {
  const supabase = await createClient();

  // Get listing IDs for this host
  const { data: listings } = await supabase
    .from("listings")
    .select("id")
    .eq("host_id", hostId);

  if (!listings || listings.length === 0) {
    return {
      pendingRequestsCount: 0,
      awaitingPaymentCount: 0,
      todaysBookingsCount: 0,
      upcomingBookingsCount: 0,
      expiringPaymentsCount: 0,
    };
  }

  const listingIds = listings.map((l) => l.id);

  // Get pending requests (REQUESTED)
  const { count: pendingRequestsCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "REQUESTED")
    .in("listing_id", listingIds);

  // Get awaiting payment (PAYMENT_PENDING)
  const { count: awaitingPaymentCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "PAYMENT_PENDING")
    .in("listing_id", listingIds);

  // Get today's bookings (CONFIRMED where start_time is today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { count: todaysBookingsCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "CONFIRMED")
    .gte("start_at", todayStart.toISOString())
    .lte("start_at", todayEnd.toISOString())
    .in("listing_id", listingIds);

  // Get upcoming bookings (CONFIRMED start_time > now)
  const now = new Date();
  const { count: upcomingBookingsCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("status", "CONFIRMED")
    .gt("start_at", now.toISOString())
    .in("listing_id", listingIds);

  // Get expiring payments (PAYMENT_PENDING with deadline within 60 minutes)
  const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const { data: expiringPaymentsData } = await supabase
    .from("bookings")
    .select(`
      id,
      payment_deadline_at,
      listings!inner(id, title, host_id)
    `)
    .eq("status", "PAYMENT_PENDING")
    .eq("listings.host_id", hostId)
    .not("payment_deadline_at", "is", null)
    .lte("payment_deadline_at", sixtyMinutesFromNow.toISOString())
    .gt("payment_deadline_at", now.toISOString())
    .order("payment_deadline_at", { ascending: true })
    .limit(10);

  const expiringPayments = (expiringPaymentsData || []).map((b: any) => ({
    bookingId: b.id,
    listingTitle: b.listings?.title || "Unknown",
    deadlineAt: b.payment_deadline_at,
  }));

  return {
    pendingRequestsCount: pendingRequestsCount || 0,
    awaitingPaymentCount: awaitingPaymentCount || 0,
    todaysBookingsCount: todaysBookingsCount || 0,
    upcomingBookingsCount: upcomingBookingsCount || 0,
    expiringPayments,
  };
}

/**
 * Get host bookings with filters
 */
export async function getHostBookings(
  hostId: string,
  options: {
    status?: string;
    q?: string;
    from?: string;
    to?: string;
    sort?: "created_at" | "start_at";
  } = {}
): Promise<HostBooking[]> {
  const supabase = await createClient();
  const { status, q, from, to, sort = "created_at" } = options;

  // First get listing IDs for this host
  const { data: listings } = await supabase
    .from("listings")
    .select("id")
    .eq("host_id", hostId);

  if (!listings || listings.length === 0) {
    return [];
  }

  const listingIds = listings.map((l) => l.id);

  // Build query
  let query = supabase
    .from("bookings")
    .select(`
      id,
      status,
      start_at,
      end_at,
      created_at,
      payment_deadline_at,
      total_amount,
      guests_count,
      listings!inner(id, title, location_text, host_id),
      profiles!bookings_guest_id_fkey(id, full_name)
    `)
    .in("listing_id", listingIds)
    .eq("listings.host_id", hostId);

  // Apply status filter
  if (status && status !== "ALL") {
    query = query.eq("status", status);
  }

  // Apply date range filters
  if (from) {
    query = query.gte("start_at", from);
  }
  if (to) {
    query = query.lte("start_at", to);
  }

  // Apply search query (listing title or guest name)
  // Note: Supabase doesn't support OR across joined tables easily
  // For MVP, we'll search listing title (most common case)
  // For production, consider a full-text search RPC function
  if (q) {
    const searchTerm = `%${q}%`;
    query = query.ilike("listings.title", searchTerm);
  }

  // Apply sorting
  query = query.order(sort, { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("[getHostBookings] Error:", error);
    return [];
  }

  return (data || []).map((b: any) => ({
    id: b.id,
    status: b.status,
    start_at: b.start_at,
    end_at: b.end_at,
    created_at: b.created_at,
    payment_deadline_at: b.payment_deadline_at,
    total_amount: b.total_amount,
    guests_count: b.guests_count,
    listing: {
      id: b.listings.id,
      title: b.listings.title,
      location_text: b.listings.location_text,
    },
    guest: {
      id: b.profiles.id,
      full_name: b.profiles.full_name,
    },
  }));
}

/**
 * Get calendar events for a date range
 */
export async function getHostCalendarBookings(
  hostId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  // Get listing IDs for this host
  const { data: listings } = await supabase
    .from("listings")
    .select("id")
    .eq("host_id", hostId);

  if (!listings || listings.length === 0) {
    return [];
  }

  const listingIds = listings.map((l) => l.id);

  // Get bookings in date range (CONFIRMED and PAYMENT_PENDING)
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      start_at,
      end_at,
      listings!inner(id, title, host_id),
      profiles!bookings_guest_id_fkey(full_name)
    `)
    .in("listing_id", listingIds)
    .eq("listings.host_id", hostId)
    .in("status", ["CONFIRMED", "PAYMENT_PENDING"])
    .gte("start_at", rangeStart.toISOString())
    .lte("start_at", rangeEnd.toISOString())
    .order("start_at", { ascending: true });

  if (error) {
    console.error("[getHostCalendarBookings] Error:", error);
    return [];
  }

  return (data || []).map((b: any) => ({
    id: b.id,
    title: b.listings.title,
    start: b.start_at,
    end: b.end_at,
    status: b.status,
    listingId: b.listings.id,
    listingTitle: b.listings.title,
    guestName: b.profiles?.full_name || null,
  }));
}

/**
 * Get earnings summary for a month
 */
export async function getHostEarningsSummary(
  hostId: string,
  month?: Date
): Promise<EarningsSummary> {
  const supabase = await createClient();

  // Use current month if not provided
  const targetMonth = month || new Date();
  const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
  const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59);

  // Check if ledger_entries table exists
  const { data: ledgerCheck } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("host_id", hostId)
    .limit(1);

  if (!ledgerCheck) {
    // Ledger table doesn't exist or no entries - return empty summary
    return {
      monthGross: 0,
      monthNet: 0,
      pendingPayouts: 0,
      lastPayout: null,
    };
  }

  // Get month gross (all credit entries)
  const { data: grossData } = await supabase
    .from("ledger_entries")
    .select("amount_cents")
    .eq("host_id", hostId)
    .eq("type", "credit")
    .gte("created_at", monthStart.toISOString())
    .lte("created_at", monthEnd.toISOString());

  const monthGross = (grossData || []).reduce((sum, e) => sum + e.amount_cents, 0);

  // Get month net (credits - debits)
  const { data: allMonthData } = await supabase
    .from("ledger_entries")
    .select("type, amount_cents")
    .eq("host_id", hostId)
    .gte("created_at", monthStart.toISOString())
    .lte("created_at", monthEnd.toISOString());

  const monthNet = (allMonthData || []).reduce((sum, e) => {
    return sum + (e.type === "credit" ? e.amount_cents : -e.amount_cents);
  }, 0);

  // Get pending payouts (unpaid credits)
  const { data: pendingData } = await supabase
    .from("ledger_entries")
    .select("amount_cents")
    .eq("host_id", hostId)
    .eq("type", "credit")
    .or("paid.eq.false,paid.is.null");

  const pendingPayouts = (pendingData || []).reduce((sum, e) => sum + e.amount_cents, 0);

  // Get last payout
  const { data: lastPayoutData } = await supabase
    .from("ledger_entries")
    .select("amount_cents, created_at")
    .eq("host_id", hostId)
    .eq("type", "payout")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const lastPayout = lastPayoutData
    ? {
        amount: lastPayoutData.amount_cents,
        date: lastPayoutData.created_at,
      }
    : null;

  return {
    monthGross,
    monthNet,
    pendingPayouts,
    lastPayout,
  };
}

/**
 * Get recent ledger entries
 */
export async function getHostLedgerEntries(
  hostId: string,
  limit: number = 20
): Promise<LedgerEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ledger_entries")
    .select(`
      id,
      booking_id,
      type,
      amount_cents,
      currency,
      created_at,
      bookings(
        id,
        listings(id, title)
      )
    `)
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getHostLedgerEntries] Error:", error);
    return [];
  }

  return (data || []).map((e: any) => ({
    id: e.id,
    booking_id: e.booking_id,
    type: e.type,
    amount_cents: e.amount_cents,
    currency: e.currency,
    created_at: e.created_at,
    booking: e.bookings
      ? {
          id: e.bookings.id,
          listing: e.bookings.listings
            ? {
                title: e.bookings.listings.title,
              }
            : undefined,
        }
      : undefined,
  }));
}
