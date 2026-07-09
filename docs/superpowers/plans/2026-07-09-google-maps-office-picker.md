# Google Maps Office Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Admin Settings Leaflet/Esri office picker with a clickable Google Maps hybrid map while preserving one-marker selection, GPS selection, saved settings, and server-side attendance-radius enforcement.

**Architecture:** A small Google Maps loader owns API-key discovery and asynchronous script loading. The existing Settings module owns map lifecycle, draft coordinates, marker reuse, and save behavior. Existing employee and Apps Script radius validation remain unchanged and are covered by regression tests.

**Tech Stack:** Vanilla JavaScript, Google Maps JavaScript API, existing HTML/CSS, Node.js assertion tests, Google Apps Script.

---

## File Structure

- Create `js/google-maps-loader.js`: read the restricted browser API key and load Google Maps once.
- Modify `index.html`: remove Leaflet assets, declare Google Maps key configuration, and load the new loader before Settings.
- Modify `js/settings.js`: replace Leaflet map lifecycle and events with Google Maps equivalents.
- Modify `css/settings.css`: update canvas loading/error styling and Google control layering.
- Modify `tests/settings-location-picker.test.js`: specify Google Maps loading, hybrid rendering, click selection, marker reuse, and Leaflet removal.
- Preserve `js/face-recognition.js` and `../apps-script-absensi/Attendance.js`: radius behavior must remain covered by regression tests.

### Task 1: Specify Google Maps Loading

**Files:**
- Create: `js/google-maps-loader.js`
- Modify: `index.html`
- Test: `tests/settings-location-picker.test.js`

- [ ] **Step 1: Write failing asset and loader tests**

Update the test expectations to require:

```js
assertContains(indexHtml, 'name="google-maps-api-key"');
assertContains(indexHtml, 'js/google-maps-loader.js');
assert(!indexHtml.includes('leaflet.min.css'));
assert(!indexHtml.includes('leaflet.min.js'));
assertContains(googleMapsLoaderJs, 'window.googleMapsLoader');
assertContains(googleMapsLoaderJs, 'https://maps.googleapis.com/maps/api/js');
assertContains(googleMapsLoaderJs, 'loading=async');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: FAIL because the Google Maps loader and configuration do not exist.

- [ ] **Step 3: Implement a single-load Google Maps loader**

Create a loader exposing:

```js
window.googleMapsLoader = {
    load() {
        if (window.google?.maps) return Promise.resolve(window.google.maps);
        if (this.promise) return this.promise;

        const key = document.querySelector('meta[name="google-maps-api-key"]')?.content?.trim();
        if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
            return Promise.reject(new Error('Google Maps API key belum diatur'));
        }

        this.promise = new Promise((resolve, reject) => {
            const callbackName = '__initOfficeGoogleMapApi';
            window[callbackName] = () => {
                delete window[callbackName];
                resolve(window.google.maps);
            };

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${callbackName}`;
            script.async = true;
            script.defer = true;
            script.onerror = () => reject(new Error('Google Maps gagal dimuat'));
            document.head.appendChild(script);
        });

        return this.promise;
    }
};
```

Add `<meta name="google-maps-api-key" content="YOUR_GOOGLE_MAPS_API_KEY">`, remove Leaflet CSS/JS, and load `google-maps-loader.js` before `settings.js`.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: loader assertions pass; map implementation assertions may still fail until Task 2.

- [ ] **Step 5: Commit**

```powershell
git add index.html js/google-maps-loader.js tests/settings-location-picker.test.js
git commit -m "feat: add Google Maps script loader"
```

### Task 2: Replace Leaflet Map Lifecycle

**Files:**
- Modify: `js/settings.js`
- Test: `tests/settings-location-picker.test.js`

- [ ] **Step 1: Write failing Google Maps behavior tests**

Require these behaviors:

```js
assertContains(settingsJs, 'await window.googleMapsLoader.load()');
assertContains(settingsJs, 'new google.maps.Map(');
assertContains(settingsJs, "mapTypeId: 'hybrid'");
assertContains(settingsJs, "this.attendanceLocationMap.addListener('click'");
assertContains(settingsJs, 'event.latLng.lat()');
assertContains(settingsJs, 'event.latLng.lng()');
assertContains(settingsJs, 'this.attendanceLocationMarker.setPosition(');
assert(!settingsJs.includes('L.map('));
assert(!settingsJs.includes('L.marker('));
assert(!settingsJs.includes('World_Imagery'));
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: FAIL because `settings.js` still initializes Leaflet.

- [ ] **Step 3: Implement Google Maps initialization**

Make `renderAttendanceLocationMap()` asynchronous. Render the canvas and loading note first, await `window.googleMapsLoader.load()`, and create:

```js
this.attendanceLocationMap = new google.maps.Map(mapCanvas, {
    center: { lat: latitude, lng: longitude },
    zoom: 18,
    mapTypeId: 'hybrid',
    fullscreenControl: true,
    mapTypeControl: true,
    streetViewControl: false,
    zoomControl: true
});

this.attendanceLocationMarker = new google.maps.Marker({
    position: { lat: latitude, lng: longitude },
    map: this.attendanceLocationMap,
    title: 'Titik kantor'
});

this.attendanceLocationMap.addListener('click', event => {
    this.selectAttendanceLocationFromMapClick(event);
});
```

On later renders, reuse the map and marker:

```js
const position = { lat: latitude, lng: longitude };
this.attendanceLocationMap.setCenter(position);
this.attendanceLocationMarker.setPosition(position);
```

Convert click coordinates with `event.latLng.lat()` and `event.latLng.lng()`. Do not create another marker.

- [ ] **Step 4: Implement visible load failure**

Catch loader/initialization errors and place this message inside the canvas:

```html
<div class="map-placeholder map-placeholder--error">
  <i class="fas fa-triangle-exclamation"></i>
  <p>Google Maps gagal dimuat. Periksa API key, billing, pembatasan domain, dan koneksi internet.</p>
</div>
```

Keep coordinate inputs and the GPS button usable after a map failure.

- [ ] **Step 5: Run the focused test**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: `settings location picker tests passed`.

- [ ] **Step 6: Commit**

```powershell
git add js/settings.js tests/settings-location-picker.test.js
git commit -m "feat: use Google Maps for office selection"
```

### Task 3: Polish Map States and Responsive Layout

**Files:**
- Modify: `css/settings.css`
- Test: `tests/settings-location-picker.test.js`

- [ ] **Step 1: Add failing style assertions**

Require stable canvas, loading, and failure styles:

```js
assertContains(settingsCss, '.settings-map-canvas');
assertContains(settingsCss, '.settings-map-loading');
assertContains(settingsCss, '.map-placeholder--error');
assert(!settingsCss.includes('.leaflet-'));
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: FAIL because Google loading/error styles are missing.

- [ ] **Step 3: Add focused styles**

Keep the current stable map height and add:

```css
.settings-map-loading,
.map-placeholder--error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    background: var(--color-surface);
}

.map-placeholder--error {
    color: var(--color-danger);
}
```

Remove any Leaflet-only selector. Keep one native Google control set and the existing map note above the map with pointer events disabled.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
node tests/settings-location-picker.test.js
```

Expected: `settings location picker tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add css/settings.css tests/settings-location-picker.test.js
git commit -m "style: polish Google office map states"
```

### Task 4: Regression and Deployment Verification

**Files:**
- Verify: `js/face-recognition.js`
- Verify: `../apps-script-absensi/Attendance.js`
- Verify: `tests/attendance-location-radius.test.js`
- Verify: `tests/attendance-backend-frontend-sync.test.js`

- [ ] **Step 1: Run all location and synchronization tests**

Run:

```powershell
node tests/settings-location-picker.test.js
node tests/attendance-location-radius.test.js
node tests/attendance-backend-frontend-sync.test.js
```

Expected: all three print their `tests passed` messages.

- [ ] **Step 2: Run JavaScript syntax checks**

Run:

```powershell
node --check js/google-maps-loader.js
node --check js/settings.js
node --check js/face-recognition.js
```

Expected: all commands exit with status 0 and no syntax errors.

- [ ] **Step 3: Verify the original attendance contract**

Confirm:

- Login remains unrestricted.
- Admin save still writes the four `attendance_location_*` settings.
- Employee attendance loads the latest settings and disables confirmation outside the radius.
- Apps Script independently rejects an outside-radius submission.

- [ ] **Step 4: Verify in browser**

With a restricted working API key configured, open Admin Settings on desktop and mobile. Confirm the hybrid map is visible immediately, native controls work, clicking moves one marker, GPS reuses the marker, and saving/reloading restores the point.

- [ ] **Step 5: Commit final verification updates if any**

```powershell
git add index.html css/settings.css js/google-maps-loader.js js/settings.js tests/settings-location-picker.test.js
git commit -m "test: verify Google office map integration"
```
