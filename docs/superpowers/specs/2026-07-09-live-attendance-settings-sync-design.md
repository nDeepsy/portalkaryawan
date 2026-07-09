# Live Attendance Settings Synchronization Design

## Objective

Propagate admin changes to the office coordinate, attendance radius, and location-validation enabled state to active users quickly and safely without adding Firebase, Supabase, WebSockets, or another paid service.

The target propagation time between different devices is at most approximately 10 seconds while the application is visible. Refreshes also occur immediately when the application regains focus and whenever an attendance verification modal opens.

## Architecture

Add one frontend settings synchronizer shared by all authenticated roles. It periodically fetches fresh settings from the existing Apps Script endpoint, compares only the attendance-location values with the last applied snapshot, and emits the existing `settingsUpdated` event only when those values actually change.

The synchronized fields are:

- `attendance_location_enabled`
- `attendance_location_latitude`
- `attendance_location_longitude`
- `attendance_location_radius`

The synchronizer runs every 10 seconds only when:

- A user is authenticated.
- The document is visible.
- No previous settings request is still in flight.

It pauses when the document is hidden or the user logs out. It performs an immediate check when the window receives focus or the document becomes visible again.

## Fresh Fetch and Cache Rules

The existing 15-second API cache would otherwise delay a 10-second synchronizer. Add a focused fresh-settings path that invalidates only `getSettings` and `batch` cache entries before requesting settings. Other cached data remains untouched.

The synchronizer stores the latest successful settings in the existing `app_settings` local storage entry. It does not clear or overwrite unrelated application settings.

The admin save flow remains immediate in its current tab through `settingsUpdated`. The persisted `app_settings` update also triggers the browser's native `storage` event in other tabs on the same device. Those tabs apply the new location settings immediately instead of waiting for the next server poll.

## Change Detection

Normalize all four values to stable strings before comparison. Coordinate formatting differences that represent a different saved string count as a change and trigger an update; repeated responses with identical values do not rerender consumers or emit duplicate events.

Each successful change dispatches:

```js
new CustomEvent('settingsUpdated', {
    detail: {
        section: 'system',
        values: normalizedLocationSettings,
        source: 'remote-sync'
    }
})
```

Existing consumers continue to use the same event contract.

## Attendance Modal Behavior

The attendance verification modal already fetches settings without relying on stale cache when it opens. It will additionally react to a synchronization event while open:

1. Replace the modal's attendance-location settings snapshot.
2. Recalculate distance using the latest GPS position.
3. Rerender the status message, map note, and confirmation-button state.
4. Keep the captured photo intact.

If the new office point or radius makes the employee outside the permitted area, the confirmation button changes to `Di Luar Radius` immediately. If the new values make the employee valid, the button may become available once the existing photo and GPS-accuracy requirements are satisfied.

## Cross-Role Behavior

The synchronizer initializes for admin, owner, and employee sessions. Roles that do not currently display attendance-location UI still keep their local settings snapshot current. Employee attendance and other existing settings consumers receive the same `settingsUpdated` event.

No location restriction is added to login. The owner role does not gain permission to edit settings.

## Race and Error Handling

- Only one synchronization request may run at a time.
- A slow older response cannot overwrite a newer applied snapshot; each request is tagged with a monotonically increasing sequence number.
- Failed requests keep the last valid settings and retry on the next interval or focus event.
- Malformed coordinates are stored as returned but remain rejected by the existing normalization and validation logic.
- If the admin saves while a poll is in flight, the local save event is applied immediately. A stale poll response with an older sequence cannot overwrite the later state.
- Polling never submits attendance or changes backend data.

## Security Boundary

Frontend synchronization improves responsiveness but is not authoritative. Apps Script continues to load the latest settings and calculate distance again for every attendance submission. A client with stale or manipulated settings cannot bypass the backend radius check.

## Scope

Frontend:

- Add the shared settings synchronizer.
- Add a focused fresh-settings API method.
- Connect synchronization to authentication lifecycle, focus, visibility, storage events, and the open attendance modal.
- Add cache-busting identifiers and focused tests.

Backend:

- No changes.
- Existing `getSettings` and attendance validation remain the source of truth.

## Verification

- Tests verify the 10-second visible-page interval and pause/resume lifecycle.
- Tests verify focused cache invalidation and single-request locking.
- Tests verify unchanged settings do not emit duplicate events.
- Tests verify changed settings update local storage and emit `settingsUpdated`.
- Tests verify an open attendance modal recalculates its radius state without discarding a captured photo.
- Existing settings, radius, backend synchronization, and responsive attendance tests remain passing.
- JavaScript syntax checks pass.
