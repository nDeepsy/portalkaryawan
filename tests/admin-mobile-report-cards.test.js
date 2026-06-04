const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const adminEmployeesJs = fs.readFileSync(path.join(root, 'js', 'admin-employees.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'css', 'admin.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'css', 'mobile.css'), 'utf8');
const backendLeaveJs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Leave.js'), 'utf8');

function testAdminReportMobileCardsRenderAllBackendDataSections() {
    assert(
        adminReportsJs.includes("document.getElementById('attendance-mobile-cards')"),
        'attendance report should render mobile cards from loaded backend data'
    );
    assert(
        adminReportsJs.includes("document.getElementById('jurnal-mobile-cards')"),
        'journal report should render mobile cards from loaded backend data'
    );
    assert(
        adminReportsJs.includes("document.getElementById('leave-mobile-cards')"),
        'leave report should render mobile cards from loaded backend data'
    );
}

function testAdminReportMobileCardsIncludeActionButtons() {
    assert(
        /attendance-mobile-cards[\s\S]*viewAttendanceDetail/.test(adminReportsJs),
        'attendance mobile cards should include the detail action button'
    );
    assert(
        /jurnal-mobile-cards[\s\S]*viewJurnalDetail[\s\S]*deleteJurnal/.test(adminReportsJs),
        'journal mobile cards should include view and delete actions'
    );
    assert(
        /leave-mobile-cards[\s\S]*viewLeaveDetail[\s\S]*approveLeaveOrPermission[\s\S]*rejectLeaveOrPermission/.test(adminReportsJs),
        'leave mobile cards should include detail and approval actions'
    );
}

function testMobileCardActionsHaveCompactLayout() {
    assert(
        /\.mobile-card-actions\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/s.test(mobileCss),
        'mobile card actions should be compact and aligned to the right'
    );
}

function testAdminEmployeeMobileFiltersKeepSearchIconInsideField() {
    assert(
        /\.filter-group\s*\{[^}]*position:\s*relative;/s.test(adminCss),
        'admin filter groups should anchor their absolute icons inside the field'
    );
    assert(
        /\.filter-group\.has-icon\s+input\s*\{[^}]*padding-right:\s*42px;/s.test(adminCss),
        'search inputs with right-side icons should reserve right padding for the icon'
    );
    assert(
        /\.filter-group\.has-icon\s+i\s*\{[^}]*left:\s*auto;[^}]*right:\s*var\(--spacing\);/s.test(adminCss),
        'employee search icon should sit on the right inside the search field'
    );
}

function testEmployeeSearchInputDoesNotAutofillItself() {
    assert(
        /id="employee-search"[^>]*autocomplete="off"[^>]*autocorrect="off"[^>]*spellcheck="false"[^>]*readonly/s.test(indexHtml),
        'employee search input should opt out of mobile/browser autofill and correction'
    );
    assert(
        adminEmployeesJs.includes("searchInput.value = this.filters.search || '';"),
        'employee search input should be reset to the module filter state during init'
    );
    assert(
        adminEmployeesJs.includes('protectSearchInputFromAutofill()'),
        'employee search should actively clear delayed browser autofill'
    );
    assert(
        adminEmployeesJs.includes("searchInput.readOnly = false"),
        'employee search should only become editable after the user focuses it'
    );
}

function testShiftScheduleSearchInputDoesNotAutofillItself() {
    const shiftScheduleJs = fs.readFileSync(path.join(root, 'js', 'shift-schedule.js'), 'utf8');

    assert(
        /id="schedule-employee-search"[^>]*autocomplete="off"[^>]*autocorrect="off"[^>]*spellcheck="false"/s.test(indexHtml),
        'shift schedule search input should opt out of mobile/browser autofill and correction'
    );
    assert(
        shiftScheduleJs.includes("searchInput.value = this.filters.search || '';"),
        'shift schedule search input should be reset to the module filter state during init'
    );
}

function testAdminEmployeeMobileActionButtonsUseSharedActionLayout() {
    assert(
        adminEmployeesJs.includes('mobile-card-actions'),
        'employee mobile cards should use the shared mobile card action layout'
    );
    assert(
        /class="btn-action view employee-card-action"[\s\S]*aria-label="Lihat detail karyawan"/.test(adminEmployeesJs),
        'employee mobile view button should use a compact icon-only action control'
    );
    assert(
        /class="btn-action edit employee-card-action"[\s\S]*aria-label="Edit karyawan"/.test(adminEmployeesJs),
        'employee mobile edit button should use a compact icon-only action control'
    );
    assert(
        /class="btn-action delete employee-card-action"[\s\S]*onclick="adminEmployees\.deleteEmployee/.test(adminEmployeesJs),
        'employee mobile cards should include a compact delete action for admins'
    );
    assert(
        /#employees-mobile-cards\s+\.employee-card-action\s*\{[^}]*width:\s*42px;[^}]*height:\s*38px;/s.test(mobileCss),
        'employee mobile action buttons should use compact PC-like icon button sizing'
    );
}

function testAdminEmployeeDetailUsesCardModalInsteadOfAlert() {
    assert(
        !/alert\(`Detail Karyawan/.test(adminEmployeesJs),
        'employee detail should use the shared modal instead of a browser alert'
    );
    assert(
        adminEmployeesJs.includes("actions.modalClass = 'admin-detail-modal employee-detail-modal'"),
        'employee detail should use the shared admin detail modal styling'
    );
    assert(
        adminEmployeesJs.includes('employee-detail-content') && adminEmployeesJs.includes('employee-detail-grid'),
        'employee detail should render structured detail cards'
    );
    assert(
        /\.employee-detail-grid\s*\{[^}]*display:\s*grid;/s.test(adminCss),
        'employee detail fields should be displayed in a card grid'
    );
}

function testAdminReportsShowNewestSubmittedRowsFirst() {
    assert(
        adminReportsJs.includes('sortRowsNewestFirst(rows = [], getDateValue)'),
        'admin reports should have a shared newest-first sorting helper'
    );
    assert(
        /getFilteredLeave\(\)\s*\{[\s\S]*sortRowsNewestFirst\([\s\S]*getLeaveSubmittedAt/.test(adminReportsJs),
        'leave and permission reports should be sorted by submitted date with newest first'
    );
    assert(
        /getFilteredJurnal\(\)\s*\{[\s\S]*sortRowsNewestFirst\([\s\S]*row\.updatedAt \|\| row\.date/.test(adminReportsJs),
        'journal reports should be sorted by latest update/date with newest first'
    );
    assert(
        /getFilteredLeave\(\)\s*\{[\s\S]*matchesMonth[\s\S]*getLeaveMonthKey/.test(adminReportsJs),
        'leave month filter should use the leave submission/date key'
    );
}

function testLeaveReportsKeepConfirmedRowsWithSparseSheetData() {
    assert(
        /filterValidLeaves\(rows\)\s*\{[\s\S]*this\.hasValue\(row,\s*'userId'\)[\s\S]*this\.hasValue\(row,\s*'startDate'\)[\s\S]*this\.hasValue\(row,\s*'endDate'\)/.test(adminReportsJs),
        'leave reports should keep confirmed sheet rows as long as employee and date fields exist'
    );
    assert(
        !/filterValidLeaves\(rows\)\s*\{[\s\S]*this\.hasValue\(row,\s*'reason'\)[\s\S]*this\.hasValue\(row,\s*'appliedAt'\)/s.test(adminReportsJs),
        'leave report filtering should not drop older confirmed rows just because reason/appliedAt is blank'
    );
    assert(
        adminReportsJs.includes('formatLeaveReportDateRange'),
        'leave report table should format leave dates as dd/mm/yyyy'
    );
    assert(
        adminReportsJs.includes('formatLeaveReportDate(row.dates || row.date ||') || adminReportsJs.includes('formatLeaveReportDate(row.dates || row.date'),
        'permission report table should format permission dates as dd/mm/yyyy'
    );
    assert(
        !/isValidLeaveRow\(row\)\s*\{[\s\S]*String\(row\.reason/s.test(backendLeaveJs),
        'backend leave filtering should not drop older confirmed rows just because reason is blank'
    );
}

function testAdminReportsRenderCachedDataBeforeBackendRefresh() {
    assert(
        adminReportsJs.includes('loadCachedReportData()'),
        'admin reports should have a cache-first report data loader'
    );
    assert(
        /initJurnalReports\(\)\s*\{[\s\S]*this\.loadCachedReportData\(\);[\s\S]*this\.renderJurnalReports\(\);[\s\S]*this\.refreshJurnalReports\(\);/.test(adminReportsJs),
        'admin journal reports should render cached data before refreshing backend data'
    );
    assert(
        /initLeaveReports\(\)\s*\{[\s\S]*this\.loadCachedReportData\(\);[\s\S]*this\.renderLeaveReports\(\);[\s\S]*this\.refreshLeaveReports\(\);/.test(adminReportsJs),
        'admin leave reports should render cached data before refreshing backend data'
    );
}

function testPermissionAndLeaveApiReadsAreCacheable() {
    ['getLeaves', 'getAllLeaves', 'getIzin', 'getAllIzin'].forEach(action => {
        assert(
            apiJs.includes(`'${action}'`),
            `${action} should be included in API cache/invalidations for faster repeat loads`
        );
    });
}

function testEmployeeDeleteSyncsFrontendAndBackendRelatedData() {
    assert(
        apiJs.includes('_localDeleteEmployeeRelatedData(id)'),
        'frontend employee delete should clear local related employee data after deletion'
    );
    ['attendance', 'jurnals', 'leaves', 'izin'].forEach(key => {
        assert(apiJs.includes(`storage.set('${key}', filterByUser(storage.get('${key}', [])))`), `frontend delete should clear ${key} cache rows`);
    });

    const backendEmployeeJs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Employee.js'), 'utf8');
    ['Attendance', 'Journals', 'Leaves', 'Izin'].forEach(sheet => {
        assert(backendEmployeeJs.includes(`deleteRowsByUserId('${sheet}', id)`), `backend delete should clear ${sheet} rows`);
    });
    assert(backendEmployeeJs.includes('removeEmployeeFromShiftSchedules(id)'), 'backend delete should remove the employee from shift schedules');
}

function testAdminEmployeesRenderCachedRowsBeforeBackendRefresh() {
    assert(
        adminEmployeesJs.includes('loadCachedEmployees()'),
        'admin employees should have a cache-first loader'
    );
    assert(
        /async init\(\)\s*\{[\s\S]*this\.loadCachedEmployees\(\);[\s\S]*this\.renderTable\(\);[\s\S]*this\.refreshEmployees\(\);/.test(adminEmployeesJs),
        'admin employees should render cached rows before refreshing backend data'
    );
}

testAdminReportMobileCardsRenderAllBackendDataSections();
testAdminReportMobileCardsIncludeActionButtons();
testMobileCardActionsHaveCompactLayout();
testAdminEmployeeMobileFiltersKeepSearchIconInsideField();
testEmployeeSearchInputDoesNotAutofillItself();
testShiftScheduleSearchInputDoesNotAutofillItself();
testAdminEmployeeMobileActionButtonsUseSharedActionLayout();
testAdminEmployeeDetailUsesCardModalInsteadOfAlert();
testAdminReportsShowNewestSubmittedRowsFirst();
testLeaveReportsKeepConfirmedRowsWithSparseSheetData();
testAdminReportsRenderCachedDataBeforeBackendRefresh();
testPermissionAndLeaveApiReadsAreCacheable();
testAdminEmployeesRenderCachedRowsBeforeBackendRefresh();
testEmployeeDeleteSyncsFrontendAndBackendRelatedData();
console.log('admin mobile report card tests passed');
