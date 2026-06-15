const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const adminDashboardJs = fs.readFileSync(path.join(root, 'js', 'admin-dashboard.js'), 'utf8');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const shiftScheduleJs = fs.readFileSync(path.join(root, 'js', 'shift-schedule.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(root, 'js', 'dashboard.js'), 'utf8');
const absensiJs = fs.readFileSync(path.join(root, 'js', 'absensi.js'), 'utf8');
const izinJs = fs.readFileSync(path.join(root, 'js', 'izin.js'), 'utf8');
const jurnalJs = fs.readFileSync(path.join(root, 'js', 'jurnal.js'), 'utf8');
const cutiJs = fs.readFileSync(path.join(root, 'js', 'cuti.js'), 'utf8');
const adminEmployeesJs = fs.readFileSync(path.join(root, 'js', 'admin-employees.js'), 'utf8');

assert(
    apiJs.includes('broadcastDataUpdated') &&
    apiJs.includes("new CustomEvent('dataUpdated'"),
    'api should expose a global dataUpdated event helper'
);

assert(
    apiJs.includes('cacheTtl: 15000'),
    'api cache TTL should be short enough that active menus do not show stale data too long'
);

assert(
    apiJs.includes('clearRequestCacheForActions'),
    'api should clear specific cached read actions after related data changes'
);

assert(
    settingsJs.includes('refreshAfterSettingsChange') &&
    settingsJs.includes("api.broadcastDataUpdated('settings'"),
    'settings saves should broadcast a shared refresh event after persistence'
);

assert(
    settingsJs.includes("await this.setSaveButtonLoading(saveWorkdaysBtn") &&
    settingsJs.includes("await this.setSaveButtonLoading(saveSystemBtn"),
    'settings save buttons should stay in a loading state while changes are being saved and refreshed'
);

assert(
    adminDashboardJs.includes("addEventListener('dataUpdated'") &&
    adminDashboardJs.includes('handleDataUpdated'),
    'admin dashboard should react to shared data update events'
);

assert(
    adminReportsJs.includes("addEventListener('dataUpdated'") &&
    adminReportsJs.includes('handleDataUpdated'),
    'admin reports should react to shared data update events'
);

assert(
    shiftScheduleJs.includes("addEventListener('dataUpdated'") &&
    shiftScheduleJs.includes('handleDataUpdated'),
    'shift schedule should react to shared data update events'
);

[
    ['employee dashboard', dashboardJs],
    ['attendance page', absensiJs],
    ['permission page', izinJs],
    ['journal page', jurnalJs],
    ['leave page', cutiJs],
    ['employee management page', adminEmployeesJs]
].forEach(([label, source]) => {
    assert(
        source.includes("addEventListener('dataUpdated'") &&
        source.includes('handleDataUpdated'),
        `${label} should react to shared data update events`
    );
});

console.log('Data refresh event tests passed');
