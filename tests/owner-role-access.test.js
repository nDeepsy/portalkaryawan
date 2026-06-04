const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const routerSource = fs.readFileSync(path.join(root, 'js', 'router.js'), 'utf8');
const mobileSource = fs.readFileSync(path.join(root, 'js', 'mobile.js'), 'utf8');
const adminEmployeesSource = fs.readFileSync(path.join(root, 'js', 'admin-employees.js'), 'utf8');
const adminReportsSource = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const backendAuthSource = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Auth.js'), 'utf8');
const backendDatabaseSource = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Database.js'), 'utf8');
const backendLeaveSource = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Leave.js'), 'utf8');
const backendPermissionSource = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Permission.js'), 'utf8');

function createClassList() {
    const values = new Set();
    return {
        add(name) { values.add(name); },
        remove(...names) { names.forEach(name => values.delete(name)); },
        contains(name) { return values.has(name); },
        toggle(name, enabled) { enabled ? values.add(name) : values.delete(name); }
    };
}

function loadRouterForRole(role) {
    const elements = new Map();
    const getElement = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                textContent: '',
                classList: createClassList()
            });
        }
        return elements.get(id);
    };

    const storageData = new Map();
    const context = {
        console,
        APP_COMPANY_NAME: 'PT Magtas Radio 107.3 FM',
        window: { addEventListener() {} },
        document: {
            title: '',
            documentElement: { scrollTop: 0 },
            body: { scrollTop: 0 },
            addEventListener() {},
            querySelectorAll: selector => {
                if (selector === '.page') {
                    return [
                        getElement('page-admin-dashboard'),
                        getElement('page-shift-schedule'),
                        getElement('page-settings'),
                        getElement('page-dashboard')
                    ];
                }
                if (selector === '.nav-item') return [];
                return [];
            },
            querySelector: () => null,
            getElementById: getElement
        },
        history: { pushState() {}, scrollRestoration: 'auto' },
        location: { hash: '' },
        storage: {
            set(key, value) { storageData.set(key, value); },
            get(key, defaultValue = null) { return storageData.has(key) ? storageData.get(key) : defaultValue; }
        },
        auth: {
            isAdmin: () => role === 'admin',
            isPemilik: () => role === 'pemilik',
            isKaryawan: () => role === 'karyawan',
            isLoggedIn: () => true
        },
        requestAnimationFrame(callback) { callback(); },
        setTimeout(callback) { callback(); }
    };
    context.window.document = context.document;
    context.window.auth = context.auth;
    context.window.storage = context.storage;
    context.window.history = context.history;

    vm.runInNewContext(routerSource, context, { filename: 'router.js' });
    return { router: context.window.router, storageData };
}

function testLoginHasPemilikRoleOption() {
    assert(indexSource.includes('value="pemilik"'), 'login form should include a pemilik role option');
    assert(indexSource.includes('<span>Pemilik</span>'), 'login role option should show Pemilik label');
}

function testAuthNormalizesPemilikRole() {
    assert(authSource.includes("normalized === 'pemilik'"), 'auth should normalize pemilik role');
    assert(authSource.includes('isPemilik()'), 'auth should expose isPemilik helper');
    assert(authSource.includes('getRoleLabel'), 'auth should use a role label helper for UI/profile');
}

function testPemilikRouterAllowsOnlyOwnerPages() {
    const { router, storageData } = loadRouterForRole('pemilik');
    router.navigate('employees');
    assert.strictEqual(router.currentPage, 'employees');
    assert.strictEqual(storageData.get('currentPage'), 'employees');

    router.navigate('shift-schedule');
    assert.strictEqual(router.currentPage, 'admin-dashboard');
    assert.strictEqual(storageData.get('currentPage'), 'admin-dashboard');

    router.navigate('settings');
    assert.strictEqual(router.currentPage, 'admin-dashboard');

    router.navigate('dashboard');
    assert.strictEqual(router.currentPage, 'admin-dashboard');
}

function testPemilikMenusHideShiftAndSettings() {
    assert(indexSource.includes('data-admin-only="true"'), 'admin-only menu items should be marked for pemilik hiding');
    assert(authSource.includes('applyRoleVisibility'), 'auth should apply role visibility to admin-only controls');
    assert(mobileSource.includes('applyRoleVisibility'), 'mobile resize should re-apply pemilik menu visibility');
}

function testPemilikCannotManageEmployees() {
    assert(adminEmployeesSource.includes('canManageEmployees()'), 'employee module should check canManageEmployees');
    assert(adminEmployeesSource.includes('ensureCanManageEmployees'), 'employee module should guard manual CRUD calls');
    assert(/\$\{canManage \? `[\s\S]*onclick="adminEmployees\.editEmployee/.test(adminEmployeesSource), 'edit buttons should only render when canManage is true');
    assert(/\$\{canManage \? `[\s\S]*onclick="adminEmployees\.deleteEmployee/.test(adminEmployeesSource), 'delete buttons should only render when canManage is true');
}

function testPemilikCanUseReportsAndConfirmLeave() {
    assert(adminReportsSource.includes('canAccessAdminReports'), 'reports should allow admin and pemilik access');
    assert(adminReportsSource.includes('canConfirmLeaveRequests'), 'reports should have a pemilik-only leave confirmation helper');
    assert(adminReportsSource.includes('getConfirmationActor'), 'approval should include the current confirmation actor');
    assert(adminReportsSource.includes('confirmedByRole'), 'confirmation actor should include role metadata');
    assert(adminReportsSource.includes('confirmedByName'), 'leave reports should expose who confirmed the request');
    assert(apiSource.includes("this.request('approveLeave', { id, ...actor })"), 'API approve leave should forward confirmation actor metadata');
    assert(backendLeaveSource.includes('isOwnerConfirmationActor'), 'backend leave confirmation should require pemilik role metadata');
    assert(backendPermissionSource.includes('isOwnerIzinConfirmationActor'), 'backend izin confirmation should require pemilik role metadata');
}

function testBackendLoginAndSeedUseUsersForPemilik() {
    assert(backendAuthSource.includes("selectedRole === 'pemilik'"), 'backend login should branch pemilik through Users');
    assert(backendAuthSource.includes("String(user.role || '').toLowerCase() !== selectedRole"), 'backend login should reject mismatched Users roles');
    assert(backendDatabaseSource.includes("'owner'"), 'database seed should include owner id');
    assert(backendDatabaseSource.includes("'pemilik@magtas.com'"), 'database seed should include pemilik test email');
    assert(backendDatabaseSource.includes('removeUnusedEmployeeUser'), 'database seed should remove the unused Users employee account');
    assert(!backendDatabaseSource.includes("'karyawan@company.com', 'karyawan123', 'karyawan'"), 'Users seed should not include unused karyawan account');
}

testLoginHasPemilikRoleOption();
testAuthNormalizesPemilikRole();
testPemilikRouterAllowsOnlyOwnerPages();
testPemilikMenusHideShiftAndSettings();
testPemilikCannotManageEmployees();
testPemilikCanUseReportsAndConfirmLeave();
testBackendLoginAndSeedUseUsersForPemilik();
console.log('owner role access tests passed');
