const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const backendLeaveSource = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Leave.js'), 'utf8');
const adminReportsSource = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const izinSource = fs.readFileSync(path.join(root, 'js', 'izin.js'), 'utf8');
const cutiSource = fs.readFileSync(path.join(root, 'js', 'cuti.js'), 'utf8');
const mainCssSource = fs.readFileSync(path.join(root, 'css', 'main.css'), 'utf8');
const mobileCssSource = fs.readFileSync(path.join(root, 'css', 'mobile.css'), 'utf8');

function createElementMock() {
    return {
        value: '',
        textContent: '',
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
}

function loadCuti() {
    const storageData = new Map();
    const documentMock = {
        addEventListener() {},
        getElementById() {
            return createElementMock();
        },
        querySelector() {
            return createElementMock();
        },
        querySelectorAll() {
            return [];
        }
    };
    const context = {
        console,
        window: {},
        document: documentMock,
        storage: {
            get(key, defaultValue = null) {
                return storageData.has(key) ? storageData.get(key) : defaultValue;
            },
            set(key, value) {
                storageData.set(key, value);
            }
        },
        auth: {
            getCurrentUser: () => ({ id: 'KRY001', role: 'karyawan' }),
            isAdmin: () => false
        },
        api: {},
        toast: {},
        dateTime: {
            formatDate: value => String(value)
        }
    };
    context.window.window = context.window;
    context.window.document = documentMock;
    context.window.cuti = null;

    const source = fs.readFileSync(path.join(root, 'js', 'cuti.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'cuti.js' });
    return context.window.cuti;
}

function testLeaveBalanceUsesApprovedLeaveRequestsInCurrentYearOnly() {
    const cuti = loadCuti();
    cuti.annualLeaveDays = 14;
    cuti.leaves = [
        {
            userId: 'KRY001',
            type: 'annual',
            startDate: '2026-01-10',
            endDate: '2026-01-12',
            duration: 3,
            status: 'approved'
        },
        {
            userId: 'KRY001',
            type: 'annual',
            startDate: '2026-03-02',
            endDate: '2026-03-03',
            duration: 2,
            status: 'pending'
        },
        {
            userId: 'KRY001',
            type: 'annual',
            startDate: '2025-12-20',
            endDate: '2025-12-21',
            duration: 2,
            status: 'approved'
        },
        {
            userId: 'KRY001',
            type: 'sick',
            startDate: '2026-04-01',
            endDate: '2026-04-02',
            duration: 2,
            status: 'approved'
        },
        {
            userId: 'KRY001',
            type: 'annual',
            startDate: '2026-05-01',
            endDate: '2026-05-01',
            duration: 1,
            status: 'rejected'
        }
    ];

    assert.strictEqual(cuti.calculateLeaveBalance(2026, 'KRY001'), 9);
    assert.strictEqual(cuti.calculateLeaveBalance(2027, 'KRY001'), 14);
}

function testAnnualLeaveOverlapCountsOnlyDaysInSelectedYear() {
    const cuti = loadCuti();
    cuti.annualLeaveDays = 12;
    cuti.leaves = [
        {
            userId: 'KRY001',
            type: 'annual',
            startDate: '2026-12-30',
            endDate: '2027-01-02',
            duration: 4,
            status: 'approved'
        }
    ];

    assert.strictEqual(cuti.calculateLeaveBalance(2026, 'KRY001'), 10);
    assert.strictEqual(cuti.calculateLeaveBalance(2027, 'KRY001'), 10);
}

function testZeroAnnualLeaveAllowanceIsValid() {
    const cuti = loadCuti();
    cuti.applyAnnualLeaveSetting(0);
    cuti.leaves = [];

    assert.strictEqual(cuti.calculateLeaveBalance(2026, 'KRY001'), 0);
}

function testLeaveBackendRepairsAndNormalizesRowsForAdminReports() {
    assert(
        backendLeaveSource.includes('ensureLeaveSheetHeaders();\naddRow'),
        'backend leave submit should repair Leaves headers before saving a request'
    );
    assert(
        backendLeaveSource.includes('getAllRows(\'Leaves\').map(normalizeLeaveRow)'),
        'admin leave fetch should normalize rows before filtering'
    );
    assert(
        backendLeaveSource.includes('row.appliedAt || row.applied_at || row.createdAt'),
        'backend leave rows should preserve older timestamp aliases'
    );
    assert(
        !/String\(row\.appliedAt \|\| ''\)\.trim\(\) !== ''/.test(backendLeaveSource),
        'backend leave validity should not hide submitted leave rows only because appliedAt is missing'
    );
}

function testAdminLeaveReportsMergeFreshLocalCache() {
    assert(
        adminReportsSource.includes('leaves = this.mergeRowsByStableKey(leaves, storage.get(\'leaves\', []));'),
        'admin leave reports should merge fresh cached leave rows with remote rows'
    );
    assert(
        adminReportsSource.includes('mergeRowsByStableKey(primaryRows = [], fallbackRows = [])'),
        'admin reports should have a stable row merge helper'
    );
}

function testMobileSidebarOverridesSmallPhoneHiddenRule() {
    assert(
        /\.sidebar\s*\{[^}]*display:\s*flex\s*!important;/.test(mobileCssSource),
        'mobile sidebar should override the small-phone display:none rule so profile/logout remains reachable'
    );
}

function testEmployeeLeaveAndPermissionSummariesUseSingleMonthFilter() {
    assert(!indexHtml.includes('id="izin-history-date"'), 'permission history should not expose a duplicate date filter');
    assert(!indexHtml.includes('id="cuti-history-date"'), 'leave history should not expose a duplicate date filter');
    assert(!indexHtml.includes('id="jurnal-history-date"'), 'journal history should not expose a duplicate date filter');
    assert(indexHtml.includes('id="izin-summary-month"'), 'permission summary should expose a month filter');
    assert(indexHtml.includes('id="cuti-summary-month"'), 'leave summary should expose a month filter');
    assert(
        indexHtml.includes('class="employee-date-input jurnal-date-filter izin-summary-month"'),
        'permission summary month filter should reuse the polished calendar style'
    );
    assert(
        indexHtml.includes('class="employee-date-input jurnal-date-filter cuti-summary-month"'),
        'leave summary month filter should reuse the polished calendar style'
    );
    assert(!izinSource.includes("document.getElementById('izin-history-date')"), 'permission script should not bind a duplicate history date filter');
    assert(izinSource.includes("document.getElementById('izin-summary-month')"), 'permission script should bind the summary month filter');
    assert(izinSource.includes('getIzinStatsForSelectedMonth'), 'permission summary should count rows for the selected month');
    assert(izinSource.includes('this.renderIzinList();'), 'permission summary month filter should refresh the history list');
    assert(!cutiSource.includes("document.getElementById('cuti-history-date')"), 'leave script should not bind a duplicate history date filter');
    assert(cutiSource.includes("document.getElementById('cuti-summary-month')"), 'leave script should bind the summary month filter');
    assert(cutiSource.includes('getLeaveStatsForSelectedMonth'), 'leave summary should count rows for the selected month');
    assert(cutiSource.includes('this.renderLeaveList();'), 'leave summary month filter should refresh the history list');
    assert(
        /:is\(\.history-card,\s*\.izin-summary-card,\s*\.izin-history-card,\s*\.jurnal-summary-card,\s*\.jurnal-history-card,\s*\.cuti-summary-card,\s*\.cuti-history-card\)\s+\.employee-date-input/s.test(mobileCssSource),
        'mobile summary month inputs should share compact sizing'
    );
}

function testEmployeeHistoryControlsShareAlignedPlacement() {
    assert(
        /:is\(\.history-card,\s*\.izin-summary-card,\s*\.izin-history-card,\s*\.jurnal-summary-card,\s*\.jurnal-history-card,\s*\.cuti-summary-card,\s*\.cuti-history-card\)\s+\.card-header\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s.test(mainCssSource),
        'employee history cards should share the same desktop header alignment'
    );
    assert(
        /:is\(\.history-card,\s*\.izin-summary-card,\s*\.izin-history-card,\s*\.jurnal-summary-card,\s*\.jurnal-history-card,\s*\.cuti-summary-card,\s*\.cuti-history-card\)\s+\.card-header\s+\.header-actions\s*\{[^}]*margin-left:\s*auto;[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/s.test(mainCssSource),
        'employee history card controls should align to the right side of the header'
    );
}

testLeaveBalanceUsesApprovedLeaveRequestsInCurrentYearOnly();
testAnnualLeaveOverlapCountsOnlyDaysInSelectedYear();
testZeroAnnualLeaveAllowanceIsValid();
testLeaveBackendRepairsAndNormalizesRowsForAdminReports();
testAdminLeaveReportsMergeFreshLocalCache();
testMobileSidebarOverridesSmallPhoneHiddenRule();
testEmployeeLeaveAndPermissionSummariesUseSingleMonthFilter();
testEmployeeHistoryControlsShareAlignedPlacement();
console.log('cuti balance tests passed');
