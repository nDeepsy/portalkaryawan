# Attendance Location Status Colors Design

## Objective

Make the attendance modal's location eligibility immediately understandable through consistent semantic colors.

## Visual States

The location status uses three distinct states:

- **Ready — green:** The employee's location is verified, is inside the configured radius, and satisfies the existing GPS-accuracy rule.
- **Outside radius — red:** The employee is outside the configured office radius and cannot confirm attendance.
- **Pending — neutral:** GPS is still loading or improving accuracy. This state must not appear as either successful or rejected.

Only the status badge and location-description text receive semantic colors. The entire card remains unchanged so the modal does not become visually heavy.

## State Mapping

When ready:

- The status badge keeps the verified check icon and success color.
- The location-description text uses the success color.
- Existing confirmation-button enablement remains unchanged.

When outside the radius:

- The status badge uses a dedicated rejected class and warning icon.
- The badge text remains `Lokasi ditolak`.
- The location-description text shows the existing distance and radius explanation in the error color.
- The confirmation button remains disabled with `Di Luar Radius`.

While GPS is loading or improving accuracy:

- The status badge and description use their existing neutral presentation.
- No green or red description class remains from a previous GPS update.

Permission-denied, unavailable-GPS, and unconfigured-office messages retain their existing behavior. This change focuses the new red description treatment on a known outside-radius result.

## Implementation

`face-recognition.js` assigns mutually exclusive semantic classes to both the status badge and `location-address` each time location is rendered:

- `verified` and `location-ready` for ready.
- `rejected` and `location-rejected` for outside radius.
- Neither semantic class for pending.

Class updates must remove stale classes before applying the current state so moving into or out of the radius changes colors immediately.

`face-rec.css` uses existing design tokens:

- `var(--color-success)` for ready text.
- `var(--color-danger)` for rejected text.

No hard-coded green or red values are introduced.

## Scope

Frontend only:

- Location status rendering.
- Attendance modal styles.
- Cache-busting identifiers.
- Focused regression tests.

No change is made to GPS acquisition, radius calculation, settings synchronization, button logic, backend validation, or login.

## Verification

- Tests confirm ready status uses green classes and the success token.
- Tests confirm outside-radius status uses red classes and the danger token.
- Tests confirm pending updates remove both semantic description classes.
- Existing location-radius, live-sync, responsive, and backend validation tests remain passing.
- JavaScript syntax checks pass.
