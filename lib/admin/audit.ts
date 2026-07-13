import { createAdminClient } from "@/lib/supabase/admin";

export type AdminActionInput = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
};

export async function logAdminAction(input: AdminActionInput): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_actions").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    reason: input.reason ?? null,
    payload: input.payload ?? {},
  });

  if (error) {
    console.error("[AdminAudit] Failed to write admin_actions:", error);
  }
}
