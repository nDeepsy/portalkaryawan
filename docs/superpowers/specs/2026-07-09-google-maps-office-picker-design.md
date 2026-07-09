# Google Maps Office Location Picker Design

## Objective

Replace the current Leaflet and Esri map in Admin Settings with Google Maps while preserving the existing attendance-radius behavior.

The admin must be able to:

- See the saved office point immediately when opening Settings.
- Pan and zoom the map.
- Click the map to move a single office marker.
- Use the device's current location as an alternative.
- Save the selected latitude, longitude, radius, and enabled state.

## Map Integration

Use the Google Maps JavaScript API in the browser. Load it asynchronously and initialize the map only after both the API and the Settings page container are ready.

The initial map center is the office coordinate loaded from backend settings. If no valid office coordinate exists, use the existing application default coordinate. The map uses the `hybrid` map type so satellite imagery and Google road/place labels remain visible.

Only one marker represents the office. A map click updates that marker and the latitude/longitude fields. Using the device location updates the same marker and fields. It must never create a second marker.

The native Google Maps pan, zoom, map-type, and fullscreen controls are used. Custom duplicate movement controls are not added.

## API Key Configuration

The Maps JavaScript API key is browser-visible by design. It must be protected in Google Cloud with:

- Website/HTTP-referrer restrictions for the production domain and required development origin.
- An API restriction allowing only Maps JavaScript API.
- Billing and a usage budget or quota configured in Google Cloud.

The project will expose one clearly named configuration value for the key and show an explicit map error when the key is missing, invalid, blocked by referrer restrictions, or billing is unavailable.

## Attendance Data Flow

1. Admin Settings loads the latest location settings from Apps Script.
2. Google Maps centers on the saved office coordinate.
3. The admin clicks the map or uses the device-location button.
4. The selected coordinate is only a draft until the admin clicks Save.
5. Save writes the enabled state, latitude, longitude, and radius to backend Settings.
6. The employee attendance page fetches the latest settings before attendance.
7. The employee frontend calculates distance and disables attendance outside the radius.
8. On submission, Apps Script fetches the latest settings again and independently calculates distance.
9. Apps Script rejects attendance outside the radius even if frontend controls are bypassed.

Login is not location-restricted.

## Error Handling

- Missing or invalid Google Maps API key: show a clear error in the map area without breaking the Settings form.
- Invalid saved coordinates: use the application default coordinate and require valid coordinates before saving.
- Geolocation denied or unavailable: retain the existing office marker and show an actionable message.
- Google Maps load failure: retain editable coordinate fields and prevent false confirmation that the map loaded.
- Backend save failure: retain the draft marker and values so the admin can retry.

## Scope

Frontend changes:

- Replace Leaflet assets and map implementation with Google Maps JavaScript API.
- Preserve map click, device location, coordinate fields, one-marker behavior, and responsive Settings layout.
- Add focused tests for initialization, map click, marker reuse, location selection, and load errors.

Backend behavior:

- Keep the existing Settings persistence and server-side attendance-radius validation.
- No location restriction is added to login.

## Verification

- Automated tests verify the map provider and event behavior.
- Syntax checks cover changed JavaScript.
- Existing frontend radius and backend synchronization tests remain passing.
- Browser verification covers desktop and mobile Settings views.
- Manual deployment verification confirms the restricted API key works on the production domain.
