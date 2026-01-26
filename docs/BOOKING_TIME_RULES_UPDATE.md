# Booking Time Rules Update Summary

## Overview
Changed booking system from **fixed 2-hour duration** to **minimum 2-hour duration** with user-editable end time.

## Changes Made

### 1. New Module: `lib/bookingTimeRules.ts`
- **`toMinutes(time)`**: Converts time strings/Date to minutes-from-midnight (0-1439)
- **`fromMinutes(minutes)`**: Converts minutes back to HH:MM format
- **`minEndMinutes(startMinutes)`**: Calculates minimum end time (start + 2 hours)
- **`validate({ date, startMinutes, endMinutes, now })`**: Validates booking times
- **`normalize({ startMinutes, endMinutes })`**: Auto-adjusts invalid times
- Constants: `MIN_DURATION_MINUTES` (120), `CUTOFF_MINUTES` (1260), `LATEST_START_MINUTES` (1140)

### 2. Updated: `components/booking-dialog.tsx`
- ✅ **End time is now editable** (removed `disabled` and `readOnly`)
- ✅ **End time added to form schema**
- ✅ **Auto-adjustment**: When start time changes, end time is adjusted if invalid
- ✅ **Time picker constraints**:
  - Start time: min="07:00", max="19:00"
  - End time: min=start+2h, max="21:00"
- ✅ **Split info/error banners**:
  - Info banner (blue): Always visible, explains rules
  - Error banner (red): Only shown when validation fails
  - Adjustment note (amber): Shown when auto-adjustment occurs
- ✅ **Price calculation**: Based on actual duration (not fixed 2 hours)

### 3. Updated: `components/search-form.tsx`
- ✅ **End time is now editable**
- ✅ **Uses new bookingTimeRules validation**
- ✅ **Time picker constraints applied**

### 4. Updated: `app/api/bookings/request/route.ts`
- ✅ **Uses `validateBookingTime` from bookingTimeRules**
- ✅ **Validates minimum 2-hour duration** (not fixed)
- ✅ **Price calculation based on actual duration**

### 5. Tests: `lib/__tests__/bookingTimeRules.test.ts`
- ✅ Tests for time parsing (07:00 → 420, 21:00 → 1260)
- ✅ Tests for validation:
  - 07:00 → 09:00 (2h) ✅ valid
  - 07:00 → 08:30 (1.5h) ❌ invalid
  - 19:00 → 21:00 (2h) ✅ valid
  - 19:30 start ❌ invalid (would exceed cutoff)
  - Lead time: 3h59m ❌ invalid, 4h00m ✅ valid

## Rules Implemented

1. **Day-use only**: Start and end on same calendar date
2. **End by 21:00**: End time must be <= 9:00 PM
3. **Minimum 2 hours**: Duration must be >= 2 hours (not fixed)
4. **Lead time**: Start must be at least 4 hours from now
5. **Latest start**: 19:00 (7:00 PM) to allow 2h minimum ending by 21:00
6. **Auto-adjustment**: End time automatically adjusted when start changes

## UI Behavior

### End Time Field
- **Editable**: User can select any end time
- **Constraints**: 
  - Min = start time + 2 hours
  - Max = 21:00 (9:00 PM)
- **Auto-adjustment**: If user changes start time and current end becomes invalid, it's automatically adjusted

### Validation Messages
- **Info banner** (blue): "Day-use only: Bookings must end by 21:00 (9:00 PM) and be at least 2 hours long."
- **Error messages**:
  - "Bookings must end by 9:00 PM."
  - "Bookings must be at least 2 hours."
  - "Bookings must be requested at least 4 hours in advance."
  - "Overnight bookings are not permitted."

### Adjustment Note
- Shown when end time is auto-adjusted
- Example: "End time adjusted to meet minimum 2 hours"
- Auto-dismisses after 5 seconds

## Files Modified

1. ✅ `lib/bookingTimeRules.ts` (NEW)
2. ✅ `components/booking-dialog.tsx` (UPDATED)
3. ✅ `components/search-form.tsx` (UPDATED)
4. ✅ `app/api/bookings/request/route.ts` (UPDATED)
5. ✅ `lib/__tests__/bookingTimeRules.test.ts` (NEW)

## Validation Logic

### Final Validation Condition
```typescript
const startMinutes = toMinutes(startTime); // e.g., "07:00" → 420
const endMinutes = toMinutes(endTime);     // e.g., "09:00" → 540
const cutoffMinutes = 21 * 60;             // 1260 (9:00 PM)

// Errors shown when:
- endMinutes > cutoffMinutes              // "Bookings must end by 9:00 PM"
- (endMinutes - startMinutes) < 120       // "Bookings must be at least 2 hours"
- startMinutes < 7 * 60                    // "Earliest start time is 7:00 AM"
- startMinutes > 19 * 60                   // "Latest start time is 7:00 PM"
- lead time < 240 minutes                  // "Bookings must be requested at least 4 hours in advance"
```

### Example: 07:00 AM → 09:00 AM
```typescript
startMinutes = 420
endMinutes = 540
cutoffMinutes = 1260
duration = 540 - 420 = 120 minutes (2 hours)

540 > 1260? → false → NO ERROR ✓
120 >= 120? → true → NO ERROR ✓
```

## Testing

Run tests:
```bash
npm test lib/__tests__/bookingTimeRules.test.ts
```

All test cases pass:
- ✅ 07:00 → 09:00 (2h) valid
- ✅ 07:00 → 10:00 (3h) valid
- ❌ 07:00 → 08:30 (1.5h) invalid
- ✅ 19:00 → 21:00 (2h) valid
- ❌ 19:30 start invalid
- ❌ Lead time 3h59m invalid, 4h00m valid
