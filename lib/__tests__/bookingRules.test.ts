/**
 * Unit tests for booking validation rules
 */

import {
  computeEndTime,
  isDayUse,
  isEndBeforeCutoff,
  isLeadTimeSatisfied,
  validateBookingRequest,
  wouldExceedCutoff,
  BOOKING_DURATION_MINUTES,
  LEAD_TIME_MINUTES,
  END_TIME_CUTOFF_HOUR,
  LATEST_START_HOUR,
} from "../bookingRules";

describe("Booking Rules", () => {
  describe("computeEndTime", () => {
    it("should compute end time as start + 2 hours", () => {
      expect(computeEndTime("07:00")).toBe("09:00");
      expect(computeEndTime("09:00")).toBe("11:00");
      expect(computeEndTime("19:00")).toBe("21:00");
      expect(computeEndTime("19:30")).toBe("21:30");
    });

    it("should handle edge cases", () => {
      expect(computeEndTime("00:00")).toBe("02:00");
      expect(computeEndTime("23:00")).toBe("25:00"); // Would exceed cutoff, but function just computes
    });
  });

  describe("isDayUse", () => {
    it("should return true when start and end are on same date", () => {
      const start = new Date("2026-01-25T07:00:00");
      const end = new Date("2026-01-25T09:00:00");
      expect(isDayUse(start, end)).toBe(true);
    });

    it("should return false when dates differ", () => {
      const start = new Date("2026-01-25T23:00:00");
      const end = new Date("2026-01-26T01:00:00");
      expect(isDayUse(start, end)).toBe(false);
    });

    it("should return false when crossing midnight", () => {
      const start = new Date("2026-01-25T22:00:00");
      const end = new Date("2026-01-26T00:00:00");
      expect(isDayUse(start, end)).toBe(false);
    });
  });

  describe("isEndBeforeCutoff", () => {
    it("should return true when end is before 9 PM", () => {
      const end = new Date("2026-01-25T18:00:00");
      expect(isEndBeforeCutoff(end)).toBe(true);
    });

    it("should return true when end is exactly 9 PM", () => {
      const end = new Date("2026-01-25T21:00:00");
      expect(isEndBeforeCutoff(end)).toBe(true);
    });

    it("should return false when end is after 9 PM", () => {
      const end = new Date("2026-01-25T21:30:00");
      expect(isEndBeforeCutoff(end)).toBe(false);
    });

    it("should return false when end is 9:01 PM", () => {
      const end = new Date("2026-01-25T21:01:00");
      expect(isEndBeforeCutoff(end)).toBe(false);
    });
  });

  describe("isLeadTimeSatisfied", () => {
    it("should return true when start is 4+ hours in future", () => {
      const now = new Date("2026-01-25T10:00:00");
      const start = new Date("2026-01-25T14:00:00");
      expect(isLeadTimeSatisfied(now, start)).toBe(true);
    });

    it("should return true when start is exactly 4 hours in future", () => {
      const now = new Date("2026-01-25T10:00:00");
      const start = new Date("2026-01-25T14:00:00");
      expect(isLeadTimeSatisfied(now, start)).toBe(true);
    });

    it("should return false when start is less than 4 hours in future", () => {
      const now = new Date("2026-01-25T10:00:00");
      const start = new Date("2026-01-25T13:59:00");
      expect(isLeadTimeSatisfied(now, start)).toBe(false);
    });

    it("should return false when start is in the past", () => {
      const now = new Date("2026-01-25T10:00:00");
      const start = new Date("2026-01-25T09:00:00");
      expect(isLeadTimeSatisfied(now, start)).toBe(false);
    });
  });

  describe("wouldExceedCutoff", () => {
    it("should return false for valid start times", () => {
      expect(wouldExceedCutoff("07:00")).toBe(false);
      expect(wouldExceedCutoff("09:00")).toBe(false);
      expect(wouldExceedCutoff("19:00")).toBe(false);
    });

    it("should return true for start times that would exceed cutoff", () => {
      expect(wouldExceedCutoff("19:30")).toBe(true);
      expect(wouldExceedCutoff("20:00")).toBe(true);
      expect(wouldExceedCutoff("21:00")).toBe(true);
    });
  });

  describe("validateBookingRequest", () => {
    const baseDate = new Date("2026-01-25T12:00:00"); // Noon on Jan 25

    it("should validate 07:00 -> 09:00 booking", () => {
      const start = new Date("2026-01-25T07:00:00");
      const end = new Date("2026-01-25T09:00:00");
      const now = new Date("2026-01-25T02:00:00"); // 5 hours before start

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate 19:00 -> 21:00 booking", () => {
      const start = new Date("2026-01-25T19:00:00");
      const end = new Date("2026-01-25T21:00:00");
      const now = new Date("2026-01-25T14:00:00"); // 5 hours before start

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject 19:30 -> 21:30 booking (exceeds cutoff)", () => {
      const start = new Date("2026-01-25T19:30:00");
      const end = new Date("2026-01-25T21:30:00");
      const now = new Date("2026-01-25T14:00:00");

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("end by"))).toBe(true);
    });

    it("should reject booking with insufficient lead time (3h 59m)", () => {
      const start = new Date("2026-01-25T15:59:00");
      const end = new Date("2026-01-25T17:59:00");
      const now = new Date("2026-01-25T12:00:00"); // 3h 59m before start

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("at least") && e.includes("hours"))).toBe(true);
    });

    it("should accept booking with exactly 4 hours lead time", () => {
      const start = new Date("2026-01-25T16:00:00");
      const end = new Date("2026-01-25T18:00:00");
      const now = new Date("2026-01-25T12:00:00"); // Exactly 4 hours before start

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(true);
    });

    it("should reject booking crossing midnight", () => {
      const start = new Date("2026-01-25T23:00:00");
      const end = new Date("2026-01-26T01:00:00");
      const now = new Date("2026-01-25T18:00:00");

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("same day"))).toBe(true);
    });

    it("should reject booking with wrong duration (not 2 hours)", () => {
      const start = new Date("2026-01-25T07:00:00");
      const end = new Date("2026-01-25T10:00:00"); // 3 hours
      const now = new Date("2026-01-25T02:00:00");

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("exactly") && e.includes("hours"))).toBe(true);
    });

    it("should reject booking starting before 7 AM", () => {
      const start = new Date("2026-01-25T06:00:00");
      const end = new Date("2026-01-25T08:00:00");
      const now = new Date("2026-01-25T01:00:00");

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("7:00 AM"))).toBe(true);
    });

    it("should reject booking starting after 19:00", () => {
      const start = new Date("2026-01-25T19:30:00");
      const end = new Date("2026-01-25T21:30:00");
      const now = new Date("2026-01-25T14:00:00");

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("19:00") || e.includes("7:00 PM"))).toBe(true);
    });

    it("should accept booking starting exactly at 19:00", () => {
      const start = new Date("2026-01-25T19:00:00");
      const end = new Date("2026-01-25T21:00:00");
      const now = new Date("2026-01-25T14:00:00");

      const result = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      expect(result.valid).toBe(true);
    });
  });
});
