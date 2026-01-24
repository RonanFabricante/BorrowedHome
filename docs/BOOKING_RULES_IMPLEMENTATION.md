# Booking Rules Implementation Summary

## Overview
Implemented strict booking rules for BorrowedHome day-use bookings with fixed 2-hour duration, enforced validation, and consistent UI/UX.

## Rules Implemented

1. **Day-use only**: Start and end must be on the same calendar date (no overnight)
2. **End time cutoff**: End time must be <= 21:00 (9:00 PM)
3. **Fixed duration**: Booking duration is exactly 2 hours (endTime = startTime + 2 hours)
4. **Lead time**: Bookings must be requested at least 4 hours before start time
5. **Start time limits**: 
   - Earliest: 7:00 AM
   - Latest: 19:00 (7:00 PM) to ensure end <= 21:00
6. **UI behavior**: End time is auto-calculated and read-only

## Files Changed

### Core Library
- **`lib/bookingRules.ts`** (NEW)
  - `computeEndTime(startTime, durationMinutes=120)`: Calculates end time from start
  - `isDayUse(startDateTime, endDateTime)`: Checks same calendar date
  - `isEndBeforeCutoff(endDateTime, cutoffHour=21)`: Validates end time <= 9 PM
  - `isLeadTimeSatisfied(now, startDateTime, leadMinutes=240)`: Validates 4-hour lead time
  - `validateBookingRequest({ startDateTime, endDateTime, now })`: Comprehensive validation
  - `wouldExceedCutoff(startTime)`: Checks if start time would exceed cutoff
  - Constants: `BOOKING_DURATION_MINUTES`, `LEAD_TIME_MINUTES`, `END_TIME_CUTOFF_HOUR`, `LATEST_START_HOUR`

### UI Components
- **`components/booking-dialog.tsx`** (UPDATED)
  - Removed `endTime` from form schema (now computed)
  - Auto-calculates end time from start time (start + 2h)
  - End time input is disabled/read-only
  - Start time max set to 19:00
  - Real-time validation using `validateBookingRequest`
  - Shows inline validation errors
  - Updated pricing calculation for fixed 2-hour duration
  - Updated UI copy: "bookings must end by 9:00 PM"

- **`components/search-form.tsx`** (UPDATED)
  - Removed `endTime` from form schema (now computed)
  - Auto-calculates end time from start time
  - End time input is disabled/read-only
  - Removed preset time buttons (no longer needed with fixed duration)
  - Start time max set to 19:00
  - Uses `validateBookingRequest` for validation
  - Updated helper text: "Bookings must end by 9:00 PM · Fixed 2-hour duration"

### Server-Side
- **`app/api/bookings/request/route.ts`** (UPDATED)
  - Uses `validateBookingRequest` from shared library
  - Enforces exactly 2-hour duration (not min/max range)
  - Pricing calculation updated for fixed 2-hour duration
  - Returns structured error messages

### Tests
- **`lib/__tests__/bookingRules.test.ts`** (NEW)
  - Tests for `computeEndTime`: 07:00 -> 09:00, 19:00 -> 21:00
  - Tests for `isDayUse`: same date valid, crossing midnight invalid
  - Tests for `isEndBeforeCutoff`: validates 9 PM cutoff
  - Tests for `isLeadTimeSatisfied`: 4-hour requirement
  - Tests for `validateBookingRequest`:
    - ✅ 07:00 -> 09:00 valid
    - ✅ 19:00 -> 21:00 valid
    - ❌ 19:30 -> 21:30 invalid (exceeds cutoff)
    - ❌ Start within 3h 59m invalid; 4h 0m valid
    - ❌ Crossing midnight invalid
    - ❌ Wrong duration invalid
    - ❌ Start before 7 AM invalid
    - ❌ Start after 19:00 invalid

## Key Logic Changes

### Before
- Variable duration (2-11 hours)
- User could edit both start and end times
- Validation scattered across client and server
- Inconsistent error messages
- Pricing based on duration tiers

### After
- Fixed 2-hour duration
- End time auto-calculated and locked
- Shared validation library used by both client and server
- Consistent error messages
- Pricing: hourly_rate * 2 (fixed)

## UI/UX Improvements

1. **End Time Field**
   - Disabled/read-only with gray background
   - Shows helper text: "Automatically set (2 hours)"
   - Auto-updates when start time changes

2. **Start Time Field**
   - Max value set to 19:00 (7:00 PM)
   - Shows helper text: "Latest: 19:00 (ends at 9:00 PM)"
   - Browser validation prevents invalid selections

3. **Validation Messages**
   - Real-time inline errors
   - Clear, actionable messages
   - Prevents form submission when invalid

4. **Copy Updates**
   - "Bookings must end **by** 9:00 PM" (not "at")
   - "Fixed 2-hour duration" mentioned in search form
   - Consistent messaging across components

## Database Constraints

The existing database constraints in `supabase/migrations/023_revert_day_use_hours_to_9pm.sql` already enforce:
- `bookings.end_at` <= 21:00 (9 PM)
- `listing_availability.end_time` <= 21:00 (9 PM)

These align with the new validation rules.

## Testing

Run tests with:
```bash
npm test lib/__tests__/bookingRules.test.ts
```

All test cases pass:
- ✅ Valid bookings (07:00-09:00, 19:00-21:00)
- ✅ Invalid bookings (wrong duration, insufficient lead time, crossing midnight)
- ✅ Edge cases (exactly 4 hours, exactly 19:00, exactly 21:00)

## Migration Notes

1. **Existing Bookings**: Existing bookings with different durations are not affected (historical data preserved)

2. **New Bookings**: All new bookings must follow the 2-hour fixed duration rule

3. **Pricing**: Pricing calculation changed from tiered (hourly/half-day/full-day) to fixed 2-hour rate

4. **UI Migration**: Users will see the end time field as read-only, which may require brief explanation

## Future Considerations

1. **Duration Flexibility**: If business needs change, duration can be made configurable via `BOOKING_DURATION_MINUTES` constant

2. **Lead Time Flexibility**: Lead time can be adjusted via `LEAD_TIME_MINUTES` constant

3. **Cutoff Time**: End time cutoff can be adjusted via `END_TIME_CUTOFF_HOUR` constant

4. **Availability Windows**: Listing availability windows (which may end at 6 PM) are separate from booking end time limits (9 PM)
