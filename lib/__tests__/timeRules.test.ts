/**
 * Unit tests for time parsing and validation rules
 */

import {
  parseTimeToMinutes,
  validateDayUseBooking,
  endTimeExceedsCutoff,
  END_TIME_CUTOFF_MINUTES,
} from "../timeRules";

describe("Time Rules", () => {
  describe("parseTimeToMinutes", () => {
    it("should parse 24-hour format correctly", () => {
      expect(parseTimeToMinutes("07:00")).toBe(7 * 60); // 420
      expect(parseTimeToMinutes("09:00")).toBe(9 * 60); // 540
      expect(parseTimeToMinutes("21:00")).toBe(21 * 60); // 1260
      expect(parseTimeToMinutes("19:30")).toBe(19 * 60 + 30); // 1170
    });

    it("should parse 12-hour AM format correctly", () => {
      expect(parseTimeToMinutes("07:00 AM")).toBe(7 * 60); // 420
      expect(parseTimeToMinutes("09:00 AM")).toBe(9 * 60); // 540
      expect(parseTimeToMinutes("12:00 AM")).toBe(0); // midnight
      expect(parseTimeToMinutes("11:59 AM")).toBe(11 * 60 + 59); // 719
    });

    it("should parse 12-hour PM format correctly", () => {
      expect(parseTimeToMinutes("12:00 PM")).toBe(12 * 60); // 720 (noon)
      expect(parseTimeToMinutes("01:00 PM")).toBe(13 * 60); // 780
      expect(parseTimeToMinutes("09:00 PM")).toBe(21 * 60); // 1260
      expect(parseTimeToMinutes("11:59 PM")).toBe(23 * 60 + 59); // 1439
    });

    it("should parse Date objects correctly", () => {
      const date1 = new Date("2026-01-25T07:00:00");
      expect(parseTimeToMinutes(date1)).toBe(7 * 60); // 420

      const date2 = new Date("2026-01-25T09:00:00");
      expect(parseTimeToMinutes(date2)).toBe(9 * 60); // 540

      const date3 = new Date("2026-01-25T21:00:00");
      expect(parseTimeToMinutes(date3)).toBe(21 * 60); // 1260
    });

    it("should handle case-insensitive AM/PM", () => {
      expect(parseTimeToMinutes("09:00 am")).toBe(9 * 60);
      expect(parseTimeToMinutes("09:00 pm")).toBe(21 * 60);
      expect(parseTimeToMinutes("09:00 Am")).toBe(9 * 60);
      expect(parseTimeToMinutes("09:00 Pm")).toBe(21 * 60);
    });
  });

  describe("validateDayUseBooking", () => {
    it("should validate 07:00 AM -> 09:00 AM booking", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "07:00",
        endTime: "09:00",
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate 07:00 AM -> 09:00 AM with AM format", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "07:00 AM",
        endTime: "09:00 AM",
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate 19:00 -> 21:00 booking", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "19:00",
        endTime: "21:00",
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject 20:00 -> 22:00 booking (end > 21:00)", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "20:00",
        endTime: "22:00",
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("end by 21:00"))).toBe(true);
    });

    it("should reject 09:30 PM end time", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "19:30",
        endTime: "21:30",
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("end by 21:00"))).toBe(true);
    });

    it("should reject end time before start time", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "09:00",
        endTime: "07:00",
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("after start"))).toBe(true);
    });

    it("should reject same start and end time", () => {
      const result = validateDayUseBooking({
        date: "2026-01-25",
        startTime: "09:00",
        endTime: "09:00",
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("after start"))).toBe(true);
    });
  });

  describe("endTimeExceedsCutoff", () => {
    it("should return false for 09:00 AM (540 minutes)", () => {
      expect(endTimeExceedsCutoff("09:00 AM")).toBe(false);
      expect(endTimeExceedsCutoff("09:00")).toBe(false);
    });

    it("should return false for 21:00 (1260 minutes, exactly at cutoff)", () => {
      expect(endTimeExceedsCutoff("21:00")).toBe(false);
      expect(endTimeExceedsCutoff("09:00 PM")).toBe(false);
    });

    it("should return true for 21:30 (1290 minutes)", () => {
      expect(endTimeExceedsCutoff("21:30")).toBe(true);
      expect(endTimeExceedsCutoff("09:30 PM")).toBe(true);
    });

    it("should return true for 22:00 (1320 minutes)", () => {
      expect(endTimeExceedsCutoff("22:00")).toBe(true);
      expect(endTimeExceedsCutoff("10:00 PM")).toBe(true);
    });

    it("should return false for times before 21:00", () => {
      expect(endTimeExceedsCutoff("07:00")).toBe(false);
      expect(endTimeExceedsCutoff("12:00")).toBe(false);
      expect(endTimeExceedsCutoff("20:59")).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle midnight correctly", () => {
      expect(parseTimeToMinutes("00:00")).toBe(0);
      expect(parseTimeToMinutes("12:00 AM")).toBe(0);
    });

    it("should handle noon correctly", () => {
      expect(parseTimeToMinutes("12:00")).toBe(12 * 60); // 720
      expect(parseTimeToMinutes("12:00 PM")).toBe(12 * 60); // 720
    });

    it("should handle end of day correctly", () => {
      expect(parseTimeToMinutes("23:59")).toBe(23 * 60 + 59); // 1439
      expect(parseTimeToMinutes("11:59 PM")).toBe(23 * 60 + 59); // 1439
    });

    it("should validate cutoff constant", () => {
      expect(END_TIME_CUTOFF_MINUTES).toBe(21 * 60); // 1260
    });
  });
});
