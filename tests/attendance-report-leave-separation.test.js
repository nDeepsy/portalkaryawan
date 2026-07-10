const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const sandbox = {
    console,
    window: {},
    getEmployeeDivision: employee => employee.division || '',
    auth: { getCurrentUser: () => null }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const rows = sandbox.adminReports.buildAttendanceReportRows(
    [{ id: 'KRY001', name: 'Test', division: 'Siaran' }],
    [
        { userId: 'KRY001', date: '2026-07-01', clockIn: '08:00', status: 'ontime' },
        { userId: 'KRY001', date: '2026-07-02', clockIn: '08:20', status: 'Terlambat' },
        { userId: 'KRY001', date: '2026-07-03', clockIn: '', status: 'absent' }
    ],
    [{ userId: 'KRY001', status: 'approved', duration: 2 }],
    [
        { userId: 'KRY001', type: 'permission', status: 'approved', duration: 1 },
        { userId: 'KRY001', type: 'sick', status: 'approved', duration: 2 }
    ]
);

assert.strictEqual(rows[0].present, 2, 'attendance with clock-in should count as present');
assert.strictEqual(rows[0].late, 1, 'late remains a subset of present');
assert.strictEqual(rows[0].leave, 2, 'approved leave should have a separate count');
assert.strictEqual(rows[0].permission, 1, 'approved permission should have a separate count');
assert.strictEqual(rows[0].sick, 2, 'approved sickness should have a separate count');
assert.strictEqual(rows[0].absent, 1, 'only explicit absence without clock-in should count as absent');
assert.strictEqual(rows[0].total, 8, 'total should include present, leave, permission, sickness, and absence once');

assert(
    /<th[^>]*>Cuti<\/th>/.test(html) &&
        /<th[^>]*>Izin<\/th>/.test(html) &&
        /<th[^>]*>Sakit<\/th>/.test(html),
    'attendance report should show separate Cuti, Izin, and Sakit columns'
);
assert(
    !html.includes('id="report-status-filter"'),
    'attendance report should not show the ambiguous status filter'
);
assert(
    source.includes("{ header: 'Cuti', value: row => row.leave || 0") &&
        source.includes("{ header: 'Izin', value: row => row.permission || 0") &&
        source.includes("{ header: 'Sakit', value: row => row.sick || 0"),
    'Excel export should include separate Cuti, Izin, and Sakit columns'
);
assert(
    source.includes('<span>Cuti: <strong>${employee.leave}</strong></span>') &&
        source.includes('<span>Izin: <strong>${employee.permission}</strong></span>') &&
        source.includes('<span>Sakit: <strong>${employee.sick}</strong></span>'),
    'attendance detail summary should separate Cuti, Izin, and Sakit'
);

console.log('attendance report leave separation tests passed');
