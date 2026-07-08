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
    assertContains(indexHtml, 'btn-use-current-attendance-location', 'settings page should include a button to capture current admin GPS');
    assertContains(indexHtml, 'attendance-location-map', 'settings page should include a map preview for the office point');
    assertContains(indexHtml, 'attendance-location-helper', 'settings page should explain how latitude and longitude are filled');
    assertContains(indexHtml, 'Latitude adalah posisi', 'settings page should explain latitude and longitude in Indonesian');
}

function testSettingsJsHandlesCurrentLocationPicker() {
    assertContains(settingsJs, 'useCurrentAttendanceLocation', 'settings should implement current GPS capture');
    assertContains(settingsJs, 'navigator.geolocation.getCurrentPosition', 'settings should use browser geolocation for admin office point');
    assertContains(settingsJs, 'renderAttendanceLocationMap', 'settings should render office map preview');
    assertContains(settingsJs, 'https://maps.google.com/maps?q=', 'settings should render Google Maps preview');
}

function testSettingsMapPreviewHasStableStyles() {
    assertContains(settingsCss, '.attendance-location-map', 'settings map preview should have dedicated styling');
    assertContains(settingsCss, '.settings-map-frame', 'settings map iframe should have stable dimensions');
    assertContains(settingsCss, '.settings-map-note', 'settings map should show a readable note over the preview');
}

testSettingsHasLocationPickerControls();
testSettingsJsHandlesCurrentLocationPicker();
testSettingsMapPreviewHasStableStyles();
console.log('settings location picker tests passed');
