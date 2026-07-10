const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');

const store = {
    admin_employees: [{ id: 'KRY001', name: 'Dennis Pamungkas', division: 'Pimpinan', status: 'active' }],
    attendance: [{ userId: 'KRY001', date: '2026-07-10', clockIn: '08:00', status: 'ontime' }],
    leaves: [],
    izin: [],
    jurnals: []
};

const sandbox = {
    console: { ...console, error() {} },
    window: {},
    API_BASE_URL: 'https://script.google.com/mock',
    api: {
        batch: async () => {
            throw new Error('network unavailable');
        }
    },
    storage: {
        get: (key, fallback = []) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback,
        set: (key, value) => {
            store[key] = value;
        }
    },
    normalizeEmployeeList: rows => rows || [],
    getEmployeeDivision: employee => employee.division || '',
    auth: { getCurrentUser: () => null }
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

(async () => {
    await sandbox.adminReports.loadData();

    assert.strictEqual(
        sandbox.adminReports.rawEmployees.length,
        1,
        'remote refresh failure should keep cached employees instead of emptying reports'
    );
    assert.strictEqual(
        sandbox.adminReports.attendanceData.length,
        1,
        'remote refresh failure should keep cached attendance summary rows'
    );
    assert.strictEqual(
        store.admin_employees.length,
        1,
        'remote refresh failure should not overwrite cached employees with an empty array'
    );

    sandbox.api.batch = async () => ({
        data: {
            employees: { success: true, data: [] },
            journals: { success: true, data: [] },
            leaves: { success: true, data: [] },
            izin: { success: true, data: [] },
            attendance: { success: true, data: [] }
        }
    });

    await sandbox.adminReports.loadData();

    assert.strictEqual(
        sandbox.adminReports.rawEmployees.length,
        1,
        'empty remote employee response should preserve cached employees while the user is on reports'
    );
    assert.strictEqual(
        store.admin_employees.length,
        1,
        'empty remote employee response should not overwrite cached employees'
    );

    console.log('attendance remote cache fallback tests passed');
})();
