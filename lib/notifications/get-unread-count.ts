// Get unread notification count for a user
import { createClient } from "@/lib/supabase/server";

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[getUnreadCount] Error:", error);
    return 0;
  }

  return count || 0;
}
