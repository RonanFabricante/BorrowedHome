"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string;
  read_at: string | null;
  created_at: string;
}

interface NotificationsPageContentProps {
  userId: string;
}

export function NotificationsPageContent({ userId }: NotificationsPageContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ["notifications", "page", filter],
    queryFn: async () => {
      const response = await fetch("/api/notifications?limit=100");
      if (!response.ok) return { notifications: [] };
      return response.json();
    },
  });

  const allNotifications = notificationsData?.notifications || [];
  const filteredNotifications = filter === "unread"
    ? allNotifications.filter((n: Notification) => !n.read_at)
    : allNotifications;

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to mark as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to mark all as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read_at) {
      markReadMutation.mutate([notification.id]);
    }
    router.push(notification.href);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "BOOKING_REQUESTED":
        return "📅";
      case "PAYMENT_REQUIRED":
      case "PAYMENT_DEADLINE_SOON":
        return "💳";
      case "BOOKING_CONFIRMED":
        return "✅";
      case "MESSAGE_RECEIVED":
        return "💬";
      default:
        return "🔔";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              variant={filter === "unread" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("unread")}
            >
              Unread
            </Button>
          </div>
          {filteredNotifications.some((n: Notification) => !n.read_at) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="flex items-center gap-2"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {filter === "unread" ? "No unread notifications" : "No notifications"}
            </h3>
            <p className="text-muted-foreground">
              {filter === "unread"
                ? "You're all caught up!"
                : "You don't have any notifications yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification: Notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                !notification.read_at ? "border-l-4 border-l-primary" : ""
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{notification.title}</h3>
                      {!notification.read_at && (
                        <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {notification.body}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

        </div>
      )}
    </div>
  );
}
