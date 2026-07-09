# Free Office Map Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a free, readable office-location map with switchable road and satellite layers while preserving the existing single-marker and attendance-radius behavior.

**Architecture:** Keep the existing Leaflet map instance and settings data contract. Create OpenStreetMap and Esri tile layers once during map initialization, add OpenStreetMap as the default, and expose both through Leaflet's native layer control. Existing map clicks, geolocation, marker updates, and saving continue to use latitude/longitude inputs.

**Tech Stack:** HTML, CSS, JavaScript, Leaflet 1.9.4, OpenStreetMap tiles, Esri World Imagery, Node.js assertion tests.

---

## File Structure

- `tests/settings-location-picker.test.js`: source-level regression tests for tile providers, default layer, layer control, one-marker behavior, and presentation.
- `js/settings.js`: initialize and retain the Leaflet base layers and native layer switcher.
- `css/settings.css`: use a neutral loading background that suits both road and satellite layers.
- `index.html`: update cache-busting versions for the changed settings assets.

### Task 1: Define the Free Layer-Switching Contract

**Files:**
- Modify: `tests/settings-location-picker.test.js`
- Test: `tests/settings-location-picker.test.js`

- [ ] **Step 1: Write the failing provider and layer-control test**

Add this function before the test invocations:

```js
function testSettingsMapOffersFreeRoadAndSatelliteLayers() {
    assertContains(
        settingsJs,
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'settings should provide a readable OpenStreetMap road layer'
    );
    assertContains(
        settingsJs,
        'World_Imagery/MapServer/tile/{z}/{y}/{x}',
        'settings should retain the free Esri satellite layer'
    );
    assertContains(settingsJs, "'Peta Jalan': roadLayer", 'layer control should use an Indonesian road label');
    assertContains(settingsJs, "'Satelit': satelliteLayer", 'layer control should use an Indonesian satellite label');
    assertContains(
        settingsJs,
        'roadLayer.addTo(this.attendanceLocationMap)',
        'road layer should be visible by default'
    );
    assertContains(
        settingsJs,
        'L.control.layers(baseLayers, null',
        'settings should use the native Leaflet layer switcher'
    );
    assert.strictEqual(
        (settingsJs.match(/L\\.marker\\(/g) || []).length,
        1,
        'switching base layers must not introduce another office marker'
    );
}
```

Invoke it with the other tests:

```js
testSettingsMapOffersFreeRoadAndSatelliteLayers();
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: FAIL with `settings should provide a readable OpenStreetMap road layer`.

- [ ] **Step 3: Commit the failing test**

```powershell
git add tests/settings-location-picker.test.js
git commit -m "test: define free office map layers"
```

### Task 2: Add Road and Satellite Base Layers

**Files:**
- Modify: `js/settings.js:431-458`
- Modify: `css/settings.css:265-279`
- Modify: `index.html:17`
- Modify: `index.html:1743`
- Test: `tests/settings-location-picker.test.js`

- [ ] **Step 1: Make the map label provider-neutral**

In `renderAttendanceLocationMap`, replace the canvas label:

```js
<div class="settings-map-canvas" aria-label="Peta titik kantor"></div>
```

- [ ] **Step 2: Create both free tile layers**

Replace the single Esri `L.tileLayer(...).addTo(...)` block with:

```js
const roadLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }
);
const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
    }
);
const baseLayers = {
    'Peta Jalan': roadLayer,
    'Satelit': satelliteLayer
};

roadLayer.addTo(this.attendanceLocationMap);
L.control.layers(baseLayers, null, {
    position: 'topright',
    collapsed: true
}).addTo(this.attendanceLocationMap);
```

Keep the existing single marker and click listener immediately after this block:

```js
this.attendanceLocationMarker = L.marker([latitude, longitude]).addTo(this.attendanceLocationMap);
this.attendanceLocationMap.on('click', (event) => this.selectAttendanceLocationFromMapClick(event));
```

- [ ] **Step 3: Use a neutral tile-loading background**

Change both dark backgrounds in `css/settings.css`:

```css
.settings-map-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    isolation: isolate;
    background: var(--color-gray-100);
}

.settings-map-canvas {
    width: 100%;
    height: 100%;
    min-height: 260px;
    background: var(--color-gray-100);
}
```

- [ ] **Step 4: Update cache-busting identifiers**

In `index.html`, change the settings asset URLs to:

```html
<link rel="stylesheet" href="css/settings.css?v=20260709-free-map-layers">
```

```html
<script src="js/settings.js?v=20260709-free-map-layers"></script>
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: `settings location picker tests passed`.

- [ ] **Step 6: Check JavaScript syntax**

Run:

```powershell
node --check js/settings.js
```

Expected: exit code 0 with no output.

- [ ] **Step 7: Commit the implementation**

```powershell
git add js/settings.js css/settings.css index.html
git commit -m "feat: add free office map layer switcher"
```

### Task 3: Verify Existing Location Behavior

**Files:**
- Test: `tests/settings-location-picker.test.js`
- Test: `tests/attendance-location-radius.test.js`
- Test: `tests/attendance-backend-frontend-sync.test.js`

- [ ] **Step 1: Run location regression tests**

Run:

```powershell
node tests/settings-location-picker.test.js
node tests/attendance-location-radius.test.js
node tests/attendance-backend-frontend-sync.test.js
```

Expected:

```text
settings location picker tests passed
attendance location radius tests passed
attendance backend/frontend sync tests passed
```

- [ ] **Step 2: Inspect the working tree**

Run:

```powershell
git status --short
```

Expected: only pre-existing unrelated files may remain untracked or modified; the files in this plan are clean.

- [ ] **Step 3: Perform browser verification**

Open the Admin Settings page at desktop and mobile widths and verify:

1. `Peta Jalan` is displayed when the map first loads.
2. The top-right layer control switches to `Satelit` and back.
3. Clicking either layer moves the same marker and updates both coordinate fields.
4. Pan, zoom, attribution, and the location note remain usable and unobstructed.
5. `Gunakan Lokasi Saat Ini` recenters the same marker.
6. Saving and reloading restores the selected point and radius.

- [ ] **Step 4: Record any verification-only correction**

If browser verification requires a scoped CSS or map initialization correction, update the relevant regression test first, run it to observe failure, apply the smallest correction, rerun all commands from Step 1, then commit:

```powershell
git add tests/settings-location-picker.test.js js/settings.js css/settings.css index.html
git commit -m "fix: refine office map layer controls"
```
