/**
 * Unit tests for booking time rules (minimum 2-hour duration)
 */

import {
  toMinutes,
  fromMinutes,
  minEndMinutes,
  CUTOFF_MINUTES,
  LATEST_START_MINUTES,
  validate,
  normalize,
  wouldExceedCutoff,
  MIN_DURATION_MINUTES,
} from "../bookingTimeRules";

describe("Booking Time Rules", () => {
  describe("toMinutes", () => {
    it("should parse 24-hour format correctly", () => {
      expect(toMinutes("07:00")).toBe(7 * 60); // 420
      expect(toMinutes("09:00")).toBe(9 * 60); // 540
      expect(toMinutes("21:00")).toBe(21 * 60); // 1260
    });

    it("should parse 12-hour AM format correctly", () => {
      expect(toMinutes("07:00 AM")).toBe(7 * 60);
      expect(toMinutes("09:00 AM")).toBe(9 * 60);
    });

    it("should parse 12-hour PM format correctly", () => {
      expect(toMinutes("09:00 PM")).toBe(21 * 60);
      expect(toMinutes("07:00 PM")).toBe(19 * 60);
    });
  });

  describe("fromMinutes", () => {
    it("should convert minutes to HH:MM format", () => {
      expect(fromMinutes(420)).toBe("07:00");
      expect(fromMinutes(540)).toBe("09:00");
      expect(fromMinutes(1260)).toBe("21:00");
    });
  });

  describe("minEndMinutes", () => {
    it("should calculate minimum end as start + 2 hours", () => {
      expect(minEndMinutes(420)).toBe(420 + 120); // 07:00 -> 09:00
      expect(minEndMinutes(540)).toBe(540 + 120); // 09:00 -> 11:00
      expect(minEndMinutes(1140)).toBe(1140 + 120); // 19:00 -> 21:00
    });
  });

  describe("validate", () => {
    const baseDate = "2026-01-25";
    const futureDate = new Date("2026-01-25T12:00:00");
    futureDate.setHours(12, 0, 0, 0);
    const now = new Date("2026-01-25T02:00:00"); // 2 AM

    it("should validate 07:00 -> 09:00 booking (exactly 2 hours)", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("07:00"),
        endMinutes: toMinutes("09:00"),
        now,
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate 07:00 -> 10:00 booking (3 hours, > minimum)", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("07:00"),
        endMinutes: toMinutes("10:00"),
        now,
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject 07:00 -> 08:30 booking (< 2 hours)", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("07:00"),
        endMinutes: toMinutes("08:30"),
        now,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("at least 2 hours"))).toBe(true);
    });

    it("should validate 19:00 -> 21:00 booking (exactly 2 hours, at cutoff)", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("19:00"),
        endMinutes: toMinutes("21:00"),
        now,
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject 19:30 start (would require end > 21:00)", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("19:30"),
        endMinutes: toMinutes("21:30"), // Would exceed cutoff
        now,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("end by 9:00 PM") || e.includes("Latest start"))).toBe(true);
    });

    it("should reject booking with insufficient lead time (3h 59m)", () => {
      const now = new Date("2026-01-25T10:00:00");
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("13:59"), // 3h 59m from now
        endMinutes: toMinutes("15:59"),
        now,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("at least 4 hours"))).toBe(true);
    });

    it("should accept booking with exactly 4 hours lead time", () => {
      const now = new Date("2026-01-25T10:00:00");
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("14:00"), // Exactly 4h from now
        endMinutes: toMinutes("16:00"),
        now,
      });

      expect(result.ok).toBe(true);
    });

    it("should reject end time after 21:00", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("20:00"),
        endMinutes: toMinutes("22:00"),
        now,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("end by 9:00 PM"))).toBe(true);
    });

    it("should reject start time before 7 AM", () => {
      const result = validate({
        date: baseDate,
        startMinutes: toMinutes("06:00"),
        endMinutes: toMinutes("08:00"),
        now,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("7:00 AM"))).toBe(true);
    });
  });

  describe("normalize", () => {
    it("should adjust end time if less than start + 2 hours", () => {
      const result = normalize({
        startMinutes: toMinutes("07:00"),
        endMinutes: toMinutes("08:30"), // Only 1.5 hours
      });

      expect(result.endMinutes).toBe(toMinutes("09:00")); // Adjusted to start + 2h
      expect(result.adjustments.some((a) => a.includes("minimum 2 hours"))).toBe(true);
    });

    it("should clamp end time to 21:00 if exceeds cutoff", () => {
      const result = normalize({
        startMinutes: toMinutes("20:00"),
        endMinutes: toMinutes("22:00"), // Exceeds cutoff
      });

      expect(result.endMinutes).toBe(CUTOFF_MINUTES); // Clamped to 21:00
      expect(result.adjustments.some((a) => a.includes("21:00"))).toBe(true);
    });

    it("should clamp start time if exceeds latest allowed", () => {
      const result = normalize({
        startMinutes: toMinutes("20:00"), // Exceeds 19:00
        endMinutes: toMinutes("22:00"),
      });

      expect(result.startMinutes).toBe(LATEST_START_MINUTES); // Clamped to 19:00
      expect(result.endMinutes).toBe(CUTOFF_MINUTES); // End also clamped
    });

    it("should not adjust valid times", () => {
      const result = normalize({
        startMinutes: toMinutes("07:00"),
        endMinutes: toMinutes("09:00"),
      });

      expect(result.startMinutes).toBe(toMinutes("07:00"));
      expect(result.endMinutes).toBe(toMinutes("09:00"));
      expect(result.adjustments).toHaveLength(0);
    });
  });

  describe("wouldExceedCutoff", () => {
    it("should return false for valid start times", () => {
      expect(wouldExceedCutoff(toMinutes("07:00"))).toBe(false);
      expect(wouldExceedCutoff(toMinutes("19:00"))).toBe(false);
    });

    it("should return true for start times that would exceed cutoff", () => {
      expect(wouldExceedCutoff(toMinutes("19:30"))).toBe(true);
      expect(wouldExceedCutoff(toMinutes("20:00"))).toBe(true);
    });
  });

  describe("Constants", () => {
    it("should have correct constant values", () => {
      expect(MIN_DURATION_MINUTES).toBe(120); // 2 hours
      expect(CUTOFF_MINUTES).toBe(21 * 60); // 1260 (9:00 PM)
      expect(LATEST_START_MINUTES).toBe(19 * 60); // 1140 (7:00 PM)
    });
  });
});
