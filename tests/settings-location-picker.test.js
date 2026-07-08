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

function testSettingsJsHandlesCurrentLocationPicker() {
    assertContains(settingsJs, 'useCurrentAttendanceLocation', 'settings should implement current GPS capture');
    assertContains(settingsJs, 'navigator.geolocation.getCurrentPosition', 'settings should use browser geolocation for admin office point');
    assertContains(settingsJs, 'renderAttendanceLocationMap', 'settings should render office map preview');
    assertContains(settingsJs, 'https://maps.google.com/maps?q=', 'settings should use the same satellite embed pattern as employee attendance map');
    assertContains(settingsJs, '&z=18&t=k&output=embed', 'settings map should request Google satellite view like the employee attendance map');
}

function testSettingsMapPreviewHasStableStyles() {
    assertContains(settingsCss, '.attendance-location-map', 'settings map preview should have dedicated styling');
    assertContains(settingsCss, '.settings-card.attendance-location-settings', 'attendance location card should have layout styling');
    assertContains(settingsCss, '.attendance-location-fields', 'technical coordinate fields should be grouped separately');
    assertContains(settingsJs, 'map-static-fallback', 'settings map should reuse the attendance map visual fallback');
    assertContains(settingsJs, 'map-satellite-frame', 'settings map should reuse the attendance satellite iframe styling');
    assert(!settingsJs.includes('attendance-office-pin'), 'settings map should not add a custom pin because Google embed already shows one marker');
    assertContains(settingsJs, 'map-note', 'settings map should reuse the attendance map note styling');
}

testSettingsHasLocationPickerControls();
testSettingsJsHandlesCurrentLocationPicker();
testSettingsMapPreviewHasStableStyles();
console.log('settings location picker tests passed');
