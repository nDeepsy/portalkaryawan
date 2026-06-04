const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const absensiSource = fs.readFileSync(path.join(root, 'js', 'absensi.js'), 'utf8');
const adminDashboardSource = fs.readFileSync(path.join(root, 'js', 'admin-dashboard.js'), 'utf8');
const adminReportsSource = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const jurnalSource = fs.readFileSync(path.join(root, 'js', 'jurnal.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loginCssSource = fs.readFileSync(path.join(root, 'css', 'login.css'), 'utf8');
const backendRoot = path.join(root, '..', 'apps-script-absensi');
const backendDatabaseSource = fs.readFileSync(path.join(backendRoot, 'Database.js'), 'utf8');
const backendLeaveSource = fs.readFileSync(path.join(backendRoot, 'Leave.js'), 'utf8');
const backendPermissionSource = fs.readFileSync(path.join(backendRoot, 'Permission.js'), 'utf8');

function loadDateTime() {
    const sandbox = {
        console,
        window: {},
        document: {
            addEventListener() {},
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => []
        },
        localStorage: {
            getItem: () => null,
            setItem() {},
            removeItem() {},
            clear() {}
        },
        sessionStorage: {
            getItem: () => null,
            setItem() {},
            removeItem() {},
            clear() {}
        },
        setInterval() {},
        setTimeout() {}
    };
    sandbox.window = sandbox;
    vm.runInNewContext(mainSource, sandbox, { filename: 'main.js' });
    return sandbox.window.dateTime;
}

function testDateTimeUsesDayMonthYear() {
    const dateTime = loadDateTime();
    assert.strictEqual(dateTime.formatNumericDate('2026-06-04'), '04/06/2026');
    assert.strictEqual(dateTime.formatDate(new Date(2026, 5, 4)), '04/06/2026');
    assert.strictEqual(dateTime.formatDate(new Date(2026, 5, 4), 'long'), '04/06/2026');
}

function testClockLabelsAreIndonesian() {
    assert(indexSource.includes('id="btn-clock-in"'), 'clock-in button should exist');
    assert(indexSource.includes('<span class="btn-label">Masuk</span>'), 'clock-in button should be labeled Masuk');
    assert(indexSource.includes('<span class="btn-label">Pulang</span>'), 'clock-out button should be labeled Pulang');
    assert(!indexSource.includes('>Clock In<') && !indexSource.includes('>Clock Out<'), 'visible clock labels should not use English');
    assert(absensiSource.includes("'clock-in': 'Masuk'"), 'verification labels should use Masuk');
    assert(absensiSource.includes("'clock-out': 'Pulang'"), 'verification labels should use Pulang');
    assert(adminDashboardSource.includes("'Masuk'") && adminDashboardSource.includes("'Pulang'"), 'admin activity labels should use Indonesian terms');
}

function testDateDisplaysUseSharedNumericFormatter() {
    assert(absensiSource.includes('dateTime.formatNumericDate'), 'attendance history should use shared numeric date formatter');
    assert(adminReportsSource.includes('formatReportDisplayDate'), 'reports should keep using the report date formatter');
    assert(adminReportsSource.includes('dateTime.formatNumericDate'), 'report date formatter should use shared numeric date formatter');
    assert(adminReportsSource.includes('formatJurnalReportDate(row.date ||'), 'journal report table should format dates as dd/mm/yyyy');
    assert(adminReportsSource.includes('formatExportDateTime(new Date())'), 'report exports should format generated dates as dd/mm/yyyy');
    assert(mainSource.includes('dateTime.formatNumericDate(date)'), 'notification timestamps should use dd/mm/yyyy dates');
    assert(!/return date\.toLocaleString\('id-ID'/.test(mainSource), 'notification timestamps should not use locale medium dates');
    assert(jurnalSource.includes('dateTime.formatNumericDate(date)'), 'journal history cards should show dd/mm/yyyy');
}

function testBackendNotificationDatesUseDayMonthYear() {
    assert(backendDatabaseSource.includes('function formatDisplayDateDDMMYYYY'), 'backend should provide a dd/mm/yyyy display date helper');
    assert(backendLeaveSource.includes('formatDisplayDateDDMMYYYY(data.startDate)'), 'leave submission notifications should format start dates');
    assert(backendLeaveSource.includes('formatDisplayDateDDMMYYYY(normalized.endDate)'), 'leave confirmation notifications should format end dates');
    assert(backendPermissionSource.includes('formatDisplayDateDDMMYYYY(data.date)'), 'permission submission notifications should format dates');
    assert(backendPermissionSource.includes('formatDisplayDateDDMMYYYY(updated.date)'), 'permission confirmation notifications should format dates');
}

function testDesktopRoleSelectorUsesThreeBalancedColumns() {
    assert(/\.role-options\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s.test(loginCssSource), 'desktop login role selector should use three balanced columns');
    assert(/\.role-card\s*\{[^}]*min-height:\s*72px;/s.test(loginCssSource), 'desktop role cards should have a stable polished height');
}

testDateTimeUsesDayMonthYear();
testClockLabelsAreIndonesian();
testDateDisplaysUseSharedNumericFormatter();
testBackendNotificationDatesUseDayMonthYear();
testDesktopRoleSelectorUsesThreeBalancedColumns();
console.log('Indonesian labels and date format tests passed');
