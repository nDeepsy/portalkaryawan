const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'css', 'admin.css'), 'utf8');

const sandbox = {
    console,
    window: {},
    document: {
        getElementById: () => null
    },
    storage: {
        get: () => []
    },
    normalizeEmployeeList: employees => employees,
    getEmployeeDivision: employee => employee.division || '',
    auth: { getCurrentUser: () => null }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

assert(
    html.includes('id="attendance-employee-filter"') &&
        html.includes('id="jurnal-employee-filter"') &&
        html.includes('id="leave-employee-filter"'),
    'all three report pages should have an employee filter'
);

assert(
    source.includes('printAttendanceEmployee(') &&
        source.includes('printJurnalEmployee(') &&
        source.includes('printLeaveEmployee('),
    'all report pages should expose a per-row print helper'
);

assert(
    source.includes('data-print-action') &&
        source.includes('title="Cetak laporan karyawan"') &&
        source.includes('adminReports.printJurnalEmployee') &&
        source.includes('adminReports.printLeaveEmployee'),
    'all report row actions should include a visible per-employee print button'
);

assert(
    adminCss.includes('.btn-action.print') &&
        adminCss.includes('.employee-filter-active') &&
        adminCss.includes('.employee-filter-locked') &&
        adminCss.includes('.print-target-hidden'),
    'per-employee print UI should have dedicated screen and print styling'
);

assert(
    !/\.filter-group select\.employee-filter-active\s*\{[^}]*box-shadow:/s.test(adminCss),
    'active employee print field should not render the oversized blue focus shadow'
);

assert(
    !adminCss.includes('.btn-clear-print-target') &&
        !adminCss.includes('.print-scope-badge') &&
        !source.includes('print-scope-badge'),
    'per-employee print UI should not render the circular clear button or extra report scope badge'
);

assert(
    source.includes('data-report-user-id') &&
        source.includes('markPrintTargetRows') &&
        /@media print[\s\S]*\.print-target-hidden/s.test(adminCss),
    'per-employee row print should hide non-selected rows only in print output'
);

sandbox.adminReports.rawEmployees = [
    { id: 'KRY001', name: 'Dewi Lestari', division: 'Penyiar', status: 'active' },
    { id: 'KRY002', name: 'Raka Pratama', division: 'Produksi' }
];
sandbox.adminReports.rawAttendance = [
    { userId: 'KRY001', date: '2026-07-01', clockIn: '08:00', status: 'ontime' },
    { userId: 'KRY002', date: '2026-07-01', clockIn: '08:12', status: 'Terlambat' }
];
sandbox.adminReports.rawLeaves = [];
sandbox.adminReports.rawIzin = [];
sandbox.adminReports.filters.attendance = {
    month: '2026-07',
    division: '',
    status: '',
    employee: 'KRY001'
};

const attendanceRows = sandbox.adminReports.getFilteredAttendance();
assert.strictEqual(attendanceRows.length, 1, 'attendance should filter to one selected employee');
assert.strictEqual(attendanceRows[0].name, 'Dewi Lestari');

const selectedAttendanceEmployee = sandbox.adminReports.getSelectedReportEmployee('attendance');
assert.strictEqual(selectedAttendanceEmployee.name, 'Dewi Lestari', 'selected report employee should resolve by id');
assert.strictEqual(selectedAttendanceEmployee.division, 'Penyiar', 'selected report employee should expose the employee division');
assert.strictEqual(selectedAttendanceEmployee.statusLabel, 'Aktif', 'selected report employee should expose a readable employee status');

sandbox.document.getElementById = id => {
    const elements = {
        'attendance-month': { value: '2026-07' },
        'report-division-filter': { options: [{ textContent: 'Semua Divisi' }], selectedIndex: 0 },
        'report-status-filter': { options: [{ textContent: 'Semua' }], selectedIndex: 0 },
        'attendance-employee-filter': { options: [{ textContent: 'Dewi Lestari - Penyiar' }], selectedIndex: 0 }
    };
    return elements[id] || null;
};

const attendancePrintConfig = sandbox.adminReports.getPrintReportConfig('attendance');
assert.strictEqual(
    JSON.stringify(attendancePrintConfig.filters.map(row => [row.label, row.value])),
    JSON.stringify([
        ['Periode', 'Juli 2026'],
        ['Divisi', 'Penyiar'],
        ['Karyawan', 'Dewi Lestari']
    ]),
    'per-employee attendance print metadata should use employee data, hide status, and keep employee name clean'
);

let renderedAfterRowPrint = false;
let printedType = '';
let printedOptions = null;
const attendanceSelect = {
    parentElement: {
        querySelector: () => null,
        appendChild: () => {}
    },
    value: '',
    disabled: false,
    innerHTML: '',
    classList: {
        classes: new Set(),
        toggle(name, enabled) {
            if (enabled) this.classes.add(name);
            else this.classes.delete(name);
        }
    }
};
sandbox.document.createElement = tag => {
    return {
        tagName: tag,
        type: '',
        className: '',
        title: '',
        innerHTML: '',
        hidden: false,
        onclick: null
    };
};
sandbox.document.getElementById = id => {
    if (id === 'attendance-employee-filter') return attendanceSelect;
    return null;
};
sandbox.toast = { error: message => { throw new Error(message); } };
sandbox.adminReports.filters.attendance = {
    month: '2026-07',
    division: '',
    status: '',
    employee: ''
};
sandbox.adminReports.renderAttendanceReports = () => { renderedAfterRowPrint = true; };
sandbox.adminReports.printReport = (type, options = {}) => {
    printedType = type;
    printedOptions = options;
};

sandbox.adminReports.printAttendanceEmployee('KRY001');

assert.strictEqual(sandbox.adminReports.filters.attendance.employee, '', 'row print should not turn the employee display into an active table filter');
assert.strictEqual(sandbox.adminReports.filters.attendance.division, '', 'row print should not change the division filter that controls the visible table');
assert.strictEqual(renderedAfterRowPrint, false, 'row print should not rerender the table into a single employee list');
assert.strictEqual(printedType, 'attendance', 'row print should still print the attendance report');
assert.strictEqual(printedOptions.printTargetUserId, 'KRY001', 'row print should pass a one-time print target');
assert.strictEqual(attendanceSelect.disabled, false, 'row print should not lock the employee dropdown');
assert.strictEqual(attendanceSelect.innerHTML, '', 'row print should not rewrite the employee dropdown');

const rowPrintConfig = sandbox.adminReports.getPrintReportConfig('attendance', { printTargetUserId: 'KRY001' });
assert.strictEqual(rowPrintConfig.title, 'LAPORAN REKAP ABSENSI KARYAWAN', 'per-employee attendance print title should stay formal without "per" wording');
assert.strictEqual(rowPrintConfig.printTargetUserId, 'KRY001', 'one-time print target should drive print row filtering');

let printedJurnalType = '';
let printedJurnalOptions = null;
let renderedAfterJurnalRowPrint = false;
sandbox.adminReports.filters.jurnal = {
    month: '2026-07',
    employee: ''
};
sandbox.adminReports.renderJurnalReports = () => { renderedAfterJurnalRowPrint = true; };
sandbox.adminReports.printReport = (type, options = {}) => {
    printedJurnalType = type;
    printedJurnalOptions = options;
};

sandbox.adminReports.printJurnalEmployee('KRY001');

assert.strictEqual(sandbox.adminReports.filters.jurnal.employee, '', 'jurnal row print should not turn the selected employee into a table filter');
assert.strictEqual(renderedAfterJurnalRowPrint, false, 'jurnal row print should not rerender the visible table');
assert.strictEqual(printedJurnalType, 'jurnal', 'jurnal row print should print the jurnal report');
assert.strictEqual(printedJurnalOptions.printTargetUserId, 'KRY001', 'jurnal row print should pass a one-time print target');

let printedLeaveType = '';
let printedLeaveOptions = null;
let renderedAfterLeaveRowPrint = false;
sandbox.adminReports.filters.leave = {
    month: '2026-07',
    type: '',
    status: '',
    employee: ''
};
sandbox.adminReports.renderLeaveReports = () => { renderedAfterLeaveRowPrint = true; };
sandbox.adminReports.printReport = (type, options = {}) => {
    printedLeaveType = type;
    printedLeaveOptions = options;
};

sandbox.adminReports.printLeaveEmployee('KRY001');

assert.strictEqual(sandbox.adminReports.filters.leave.employee, '', 'leave row print should not turn the selected employee into a table filter');
assert.strictEqual(renderedAfterLeaveRowPrint, false, 'leave row print should not rerender the visible table');
assert.strictEqual(printedLeaveType, 'leave', 'leave row print should print the cuti and izin report');
assert.strictEqual(printedLeaveOptions.printTargetUserId, 'KRY001', 'leave row print should pass a one-time print target');

sandbox.adminReports.jurnalData = [
    { userId: 'KRY001', name: 'Dewi Lestari', division: 'Penyiar', date: '2026-07-01', updatedAt: '2026-07-01' },
    { userId: 'KRY002', name: 'Raka Pratama', division: 'Produksi', date: '2026-07-01', updatedAt: '2026-07-01' }
];
sandbox.adminReports.filters.jurnal = {
    month: '2026-07',
    employee: 'KRY001',
    status: ''
};

const jurnalRows = sandbox.adminReports.getFilteredJurnal();
assert.strictEqual(jurnalRows.length, 1, 'jurnal should filter by selected employee id');
assert.strictEqual(jurnalRows[0].name, 'Dewi Lestari');

const jurnalRowPrintConfig = sandbox.adminReports.getPrintReportConfig('jurnal', { printTargetUserId: 'KRY001' });
assert.strictEqual(jurnalRowPrintConfig.title, 'LAPORAN REKAP JURNAL KERJA KARYAWAN', 'jurnal print title should stay formal without "per" wording');
assert.strictEqual(jurnalRowPrintConfig.printTargetUserId, 'KRY001', 'jurnal one-time print target should drive print row filtering');

sandbox.adminReports.leaveData = [
    { userId: 'KRY001', name: 'Dewi Lestari', type: 'Cuti', status: 'approved', appliedAt: '2026-07-01' },
    { userId: 'KRY002', name: 'Raka Pratama', type: 'Izin / Sakit', status: 'approved', appliedAt: '2026-07-01' }
];
sandbox.adminReports.filters.leave = {
    month: '2026-07',
    type: '',
    status: '',
    employee: 'KRY001'
};

const leaveRows = sandbox.adminReports.getFilteredLeave();
assert.strictEqual(leaveRows.length, 1, 'leave and permission should filter by selected employee id');
assert.strictEqual(leaveRows[0].name, 'Dewi Lestari');

const leaveRowPrintConfig = sandbox.adminReports.getPrintReportConfig('leave', { printTargetUserId: 'KRY001' });
assert.strictEqual(leaveRowPrintConfig.title, 'LAPORAN REKAP CUTI DAN IZIN KARYAWAN', 'leave print title should stay formal without "per" wording');
assert.strictEqual(leaveRowPrintConfig.printTargetUserId, 'KRY001', 'leave one-time print target should drive print row filtering');

console.log('per-employee print report tests passed');
