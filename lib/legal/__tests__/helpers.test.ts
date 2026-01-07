/**
 * Unit tests for legal acceptance helpers
 */

import { checkAcceptance, hasAcceptedGuestTerms, hasAcceptedHostDeclaration } from "../helpers";

// Mock Supabase client
const createMockSupabase = (hasAcceptance: boolean) => ({
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: hasAcceptance
                ? {
                    id: "test-id",
                    user_id: "user-123",
                    doc_type: "guest_terms",
                    doc_version: "2026-01-08-au-v1",
                    accepted_at: "2026-01-08T00:00:00Z",
                  }
                : null,
              error: hasAcceptance
                ? null
                : { code: "PGRST116", message: "No rows returned" },
            })),
          })),
        })),
      })),
    })),
  })),
});

describe("Legal Acceptance Helpers", () => {
  describe("checkAcceptance", () => {
    it("should return accepted=true when acceptance exists", async () => {
      const supabase = createMockSupabase(true);
      const result = await checkAcceptance(supabase, "user-123", "guest_terms");

      expect(result.accepted).toBe(true);
      expect(result.version).toBe("2026-01-08-au-v1");
      expect(result.acceptedAt).toBe("2026-01-08T00:00:00Z");
    });

    it("should return accepted=false when acceptance does not exist", async () => {
      const supabase = createMockSupabase(false);
      const result = await checkAcceptance(supabase, "user-123", "guest_terms");

      expect(result.accepted).toBe(false);
      expect(result.version).toBe("2026-01-08-au-v1");
      expect(result.acceptedAt).toBeUndefined();
    });
  });

  describe("hasAcceptedGuestTerms", () => {
    it("should return true when guest terms are accepted", async () => {
      const supabase = createMockSupabase(true);
      const result = await hasAcceptedGuestTerms(supabase, "user-123");

      expect(result).toBe(true);
    });

    it("should return false when guest terms are not accepted", async () => {
      const supabase = createMockSupabase(false);
      const result = await hasAcceptedGuestTerms(supabase, "user-123");

      expect(result).toBe(false);
    });
  });

  describe("hasAcceptedHostDeclaration", () => {
    it("should return true when host declaration is accepted", async () => {
      const supabase = createMockSupabase(true);
      const result = await hasAcceptedHostDeclaration(supabase, "user-123");

      expect(result).toBe(true);
    });

    it("should return false when host declaration is not accepted", async () => {
      const supabase = createMockSupabase(false);
      const result = await hasAcceptedHostDeclaration(supabase, "user-123");

      expect(result).toBe(false);
    });
  });
});
