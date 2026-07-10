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
    source.includes('printAttendanceEmployee('),
    'attendance reports should expose a per-row print helper'
);

assert(
    source.includes('data-print-action') &&
        source.includes('title="Cetak laporan karyawan"'),
    'attendance row action should include a visible per-employee print button'
);

assert(
    adminCss.includes('.btn-action.print') &&
        adminCss.includes('.print-scope-badge') &&
        adminCss.includes('.employee-filter-active') &&
        adminCss.includes('.employee-filter-locked'),
    'per-employee print UI should have dedicated screen and print styling'
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
        ['Status', 'Aktif'],
        ['Karyawan', 'Dewi Lestari']
    ]),
    'per-employee attendance print metadata should use employee data and keep employee name clean'
);

let renderedAfterRowPrint = false;
let printedType = '';
const attendanceSelect = {
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
sandbox.adminReports.printReport = type => { printedType = type; };

sandbox.adminReports.printAttendanceEmployee('KRY001');

assert.strictEqual(sandbox.adminReports.filters.attendance.employee, '', 'row print should not turn the employee display into an active table filter');
assert.strictEqual(sandbox.adminReports.filters.attendance.division, '', 'row print should not change the division filter that controls the visible table');
assert.strictEqual(renderedAfterRowPrint, false, 'row print should not rerender the table into a single employee list');
assert.strictEqual(printedType, 'attendance', 'row print should still print the attendance report');
assert.strictEqual(attendanceSelect.disabled, true, 'row print employee display should be locked');
assert(attendanceSelect.innerHTML.includes('Dewi Lestari'), 'locked employee display should show the employee name');
assert(!attendanceSelect.innerHTML.includes('Penyiar'), 'locked employee display should show only the employee name');

const selectedRowPrintEmployee = sandbox.adminReports.getSelectedReportEmployee('attendance');
assert.strictEqual(selectedRowPrintEmployee.name, 'Dewi Lestari', 'row print target should drive print metadata');

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

console.log('per-employee print report tests passed');
