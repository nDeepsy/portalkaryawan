const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const projectRoot = path.join(root, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const faceRecognitionJs = fs.readFileSync(path.join(root, 'js', 'face-recognition.js'), 'utf8');
const attendanceGs = fs.readFileSync(path.join(projectRoot, 'apps-script-absensi', 'Attendance.js'), 'utf8');
const settingsGs = fs.readFileSync(path.join(projectRoot, 'apps-script-absensi', 'Settings.js'), 'utf8');

function assertContains(source, value, message) {
    assert(source.includes(value), message || `expected source to include ${value}`);
}

function testAdminCanConfigureAttendanceLocation() {
    [
        'setting-attendance-location-enabled',
        'setting-attendance-location-latitude',
        'setting-attendance-location-longitude',
        'setting-attendance-location-radius'
    ].forEach(id => assertContains(indexHtml, id, `settings page should include ${id}`));

    [
        'attendance_location_enabled',
        'attendance_location_latitude',
        'attendance_location_longitude',
        'attendance_location_radius'
    ].forEach(key => {
        assertContains(settingsJs, key, `frontend settings should save ${key}`);
        assertContains(apiJs, key, `local API settings fallback should expose ${key}`);
        assertContains(settingsGs, key, `Apps Script settings should initialize ${key}`);
    });
}

function testFrontendLocksConfirmationOutsideRadius() {
    assertContains(faceRecognitionJs, 'loadAttendanceLocationSettings', 'face verification should load latest attendance location settings');
    assertContains(faceRecognitionJs, 'calculateDistanceMeters', 'face verification should calculate user distance from office');
    assertContains(faceRecognitionJs, 'withinAttendanceRadius', 'location payload should include radius validation status');
    assertContains(faceRecognitionJs, 'distanceFromOffice', 'location payload should include distance from office');
    assertContains(faceRecognitionJs, 'Lokasi absensi belum diatur admin', 'employee should see a clear unconfigured-location message');
    assertContains(faceRecognitionJs, 'Di luar radius absensi', 'employee should see a clear outside-radius message');
}

function testBackendRejectsManipulatedOutsideRadiusAttendance() {
    assertContains(attendanceGs, 'validateAttendanceLocationRadius', 'backend should validate radius before saving attendance');
    assertContains(attendanceGs, 'calculateDistanceMeters', 'backend should calculate distance independently');
    assertContains(attendanceGs, 'return { success: false, error: locationValidation.error }', 'backend should reject invalid location saves');
    assertContains(attendanceGs, 'Di luar radius absensi', 'backend should return a clear outside-radius error');
    assertContains(attendanceGs, 'Lokasi absensi belum diatur admin', 'backend should reject saves when location is not configured');
}

testAdminCanConfigureAttendanceLocation();
testFrontendLocksConfirmationOutsideRadius();
testBackendRejectsManipulatedOutsideRadiusAttendance();
console.log('attendance location radius tests passed');
