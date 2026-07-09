# Outside-Radius Attendance Modal Design

## Objective

Make the attendance modal clearly explain why attendance cannot be submitted when an employee is outside the office radius, while still allowing the employee to open the modal and take a photo.

## User Flow

1. The employee clicks an attendance action such as clock in, break, overtime, or clock out.
2. The existing photo and GPS modal opens.
3. GPS loads the latest office coordinate and radius configured by the admin.
4. The employee may capture a fresh photo regardless of radius status.
5. If the employee is outside the radius:
   - The location status uses the existing error presentation.
   - The message states `Anda berada di luar radius absensi`.
   - Supporting text shows the measured distance from the office and the allowed radius.
   - The confirmation button remains visible but disabled.
   - Its label changes to `Di Luar Radius`.
6. If a subsequent GPS update places the employee inside the radius:
   - The location status changes to the existing verified presentation.
   - The confirmation label returns to its normal action text.
   - The button becomes enabled once both the photo and valid location are ready.
7. The backend independently validates the submitted coordinate and rejects an outside-radius request.

## UI State Rules

The confirmation control has four explicit states:

- **Waiting for photo or GPS:** disabled with the existing preparation label.
- **Outside radius:** disabled with `Di Luar Radius`.
- **Ready:** enabled with the normal confirmation label.
- **Submitting:** disabled with the existing loading label.

Outside-radius state has priority over the generic waiting state once the latest GPS result and office configuration are available. This ensures the employee sees the real reason attendance is blocked.

The button remains visible in every state. Hiding it would make the modal's next expected action less clear.

## Data and Security

The frontend uses the existing `locationRadiusStatus` result and does not introduce another distance calculation. The current Haversine calculation, configured radius range, GPS payload, and settings refresh remain unchanged.

Frontend button state is guidance only. Apps Script remains authoritative and recalculates distance from the submitted coordinate using the latest saved office settings before persisting attendance.

## Error Handling

- If office coordinates are not configured, retain the existing `Lokasi absensi belum diatur admin` message and keep confirmation disabled.
- If location permission is denied or GPS is unavailable, retain the existing retry guidance and keep confirmation disabled.
- If GPS accuracy is still being refined inside the radius, retain the existing waiting status until the accuracy policy allows confirmation.
- If the backend rejects the request after the frontend considered it valid, show the backend error and do not record attendance.
- If radius validation is disabled by the admin, preserve the existing behavior and do not show the outside-radius state.

## Scope

Frontend changes are limited to the attendance verification modal's status message, confirmation-button label, and focused tests.

No changes are required to:

- Admin map or settings persistence.
- Radius calculation.
- GPS payload shape.
- Backend radius enforcement.
- Login.
- Attendance action sequencing.

## Verification

- A focused test verifies the outside-radius message and disabled confirmation label.
- A focused test verifies the label returns when the position becomes valid.
- Existing radius tests verify frontend distance checks and backend rejection.
- Existing attendance modal and responsive tests remain passing.
- JavaScript syntax checks pass.
