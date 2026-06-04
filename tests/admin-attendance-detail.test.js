const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAdminReports(overrides = {}) {
    const store = overrides.store || {};
    const context = {
        console,
        window: {},
        document: {
            getElementById: () => null,
            createElement: () => ({ style: {}, appendChild() {} }),
            body: { appendChild() {}, removeChild() {} }
        },
        auth: { isAdmin: () => true, getCurrentUser: () => ({ id: 'admin', role: 'admin' }) },
        router: { navigate() {} },
        toast: { error() {}, success() {}, warning() {} },
        modal: { show() {}, close() {} },
        storage: {
            get: (key, fallback = null) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback,
            set: (key, value) => {
                store[key] = value;
                return true;
            }
        },
        api: {},
        normalizeEmployeeList: rows => rows || [],
        getEmployeeDivision: emp => emp?.division || '-',
        dateTime: {
            formatClockTime: value => String(value || ''),
            formatTime: date => {
                const parsed = new Date(date);
                return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(11, 16);
            },
            formatDate: value => String(value),
            getLocalDate: () => '2026-05-24'
        }
    };
    context.window = context;
    vm.createContext(context);

    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-reports.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'admin-reports.js' });
    return context.window.adminReports;
}

function testRemoteAttendanceUsesCachedPerActionEvidenceWhenServerRowIsMissingIt() {
    const adminReports = loadAdminReports();
    const remoteRows = [{
        userId: 'KRY001',
        date: '2026-05-24',
        clockIn: '19:21',
        breakStart: '21:12',
        breakEnd: '21:48',
        clockOut: '22:02',
        verificationPhoto: 'data:image/jpeg;base64,clockout-legacy',
        verificationLocation: JSON.stringify({ latitude: -6.6818, longitude: 107.5555, accuracy: 41 }),
        verificationTimestamp: '2026-05-24T15:02:00.000Z',
        attendanceLogs: JSON.stringify([
            { action: 'clock-in', label: 'Clock In', time: '19:21' },
            { action: 'break', label: 'Istirahat 1', time: '21:12' },
            { action: 'after-break', label: 'Selesai Istirahat 1', time: '21:48' },
            { action: 'clock-out', label: 'Clock Out', time: '22:02' }
        ])
    }];
    const cachedRows = [{
        userId: 'KRY001',
        date: '2026-05-24',
        clockInPhoto: 'data:image/jpeg;base64,clockin',
        clockInLocation: JSON.stringify({ latitude: -6.6811, longitude: 107.5551, accuracy: 21 }),
        clockInTimestamp: '2026-05-24T12:21:00.000Z',
        breakStartPhoto: 'data:image/jpeg;base64,breakstart',
        breakStartLocation: JSON.stringify({ latitude: -6.6812, longitude: 107.5552, accuracy: 22 }),
        breakStartTimestamp: '2026-05-24T14:12:00.000Z',
        breakEndPhoto: 'data:image/jpeg;base64,breakend',
        breakEndLocation: JSON.stringify({ latitude: -6.6813, longitude: 107.5553, accuracy: 23 }),
        breakEndTimestamp: '2026-05-24T14:48:00.000Z'
    }];

    const merged = adminReports.mergeAttendanceEvidenceRows(remoteRows, cachedRows);
    const logs = adminReports.getAttendanceVerificationLogs(merged[0]);

    assert.strictEqual(logs.find(log => log.action === 'clock-in').photo, 'data:image/jpeg;base64,clockin');
    assert.strictEqual(logs.find(log => log.action === 'break').photo, 'data:image/jpeg;base64,breakstart');
    assert.strictEqual(logs.find(log => log.action === 'after-break').photo, 'data:image/jpeg;base64,breakend');
    assert.strictEqual(logs.find(log => log.action === 'clock-out').photo, 'data:image/jpeg;base64,clockout-legacy');
}

function testBreak2DedicatedEvidenceAppearsInDetailLogs() {
    const adminReports = loadAdminReports();
    const logs = adminReports.getAttendanceVerificationLogs({
        userId: 'KRY001',
        date: '2026-05-24',
        break2Start: '15:00',
        break2End: '15:15',
        break2StartPhoto: 'data:image/jpeg;base64,break2-start',
        break2StartLocation: JSON.stringify({ latitude: -7.12, longitude: 108.22, accuracy: 12 }),
        break2StartTimestamp: '2026-05-24T08:00:00.000Z',
        break2EndPhoto: 'data:image/jpeg;base64,break2-end',
        break2EndLocation: { latitude: -7.13, longitude: 108.23, accuracy: 15 },
        break2EndTimestamp: '2026-05-24T08:15:00.000Z'
    });

    const break2Start = logs.find(log => log.action === 'break-2');
    const break2End = logs.find(log => log.action === 'after-break-2');

    assert(break2Start, 'detail logs should include Istirahat 2');
    assert(break2End, 'detail logs should include Selesai Istirahat 2');
    assert.strictEqual(break2Start.photo, 'data:image/jpeg;base64,break2-start');
    assert.strictEqual(break2End.photo, 'data:image/jpeg;base64,break2-end');
    assert.strictEqual(JSON.parse(break2Start.location).latitude, -7.12);
    assert.strictEqual(break2End.location.latitude, -7.13);
}

function testDedicatedEvidenceFillsMissingParsedLogFields() {
    const adminReports = loadAdminReports();
    const logs = adminReports.getAttendanceVerificationLogs({
        attendanceLogs: JSON.stringify([
            { action: 'break-2', label: 'Istirahat 2', time: '15:00' }
        ]),
        break2StartPhoto: 'data:image/jpeg;base64,break2-start',
        break2StartLocation: { latitude: -7.12, longitude: 108.22 },
        break2StartTimestamp: '2026-05-24T08:00:00.000Z'
    });

    const break2Start = logs.find(log => log.action === 'break-2');
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(break2Start.photo, 'data:image/jpeg;base64,break2-start');
    assert.deepStrictEqual(break2Start.location, { latitude: -7.12, longitude: 108.22 });
    assert.strictEqual(break2Start.timestamp, '2026-05-24T08:00:00.000Z');
}

function testLegacyLatestVerificationFillsClockOutWhenParsedLogsHaveNoEvidence() {
    const adminReports = loadAdminReports();
    const logs = adminReports.getAttendanceVerificationLogs({
        attendanceLogs: JSON.stringify([
            { action: 'clock-in', label: 'Clock In', time: '08:00' },
            { action: 'break', label: 'Istirahat 1', time: '12:00' },
            { action: 'after-break', label: 'Selesai Istirahat 1', time: '12:30' },
            { action: 'break-2', label: 'Istirahat 2', time: '16:03' },
            { action: 'after-break-2', label: 'Selesai Istirahat 2', time: '16:31' },
            { action: 'clock-out', label: 'Clock Out', time: '18:02' }
        ]),
        clockIn: '08:00',
        breakStart: '12:00',
        breakEnd: '12:30',
        break2Start: '16:03',
        break2End: '16:31',
        clockOut: '18:02',
        verificationPhoto: 'data:image/jpeg;base64,last-proof',
        verificationLocation: JSON.stringify({ latitude: -6.681, longitude: 107.555, accuracy: 41 }),
        verificationTimestamp: '2026-05-24T11:02:00.000Z'
    });

    const clockOut = logs.find(log => log.action === 'clock-out');
    assert(clockOut, 'detail logs should include Clock Out');
    assert.strictEqual(clockOut.photo, 'data:image/jpeg;base64,last-proof');
    assert.strictEqual(JSON.parse(clockOut.location).accuracy, 41);
    assert.strictEqual(clockOut.timestamp, '2026-05-24T11:02:00.000Z');
}

function testAttendanceReportKeepsTotalLabelWithClearTooltip() {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-reports.js'), 'utf8');

    assert(indexHtml.includes('>Total</th>'), 'attendance report table should keep the Total heading');
    assert(indexHtml.includes('Telat sudah termasuk Hadir'), 'Total heading should explain late is already included in present');
    assert(source.includes('<span class="mobile-card-label">Total</span>'), 'mobile attendance cards should keep Total label');
    assert(source.includes("header: 'Total'"), 'attendance export should keep Total label');
}

function testAttendanceReportsRenderCachedDataBeforeFreshRefresh() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-reports.js'), 'utf8');

    assert(source.includes('loadCachedAttendanceReports()'), 'attendance reports should have a cached-data warm render path');
    assert(source.includes('this.loadCachedAttendanceReports();'), 'attendance reports init should render cached data before awaiting the server');
    assert(source.includes('refreshAttendanceReports()'), 'attendance reports should refresh fresh data separately');
    assert(source.includes('startAttendanceAutoRefresh()'), 'attendance reports should auto-refresh while the page is active');
    assert(source.includes("router?.currentPage === 'attendance-reports'"), 'auto-refresh should only run on the attendance report page');
}

function testAttendanceDetailRecordDateUsesDayMonthYear() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-reports.js'), 'utf8');

    assert(source.includes('formatAttendanceDetailDate(record.date ||'), 'attendance detail records should format dates as dd/mm/yyyy');
    assert(!source.includes("<strong>${this.escapeHtml(record.date || '-')}</strong>"), 'attendance detail should not render raw yyyy-mm-dd dates');
}

function testAttendanceStatusFilterIncludesAnyPresentEmployee() {
    const adminReports = loadAdminReports();
    adminReports.rawEmployees = [
        { id: 'A', name: 'A', division: 'Siaran' },
        { id: 'B', name: 'B', division: 'Siaran' },
        { id: 'C', name: 'C', division: 'Siaran' },
        { id: 'D', name: 'D', division: 'Siaran' }
    ];
    adminReports.rawAttendance = [
        { userId: 'A', date: '2026-06-04', clockIn: '08:00', status: 'ontime' },
        { userId: 'A', date: '2026-05-04', clockIn: '08:00', status: 'ontime' },
        { userId: 'B', date: '2026-06-04', clockIn: '08:30', status: 'terlambat' },
        { userId: 'C', date: '2026-06-04', clockIn: '08:00', status: 'ontime' }
    ];
    adminReports.rawLeaves = [];
    adminReports.rawIzin = [
        { userId: 'C', date: '2026-06-05', duration: 1, status: 'approved' },
        { userId: 'D', date: '2026-06-05', duration: 1, status: 'approved' }
    ];
    adminReports.filters.attendance.month = '2026-06';

    adminReports.filters.attendance.status = 'present';
    assert.deepStrictEqual(adminReports.getFilteredAttendance().map(row => row.name), ['A', 'B', 'C']);
    assert.deepStrictEqual(adminReports.getFilteredAttendance().map(row => row.present), [1, 1, 1]);

    adminReports.filters.attendance.status = 'late';
    assert.deepStrictEqual(adminReports.getFilteredAttendance().map(row => row.name), ['B']);

    adminReports.filters.attendance.status = 'absent';
    assert.deepStrictEqual(adminReports.getFilteredAttendance().map(row => row.name), ['C', 'D']);

    adminReports.filters.attendance.status = '';
    assert.deepStrictEqual(adminReports.getFilteredAttendance().map(row => row.name), ['A', 'B', 'C', 'D']);
}

testBreak2DedicatedEvidenceAppearsInDetailLogs();
testDedicatedEvidenceFillsMissingParsedLogFields();
testLegacyLatestVerificationFillsClockOutWhenParsedLogsHaveNoEvidence();
testRemoteAttendanceUsesCachedPerActionEvidenceWhenServerRowIsMissingIt();
testAttendanceReportKeepsTotalLabelWithClearTooltip();
testAttendanceReportsRenderCachedDataBeforeFreshRefresh();
testAttendanceDetailRecordDateUsesDayMonthYear();
testAttendanceStatusFilterIncludesAnyPresentEmployee();
console.log('admin attendance detail tests passed');
