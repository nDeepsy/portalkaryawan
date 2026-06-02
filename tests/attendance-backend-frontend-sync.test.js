const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const projectRoot = path.join(root, '..');
const absensiJs = fs.readFileSync(path.join(root, 'js', 'absensi.js'), 'utf8');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const attendanceGs = fs.readFileSync(path.join(projectRoot, 'apps-script-absensi', 'Attendance.js'), 'utf8');

const evidenceTriplets = [
    ['clockInPhoto', 'clockInLocation', 'clockInTimestamp'],
    ['breakStartPhoto', 'breakStartLocation', 'breakStartTimestamp'],
    ['breakEndPhoto', 'breakEndLocation', 'breakEndTimestamp'],
    ['break2StartPhoto', 'break2StartLocation', 'break2StartTimestamp'],
    ['break2EndPhoto', 'break2EndLocation', 'break2EndTimestamp'],
    ['overtimeStartPhoto', 'overtimeStartLocation', 'overtimeStartTimestamp'],
    ['clockOutPhoto', 'clockOutLocation', 'clockOutTimestamp']
];

function assertContains(source, value, message) {
    assert(source.includes(value), message || `expected source to include ${value}`);
}

function testFrontendAdminAndBackendUseSameAttendanceEvidenceFields() {
    evidenceTriplets.flat().forEach(field => {
        assertContains(absensiJs, field, `absensi should send ${field}`);
        assertContains(adminReportsJs, field, `admin detail should read ${field}`);
        assertContains(attendanceGs, `'${field}'`, `Apps Script attendance headers should include ${field}`);
    });
}

function testBackendPreservesAllAttendanceEvidenceFieldsDuringMerge() {
    evidenceTriplets.flat().forEach(field => {
        assertContains(attendanceGs, `'${field}'`, `Apps Script should preserve ${field} when merging attendance rows`);
    });
    assertContains(attendanceGs, 'mergeAttendanceForSave(existing, data)', 'backend should merge new saves with existing rows');
    assertContains(attendanceGs, 'ensureAttendanceColumns();', 'backend should ensure Attendance columns before reads/writes');
}

function testBackendEmptyTodayAttendanceTemplateIncludesEvidenceFields() {
    const templateSection = attendanceGs.slice(
        attendanceGs.indexOf('function getTodayAttendance'),
        attendanceGs.indexOf('function saveAttendanceData')
    );

    evidenceTriplets.flat().forEach(field => {
        assertContains(templateSection, `${field}: ''`, `empty getTodayAttendance response should include ${field}`);
    });
}

testFrontendAdminAndBackendUseSameAttendanceEvidenceFields();
testBackendPreservesAllAttendanceEvidenceFieldsDuringMerge();
testBackendEmptyTodayAttendanceTemplateIncludesEvidenceFields();
console.log('attendance backend/frontend sync tests passed');
