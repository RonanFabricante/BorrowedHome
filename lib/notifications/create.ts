// Server-side notification creation helper
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateNotificationPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  href: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
}

/**
 * Create a notification for a user (idempotent via dedupe_key)
 * Uses SECURITY DEFINER RPC function to bypass RLS
 */
export async function createNotification(
  payload: CreateNotificationPayload
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("create_notification", {
    p_user_id: payload.userId,
    p_type: payload.type,
    p_title: payload.title,
    p_href: payload.href,
    p_dedupe_key: payload.dedupeKey,
    p_body: payload.body || null,
    p_entity_type: payload.entityType || null,
    p_entity_id: payload.entityId || null,
  });

  if (error) {
    console.error("[createNotification] Error:", error);
    return null;
  }

  return data || null;
}

/**
 * Create notifications for multiple users (batch)
 */
export async function createNotificationsForUsers(
  payloads: CreateNotificationPayload[]
): Promise<void> {
  // Create notifications in parallel
  await Promise.all(
    payloads.map((payload) => createNotification(payload))
  );
}
