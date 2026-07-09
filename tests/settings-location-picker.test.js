const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const settingsCss = fs.readFileSync(path.join(root, 'css', 'settings.css'), 'utf8');

function assertContains(source, value, message) {
    assert(source.includes(value), message || `expected source to include ${value}`);
}

function testSettingsHasLocationPickerControls() {
    assertContains(indexHtml, 'attendance-location-settings', 'attendance location settings should be separated into its own card');
    assertContains(indexHtml, '<h3>Lokasi Absensi</h3>', 'attendance location card should have its own heading');
    assertContains(indexHtml, 'btn-use-current-attendance-location', 'settings page should include a button to capture current admin GPS');
    assertContains(indexHtml, 'attendance-location-map location-map', 'settings page should reuse the employee attendance map class');
    assertContains(indexHtml, 'attendance-location-helper', 'settings page should explain how latitude and longitude are filled');
    assertContains(indexHtml, 'Latitude adalah posisi', 'settings page should explain latitude and longitude in Indonesian');
}

function testSettingsAssetsUseCacheBustingVersion() {
    assertContains(indexHtml, 'css/settings.css?v=', 'settings stylesheet should use cache busting so visual fixes reach the browser');
    assertContains(indexHtml, 'js/settings.js?v=', 'settings script should use cache busting so map logic fixes reach the browser');
    assertContains(indexHtml, 'leaflet.min.css', 'settings page should load Leaflet styles');
    assertContains(indexHtml, 'leaflet.min.js', 'settings page should load Leaflet before settings logic');
}

function testSettingsJsHandlesCurrentLocationPicker() {
    assertContains(settingsJs, 'initAttendanceLocationPreview', 'settings should initialize a non-saved location preview on page load');
    assertContains(settingsJs, 'useApproximateAttendanceLocationPreview', 'settings should show an approximate map before admin captures the official point');
    assert(!settingsJs.includes('if (hasSavedPoint) return;'), 'settings should still try an approximate preview even when old saved coordinates exist');
    assertContains(settingsJs, 'isAttendanceLocationPlaceholder', 'settings should treat example coordinates as placeholders, not saved office points');
    assertContains(settingsJs, 'clearAttendanceLocationPlaceholderInputs', 'settings should clear old example coordinates from the form instead of showing them as saved');
    assertContains(settingsJs, 'getDefaultAttendanceLocationPreviewPoint', 'settings should have a default map point when browser location is not available yet');
    assertContains(settingsJs, 'Tampilan awal perkiraan lokasi', 'settings should immediately label the default preview as approximate');
    assertContains(settingsJs, 'useCurrentAttendanceLocation', 'settings should implement current GPS capture');
    assertContains(settingsJs, 'navigator.geolocation.getCurrentPosition', 'settings should use browser geolocation for admin office point');
    assertContains(settingsJs, 'renderAttendanceLocationMap', 'settings should render office map preview');
    assertContains(settingsJs, 'L.map(', 'settings should initialize an interactive Leaflet map');
    assertContains(settingsJs, 'World_Imagery/MapServer/tile/{z}/{y}/{x}', 'settings should load satellite imagery tiles');
    assertContains(settingsJs, 'L.marker(', 'settings should render one office marker');
    assertContains(settingsJs, "this.attendanceLocationMap.on('click'", 'settings should select the office point from a Leaflet map click');
    assertContains(settingsJs, 'Tampilan awal dari lokasi perangkat', 'settings should label approximate preview differently from saved office point');
}

function testSettingsDoesNotRenderExampleCoordinatesAsSavedOfficePoint() {
    assertContains(settingsJs, 'clearAttendanceLocationPlaceholderInputs();', 'settings should remove placeholder latitude and longitude before rendering the admin map');
    assertContains(settingsJs, "latitudeInput.value = ''", 'settings should blank the example latitude value');
    assertContains(settingsJs, "longitudeInput.value = ''", 'settings should blank the example longitude value');
    assertContains(settingsJs, "this.setLocalSettingsOverride({", 'settings should update the local cached settings after removing the placeholder');
    assertContains(settingsJs, "attendance_location_latitude: ''", 'settings should clear placeholder latitude from the local settings cache');
    assertContains(settingsJs, "attendance_location_longitude: ''", 'settings should clear placeholder longitude from the local settings cache');
}

function testSettingsMapSupportsManualPointSelection() {
    assertContains(indexHtml, 'Klik peta untuk memilih titik kantor', 'settings page should explain the admin can click the map manually');
    assertContains(settingsJs, 'selectAttendanceLocationFromMapClick', 'settings should handle manual point selection from the map');
    assertContains(settingsJs, 'event?.latlng', 'settings should use the exact coordinates supplied by Leaflet');
    assertContains(settingsJs, 'Titik kantor dipilih dari peta', 'settings should tell admin when a manual point is selected');
    assert(!settingsJs.includes('settings-map-click-layer'), 'settings map should not block pan and zoom with a transparent click layer');
    assert(!settingsJs.includes('calculateMapClickCoordinates'), 'settings should not approximate coordinates from screen pixels');
}

function testSettingsMapDoesNotDuplicateGoogleControls() {
    assert(!settingsJs.includes('settings-map-nudge-controls'), 'settings map should not render a second directional control over Google Maps');
    assert(!settingsJs.includes('settings-map-nudge-pad'), 'settings map should not render the duplicate directional pad');
    assert(!settingsJs.includes('nudgeAttendanceLocationPoint'), 'settings should not keep unused duplicate nudge behavior');
    assert(!settingsCss.includes('.settings-map-nudge-controls'), 'settings should not keep styling for duplicate directional controls');
    assert(!settingsCss.includes('.settings-map-nudge-pad'), 'settings should not keep styling for the duplicate directional pad');
    assert(!settingsCss.includes('.settings-map-nudge-button'), 'settings should not keep styling for duplicate directional buttons');
}

function testSettingsMapPreviewHasStableStyles() {
    assertContains(settingsCss, '.attendance-location-map', 'settings map preview should have dedicated styling');
    assertContains(settingsCss, '.settings-card.attendance-location-settings', 'attendance location card should have layout styling');
    assertContains(settingsCss, '.attendance-location-fields', 'technical coordinate fields should be grouped separately');
    assertContains(settingsCss, '.settings-map-canvas', 'settings should size the interactive map canvas');
    assertContains(settingsJs, 'invalidateSize()', 'settings should refresh Leaflet dimensions after the page becomes visible');
    assert(!settingsJs.includes('<iframe'), 'settings admin map should not use the unreliable Google iframe');
    assert(!settingsJs.includes('map-static-fallback'), 'settings admin map should not cover failed tiles with a fake map');
    assert(!settingsJs.includes('settings-office-pin'), 'settings map should use only the single Google marker from the query');
    assert(!settingsJs.includes('attendance-office-pin'), 'settings map should not use the old double-pin overlay');
    assertContains(settingsJs, 'map-note', 'settings map should reuse the attendance map note styling');
}

testSettingsHasLocationPickerControls();
testSettingsAssetsUseCacheBustingVersion();
testSettingsJsHandlesCurrentLocationPicker();
testSettingsDoesNotRenderExampleCoordinatesAsSavedOfficePoint();
testSettingsMapSupportsManualPointSelection();
testSettingsMapDoesNotDuplicateGoogleControls();
testSettingsMapPreviewHasStableStyles();
console.log('settings location picker tests passed');
