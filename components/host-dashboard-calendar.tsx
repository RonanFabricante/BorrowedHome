"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, MessageCircle, Eye } from "lucide-react";
import { CalendarEvent } from "@/lib/host/dashboard";
import { StatusChip } from "@/components/status-chip";
import { resolveStatusStyle } from "@/lib/ui/tokens";

interface HostDashboardCalendarProps {
  hostId: string;
}

export function HostDashboardCalendar({ hostId }: HostDashboardCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const loadCalendarEvents = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const response = await fetch(
        `/api/host/calendar?from=${monthStart.toISOString()}&to=${monthEnd.toISOString()}`
      );
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (error) {
      console.error("Failed to load calendar events:", error);
    } finally {
      setLoading(false);
    }
  }, [hostId, currentMonth]);

  useEffect(() => {
    loadCalendarEvents();
  }, [loadCalendarEvents]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get first day of week for the month (0 = Sunday)
  const firstDayOfWeek = monthStart.getDay();
  const emptyDays = Array(firstDayOfWeek).fill(null);

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.start), day));
  };

  const getStatusColor = (status: string) => {
    const style = resolveStatusStyle(status);
    return `${style.bgClasses} ${style.textClasses} ${style.borderClasses}`;
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(new Date())}
        >
          Today
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-6">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading calendar...</div>
          ) : (
            <div className="space-y-2">
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-2">
                {emptyDays.map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[80px]"></div>
                ))}
                {daysInMonth.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[80px] border rounded-md p-2 ${
                        isToday ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday ? "text-primary" : ""}`}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            className={`text-xs p-1 rounded border cursor-pointer hover:opacity-80 ${getStatusColor(event.status)}`}
                            title={event.title}
                          >
                            <div className="truncate">{event.title}</div>
                            <div className="text-xs opacity-75">
                              {format(new Date(event.start), "h:mm a")}
                            </div>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{dayEvents.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Drawer */}
      {selectedEvent && (
        <Card className="mt-4">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{selectedEvent.listingTitle}</h3>
                <StatusChip status={selectedEvent.status} />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </Button>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground mb-4">
              <div>
                <strong>Guest:</strong> {selectedEvent.guestName || "Guest"}
              </div>
              <div>
                <strong>Date:</strong> {format(new Date(selectedEvent.start), "EEEE, MMMM d, yyyy")}
              </div>
              <div>
                <strong>Time:</strong> {format(new Date(selectedEvent.start), "h:mm a")} - {format(new Date(selectedEvent.end), "h:mm a")}
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/bookings/${selectedEvent.id}/messages`}>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/bookings/${selectedEvent.id}/confirm`}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
