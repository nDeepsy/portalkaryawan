# Free Office Map Layers Design

## Objective

Improve the office-location picker in Admin Settings without requiring a paid map API or API key.

The admin can:

- View the saved office location immediately.
- Pan and zoom the map.
- Click the map to move one office marker.
- Switch between a clear road map and satellite imagery.
- Use the device's current location.
- Save the selected latitude, longitude, radius, and enabled state.

## Map Integration

Keep Leaflet as the interactive map library. Add two free tile layers:

- **Peta Jalan:** OpenStreetMap as the default layer because roads, buildings, and place names are easier to read.
- **Satelit:** Esri World Imagery for visual inspection of the surrounding area.

Use Leaflet's native layer control to switch between the two views. The control must not create another map or marker. Existing Leaflet pan and zoom controls remain available.

The initial center is the saved office coordinate. If it is invalid or unavailable, use the existing application default coordinate.

Only one marker represents the office. Clicking either map layer or using device geolocation updates the same marker and the latitude/longitude fields. A selected coordinate remains a draft until Save is clicked.

## Presentation

The road layer opens by default. The map container retains the existing responsive dimensions and receives a clean neutral background while tiles load. The layer names use Indonesian labels, `Peta Jalan` and `Satelit`, so the control is understandable without additional instructions.

Attribution required by each tile provider remains visible. No custom directional pad or duplicate zoom control is added.

## Data Flow and Validation

The existing settings contract remains unchanged:

1. Settings loads the saved enabled state, latitude, longitude, and radius.
2. The map centers its single marker on the saved coordinate.
3. A map click or device-location result updates the draft fields and marker.
4. Save persists the draft through the existing settings API.
5. Employee attendance loads the latest saved coordinate and radius.
6. Frontend and Apps Script continue their existing independent radius checks.

Login remains unrestricted by location.

## Error Handling

- If Leaflet is unavailable, show a clear map error while keeping coordinate fields editable.
- If a road or satellite tile request fails, the other layer remains selectable.
- If geolocation is denied or unavailable, retain the current marker and show the existing actionable message.
- If saved coordinates are invalid, use the application default coordinate and require valid values before saving.
- If saving fails, keep the draft marker and values so the admin can retry.

## Scope

Frontend changes are limited to the Settings map renderer, focused styles, cache-version identifiers, and map tests. Backend persistence and attendance-radius validation are unchanged.

No Google Maps JavaScript API, API key, billing account, geocoding, address search, or additional paid service is introduced.

## Verification

- Tests confirm both OpenStreetMap and Esri layers are configured.
- Tests confirm the road layer is the default and a native Leaflet layer control is present.
- Tests confirm map clicks and geolocation reuse a single marker.
- Existing settings persistence and attendance-radius tests remain passing.
- JavaScript syntax checks pass.
- Browser checks cover desktop and mobile layouts and switching both map layers.
