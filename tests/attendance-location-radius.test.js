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
    assertContains(faceRecognitionJs, 'di luar radius absensi', 'employee should see a clear outside-radius message');
    assertContains(
        faceRecognitionJs,
        'Anda berada di luar radius absensi',
        'employee should receive an explicit outside-radius explanation'
    );
    assertContains(
        faceRecognitionJs,
        '<i class="fas fa-ban"></i><span>Di Luar Radius</span>',
        'confirmation button should explain that attendance is blocked outside radius'
    );
    assertContains(
        faceRecognitionJs,
        '<i class="fas fa-check-circle"></i><span>Konfirmasi Absensi</span>',
        'confirmation button should restore its normal label when attendance becomes valid'
    );
    assertContains(
        faceRecognitionJs,
        'radiusStatus.configured && radiusStatus.enabled && radiusStatus.allowed === false',
        'outside-radius button state should not replace unconfigured or disabled-radius behavior'
    );
}

function testBackendRejectsManipulatedOutsideRadiusAttendance() {
    assertContains(attendanceGs, 'validateAttendanceLocationRadius', 'backend should validate radius before saving attendance');
    assertContains(attendanceGs, 'calculateDistanceMeters', 'backend should calculate distance independently');
    assertContains(attendanceGs, 'return { success: false, error: locationValidation.error }', 'backend should reject invalid location saves');
    assertContains(attendanceGs, 'Di luar radius absensi', 'backend should return a clear outside-radius error');
    assertContains(attendanceGs, 'Lokasi absensi belum diatur admin', 'backend should reject saves when location is not configured');
    assertContains(attendanceGs, 'latitude < -90 || latitude > 90', 'backend should reject attendance latitude outside its valid range');
    assertContains(attendanceGs, 'longitude < -180 || longitude > 180', 'backend should reject attendance longitude outside its valid range');
}

function testBlankCoordinatesAreNotTreatedAsZeroCoordinates() {
    assertContains(attendanceGs, "latitudeValue === '' ? NaN", 'backend should reject a blank office latitude instead of treating it as zero');
    assertContains(attendanceGs, "longitudeValue === '' ? NaN", 'backend should reject a blank office longitude instead of treating it as zero');
    assertContains(faceRecognitionJs, "latitudeValue === '' ? NaN", 'employee validation should reject a blank office latitude');
    assertContains(faceRecognitionJs, "longitudeValue === '' ? NaN", 'employee validation should reject a blank office longitude');
}

testAdminCanConfigureAttendanceLocation();
testFrontendLocksConfirmationOutsideRadius();
testBackendRejectsManipulatedOutsideRadiusAttendance();
testBlankCoordinatesAreNotTreatedAsZeroCoordinates();
console.log('attendance location radius tests passed');
