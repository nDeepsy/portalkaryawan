# Outside-Area Confirmation Button Design

## Objective

Make the disabled attendance confirmation button clearly communicate when an employee is outside the permitted attendance area.

## Button States

The confirmation button keeps its existing state machine with one improved outside-area presentation:

- **Pending photo or GPS:** disabled with the normal primary presentation and existing confirmation label.
- **Outside attendance area:** disabled, solid red, with a prohibition icon and `Di Luar Area Absensi`.
- **Ready:** enabled with the normal primary presentation and `Konfirmasi Absensi`.
- **Submitting:** disabled with the existing loading presentation and `Menyimpan...`.

The outside-area state applies only when location validation is enabled, the office coordinate is configured, and the measured position is outside the radius. Missing configuration and pending GPS must not use the red button.

## Presentation

The button receives an `outside-radius` class while the outside-area state is active. The class uses:

- `var(--color-danger)` as the background and border color.
- `var(--color-white)` for text and icon.
- `cursor: not-allowed`.
- Full opacity so the blocked reason remains readable despite the native disabled state.

The disabled red button has no hover or active color transition that suggests it can be clicked.

When the employee returns inside the radius, `outside-radius` is removed immediately. The button returns to its normal primary style and becomes enabled only after the existing photo and GPS-accuracy requirements are satisfied.

## Copy

Use `Di Luar Area Absensi` instead of `Di Luar Radius`.

This wording is less technical, clearly describes the permitted attendance area, and remains concise enough for mobile buttons.

## Scope

Frontend only:

- Confirmation-button class and label.
- Focused attendance-modal styling.
- Cache-busting identifiers.
- Regression tests.

No changes are made to radius calculation, GPS acquisition, status-message colors, settings synchronization, backend validation, or login.

## Verification

- Tests confirm outside-area state applies the red class and new label.
- Tests confirm pending and ready states remove the red class.
- Tests confirm the danger color token and disabled cursor are used.
- Existing radius, live-sync, responsive, and backend validation tests remain passing.
- JavaScript syntax checks pass.
