const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminEmployeesJs = fs.readFileSync(path.join(root, 'js', 'admin-employees.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const routerJs = fs.readFileSync(path.join(root, 'js', 'router.js'), 'utf8');
const mainCss = fs.readFileSync(path.join(root, 'css', 'main.css'), 'utf8');
const modalCss = fs.readFileSync(path.join(root, 'css', 'modal.css'), 'utf8');
const databaseJs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Database.js'), 'utf8');
const authGs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Auth.js'), 'utf8');
const employeeGs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Employee.js'), 'utf8');
const settingsGs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Settings.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const settingsCss = fs.readFileSync(path.join(root, 'css', 'settings.css'), 'utf8');

assert(indexHtml.includes('Divisi'), 'employee UI should use Divisi label');
assert(indexHtml.includes('Pilih Divisi'), 'employee form should prompt for radio division');
assert(!indexHtml.includes('Bagian/Divisi'), 'employee UI should no longer use Bagian/Divisi wording');
assert(!adminEmployeesJs.includes('Bagian/Divisi'), 'admin employee scripts should no longer use Bagian/Divisi wording');
assert(indexHtml.includes('Pilih Jabatan'), 'employee form should use a position select prompt');
assert(indexHtml.includes('class="org-select"'), 'organization selects should keep the enhanced dropdown hook');
assert(indexHtml.includes('id="emp-division"'), 'employee form should use division id naming');
assert(/<input[^>]+id="emp-id"[^>]+readonly/.test(indexHtml), 'employee form should show a readonly employee ID field');
assert(indexHtml.includes('ID Karyawan'), 'employee form/profile should label the employee ID clearly');
assert(indexHtml.includes('id="profile-employee-id"'), 'employee profile should display the employee ID');
assert(
    /id="profile-employee-id"[\s\S]*id="profile-division"[\s\S]*id="profile-position"[\s\S]*id="profile-shift"/.test(indexHtml),
    'employee profile should arrange ID/division then position/shift in two compact rows'
);
assert(indexHtml.includes('id="division-filter"'), 'employee filter should use division id naming');
assert(!indexHtml.includes('emp-department'), 'employee form should no longer use emp-department id');
assert(!indexHtml.includes('dept-filter'), 'employee filter should no longer use dept-filter id');
assert(!indexHtml.includes('company-form'), 'unused company settings form should be removed');
assert(!indexHtml.includes('id="company-name"'), 'unused company name setting should be removed from settings');
assert(!indexHtml.includes('id="company-logo"'), 'unused company logo setting should be removed from settings');
assert(!indexHtml.includes('Informasi Perusahaan'), 'unused company settings card should be removed');
assert(indexHtml.includes('id="btn-save-shifts"'), 'shift settings should have an explicit save button');
assert(!settingsJs.includes('saveCompany'), 'unused company save handler should be removed');
assert(settingsJs.includes('draftShifts: []'), 'shift edits should use draft state before saving');
assert(settingsJs.includes('saveShifts()'), 'shift settings should save only after the save button is clicked');
assert(!settingsJs.includes('await api.addShift(newShift)'), 'adding a shift should not immediately call the backend');
const deleteShiftBlock = settingsJs.match(/deleteShift\(index\)\s*\{[\s\S]*?\n    \},\n\n    getShiftOptions/)?.[0] || '';
assert(!deleteShiftBlock.includes('api.deleteShift'), 'deleting a shift should not immediately call the backend');
assert(/\.settings-card\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s.test(settingsCss), 'settings cards should use column layout for aligned action buttons');
assert(/\.settings-card\s*>\s*\.settings-actions\s*\{[^}]*margin-top:\s*auto;/s.test(settingsCss), 'settings action buttons should align at the bottom of each card');
assert(!apiJs.includes('company_name'), 'local API settings should not keep unused company_name');
assert(!apiJs.includes('company_logo'), 'local API settings should not keep unused company_logo');
assert(!databaseJs.includes("['company_name'"), 'backend seed settings should not create unused company_name');
assert(!databaseJs.includes("['company_logo'"), 'backend seed settings should not create unused company_logo');
assert(settingsGs.includes('REMOVED_SETTING_KEYS'), 'backend settings should ignore removed company settings');
assert(mainJs.includes("const APP_COMPANY_NAME = 'PT Magtas Radio 107.3 FM';"), 'company name should be a fixed app constant');
assert(!mainJs.includes("storage.get('company'"), 'frontend should not read removed company settings');
assert(routerJs.includes('APP_COMPANY_NAME'), 'router title should use the fixed app name');
assert(indexHtml.includes('class="sidebar-logo-img"'), 'sidebar should render the company PNG logo');
assert(indexHtml.includes('assets/images/Logo Magtas Rado 107.3 FM.png'), 'sidebar should use the provided company logo asset');
assert(!indexHtml.includes('<i class="fas fa-infinity"></i>'), 'sidebar should not keep the old infinity icon');
assert(/<div class="logo-core">\s*<i class="fas fa-building"><\/i>\s*<\/div>/s.test(indexHtml), 'login hero should use the original office icon');
assert(/\.sidebar-header\s*\{[^}]*min-height:\s*100px;/s.test(mainCss), 'sidebar header should align with the top bar border');
assert(/\.sidebar-header\s*\{[^}]*padding:\s*var\(--spacing-sm\)\s+var\(--spacing-md\);/s.test(mainCss), 'sidebar header should keep the logo visually centered with the top bar');
assert(/\.sidebar-header\s*\{[^}]*box-sizing:\s*border-box;/s.test(mainCss), 'sidebar header height should include its border');
assert(/\.sidebar-logo\s*\{[^}]*font-size:\s*var\(--font-size-sm\);/s.test(mainCss), 'sidebar brand font size should keep the existing style');
assert(/\.sidebar-logo\s*\{[^}]*font-weight:\s*700;/s.test(mainCss), 'sidebar brand font weight should keep the existing style');
assert(/\.sidebar-logo-img\s*\{[^}]*width:\s*72px;/s.test(mainCss), 'sidebar logo image should be large enough to read clearly');
assert(/\.sidebar-logo-img\s*\{[^}]*object-fit:\s*contain;/s.test(mainCss), 'sidebar logo image should preserve the PNG shape');
assert(!/\.sidebar-logo\s*\{[^}]*width:\s*100%;/s.test(mainCss), 'sidebar logo row should not alter the original brand text layout');
assert(!/\.sidebar-logo-img\s*\{[^}]*margin-left:/s.test(mainCss), 'sidebar logo image should not shift the brand text horizontally');
assert(/\.sidebar\.collapsed\s+\.sidebar-logo-img\s*\{[^}]*width:\s*52px;/s.test(mainCss), 'collapsed sidebar should keep the logo compact');
const loginCss = fs.readFileSync(path.join(root, 'css', 'login.css'), 'utf8');
assert(/\.logo-core\s*\{[^}]*animation:\s*pulse-core\s+2s\s+ease-in-out\s+infinite;/s.test(loginCss), 'login logo core should keep the existing animation');
assert(/\.logo-core\s*\{[^}]*width:\s*80px;/s.test(loginCss), 'login office icon core should use the original size');
assert(/\.logo-core\s*\{[^}]*background:\s*var\(--color-primary-gradient\);/s.test(loginCss), 'login office icon core should use the original blue gradient');
assert(!loginCss.includes('.login-logo-img'), 'login hero should not keep company logo image styling');

['Pimpinan', 'Manajemen', 'Administrasi', 'Keuangan', 'Siaran', 'Keanggotaan'].forEach(value => {
    assert(adminEmployeesJs.includes(value), `admin employee options should include ${value}`);
});

['Manager', 'Ketua', 'Pengawas', 'Sekretaris', 'Bendahara', 'Penyiar', 'Anggota'].forEach(value => {
    assert(adminEmployeesJs.includes(value), `admin employee positions should include ${value}`);
});
assert(
    !/radioPositions:\s*\[[^\]]*'Pemilik'/s.test(adminEmployeesJs),
    'employee position dropdown should not include Pemilik because owner accounts live in Users'
);
assert(
    adminEmployeesJs.includes('isReservedEmployeePosition') && adminEmployeesJs.includes("value.toLowerCase() === 'pemilik'"),
    'employee position dropdown should filter Pemilik even if old employee data contains it'
);

assert(databaseJs.includes("'division'"), 'backend employee sheet should use division column naming');
assert(databaseJs.includes("'Siaran', 'Penyiar'"), 'seed employees should use radio organization roles');
assert(authGs.includes('division:'), 'backend auth responses should expose division');
assert(adminEmployeesJs.includes('divisionPositionMap'), 'position choices should be guided by the selected division');
assert(!adminEmployeesJs.includes('department'), 'admin employee script should use division field naming');
assert(adminEmployeesJs.includes('getSmallestAvailableEmployeeId'), 'employee preview should reuse deleted employee ID gaps');
assert(adminEmployeesJs.includes('updateEmployeeIdPreview'), 'employee modal should keep the visible employee ID in sync');
assert(adminEmployeesJs.includes("document.getElementById('emp-id').value = this.getNextEmployeeIdPreview()"), 'add employee modal should show the next generated employee ID');
assert(adminEmployeesJs.includes('employeeModalMode'), 'visible employee ID should not make add mode behave like edit mode');
assert(adminEmployeesJs.includes("this.employeeModalMode === 'edit'"), 'save handler should determine edit mode from modal state');
assert(adminEmployeesJs.includes('sortEmployeesById'), 'employee list should expose ID sorting');
assert(adminEmployeesJs.includes('.sort((a, b) => this.compareEmployeeIds(a.id, b.id))'), 'employee filters should sort rows by employee ID');
assert(adminEmployeesJs.includes('formatDisplayDate(emp.joinDate ||'), 'employee detail should display join date as dd/mm/yyyy');
assert(apiJs.includes('getSmallestAvailableEmployeeId'), 'local employee creation should reuse deleted employee ID gaps');
assert(apiJs.includes('data.id = this.getNextLocalEmployeeId(all);'), 'local add employee should use the reusable employee ID generator');
assert(employeeGs.includes('getSmallestAvailableEmployeeIdData'), 'backend employee creation should reuse deleted employee ID gaps');
assert(!/return 'KRY' \+ String\(maxNumber \+ 1\)/.test(employeeGs), 'backend employee ID generator should not use max plus one');
assert(modalCss.includes('.form-group select,'), 'form dropdowns should share the same select styling');
assert(/#profile-employee-fields\s+\.profile-field-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s.test(modalCss), 'employee profile fields should keep a two-column grid');
assert(/@media \(max-width:\s*576px\)\s*\{[\s\S]*#profile-employee-fields\s+\.profile-field-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s.test(modalCss), 'employee profile fields should stay two columns on phones');
assert(modalCss.includes('.filter-group select,'), 'admin filter dropdowns should share the same select styling');
assert(modalCss.includes('.cuti-form select,'), 'employee leave form dropdowns should share the same select styling');
assert(modalCss.includes('.izin-form select,'), 'employee permission form dropdowns should share the same select styling');
assert(modalCss.includes('.form-group input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),'), 'form text inputs should share the same control styling');
assert(modalCss.includes('.form-group textarea,'), 'form textareas should share the same control styling');
assert(modalCss.includes('data:image/svg+xml'), 'organization dropdown should use a polished custom chevron');
const unifiedSelectCss = modalCss.match(/\.form-group select,[\s\S]*?\.select-period option \{[\s\S]*?\}/)?.[0] || '';
assert(!unifiedSelectCss.includes('translateY'), 'organization dropdown should not use floating hover effects');
assert(!modalCss.includes('border-left: 4px solid'), 'organization dropdown should stay visually consistent with other form fields');

function loadScriptObject(source, globalName, context = {}) {
    const sandbox = {
        console,
        window: {},
        document: { addEventListener() {} },
        storage: { get: () => [], set() {} },
        auth: { isAdmin: () => true },
        api: {},
        toast: {},
        router: {},
        normalizeEmployeeList: rows => rows,
        normalizeEmployeeRecord: row => row,
        getEmployeeDivision: row => row.division || '',
        API_BASE_URL: '',
        ...context
    };
    sandbox.window.window = sandbox.window;
    vm.runInNewContext(source, sandbox);
    return sandbox.window[globalName] || sandbox[globalName];
}

const apiObject = loadScriptObject(apiJs, 'api', {
    sessionStorage_manager: { get: () => null, set() {}, remove() {} },
    fetch: async () => ({ ok: true, json: async () => ({}) })
});
assert.strictEqual(
    apiObject.getNextLocalEmployeeId([{ id: 'KRY002' }, { id: 'KRY003' }]),
    'KRY001',
    'local employee ID generator should reuse the first deleted ID gap'
);
assert.strictEqual(
    apiObject.getNextLocalEmployeeId([{ id: 'KRY001' }, { id: 'KRY003' }]),
    'KRY002',
    'local employee ID generator should reuse middle ID gaps'
);

const adminEmployeesObject = loadScriptObject(adminEmployeesJs, 'adminEmployees');
assert.strictEqual(
    adminEmployeesObject.getSmallestAvailableEmployeeId([{ id: 'KRY002' }, { id: 'KRY003' }]),
    'KRY001',
    'admin employee preview should reuse the first deleted ID gap'
);
assert.strictEqual(
    JSON.stringify(adminEmployeesObject.sortEmployeesById([
        { id: 'KRY010', name: 'C' },
        { id: 'KRY002', name: 'A' },
        { id: 'KRY001', name: 'B' }
    ]).map(emp => emp.id)),
    JSON.stringify(['KRY001', 'KRY002', 'KRY010']),
    'admin employee table should sort employees by natural ID order'
);

console.log('radio employee field tests passed');
