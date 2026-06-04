const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mobileSource = fs.readFileSync(path.join(root, 'js', 'mobile.js'), 'utf8');
const mobileCssSource = fs.readFileSync(path.join(root, 'css', 'mobile.css'), 'utf8');
const modalCssSource = fs.readFileSync(path.join(root, 'css', 'modal.css'), 'utf8');
const loginCssSource = fs.readFileSync(path.join(root, 'css', 'login.css'), 'utf8');

function createClassList() {
    const values = new Set();
    return {
        add(name) { values.add(name); },
        remove(name) { values.delete(name); },
        contains(name) { return values.has(name); }
    };
}

function loadMobile(isAdmin) {
    const elements = new Map();
    const getElement = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                style: {},
                classList: createClassList(),
                querySelectorAll: () => [],
                addEventListener() {}
            });
        }
        return elements.get(id);
    };

    const context = {
        console,
        window: {
            innerWidth: 390,
            addEventListener() {}
        },
        document: {
            body: { style: {} },
            addEventListener() {},
            getElementById: getElement,
            querySelectorAll: () => []
        },
        auth: {
            isAdmin: () => isAdmin
        },
        router: {
            navigate() {}
        }
    };
    context.window.document = context.document;
    context.window.auth = context.auth;
    context.window.router = context.router;

    const source = fs.readFileSync(path.join(root, 'js', 'mobile.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'mobile.js' });

    return {
        mobile: context.window.mobile,
        bottomNav: getElement('bottom-nav'),
        adminBottomNav: getElement('admin-bottom-nav'),
        menuToggle: getElement('mobile-menu-toggle')
    };
}

function testAdminMobileShowsOnlyAdminBottomNav() {
    const { mobile, bottomNav, adminBottomNav, menuToggle } = loadMobile(true);
    mobile.handleResize();
    assert.strictEqual(bottomNav.style.display, 'none');
    assert.strictEqual(adminBottomNav.style.display, 'flex');
    assert.strictEqual(menuToggle.style.display, 'none');
}

function testEmployeeMobileShowsOnlyEmployeeBottomNav() {
    const { mobile, bottomNav, adminBottomNav, menuToggle } = loadMobile(false);
    mobile.handleResize();
    assert.strictEqual(bottomNav.style.display, 'flex');
    assert.strictEqual(adminBottomNav.style.display, 'none');
    assert.strictEqual(menuToggle.style.display, 'none');
}

function loadRouter(isAdmin) {
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
        window: {
            addEventListener() {}
        },
        document: {
            title: '',
            documentElement: { scrollTop: 0 },
            body: { scrollTop: 0 },
            addEventListener() {},
            querySelectorAll: selector => {
                if (selector === '.page') return [getElement('page-admin-dashboard'), getElement('page-jurnal')];
                if (selector === '.nav-item') return [];
                return [];
            },
            querySelector: () => null,
            getElementById: getElement
        },
        history: {
            pushState() {},
            scrollRestoration: 'auto'
        },
        location: { hash: '' },
        storage: {
            set(key, value) { storageData.set(key, value); },
            get(key, defaultValue = null) { return storageData.has(key) ? storageData.get(key) : defaultValue; }
        },
        auth: {
            isAdmin: () => isAdmin,
            isLoggedIn: () => true
        },
        requestAnimationFrame(callback) { callback(); },
        setTimeout(callback) { callback(); }
    };
    context.window.document = context.document;
    context.window.auth = context.auth;
    context.window.storage = context.storage;
    context.window.history = context.history;

    const source = fs.readFileSync(path.join(root, 'js', 'router.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'router.js' });

    return { router: context.window.router, storageData };
}

function testAdminCannotNavigateToEmployeePages() {
    const { router, storageData } = loadRouter(true);
    router.navigate('jurnal');
    assert.strictEqual(router.currentPage, 'admin-dashboard');
    assert.strictEqual(storageData.get('currentPage'), 'admin-dashboard');
}

function testLoginRoleIsNormalizedBeforeSessionSave() {
    assert(
        authSource.includes('normalizeUserRole'),
        'auth should normalize backend role casing before deciding admin/karyawan access'
    );
}

function testEmployeeMobileHeaderUsesCompanyLogoOnlyForEmployeeRole() {
    assert(
        indexSource.includes('id="mobile-employee-logo"'),
        'mobile employee logo should exist in the top bar'
    );
    assert(
        authSource.includes("appContainer.classList.toggle('role-employee'"),
        'auth should mark employee sessions so mobile logo can be scoped by role'
    );
    assert(
        /\.app-container\.role-employee\s+\.mobile-employee-logo\s*\{[^}]*display:\s*block;/.test(mobileCssSource),
        'mobile employee logo should only be shown for employee app sessions'
    );
}

function testAdminMobileHeaderAlsoUsesCompanyLogo() {
    assert(
        /\.app-container\.role-admin\s+\.mobile-employee-logo\s*\{[^}]*display:\s*block;/.test(mobileCssSource),
        'mobile admin header should also show the company logo'
    );
}

function testProfileModalBodyIsScrollableOnMobile() {
    assert(
        /\.profile-modal-body\s*\{[^}]*overflow-y:\s*auto;/.test(modalCssSource),
        'profile modal body should scroll so mobile users can reach all profile fields'
    );
}

function testEmployeeHistoryHeaderActionsAlignRightOnMobile() {
    assert(
        /:is\(\.history-card,\s*\.izin-summary-card,\s*\.izin-history-card,\s*\.jurnal-summary-card,\s*\.jurnal-history-card,\s*\.cuti-summary-card,\s*\.cuti-history-card\)\s+\.card-header\s+\.header-actions\s*\{[^}]*margin-left:\s*auto;[^}]*justify-content:\s*flex-end;/.test(mobileCssSource),
        'employee history header filters/actions should align to the right on mobile'
    );
}

function testCompactMobileDensityRulesAreScopedToMobile() {
    assert(
        mobileCssSource.includes('Compact mobile density - phone only, keeps desktop untouched'),
        'compact density rules should be documented and scoped in mobile.css'
    );
    assert(
        /@media \(max-width:\s*768px\)\s*\{[\s\S]*--mobile-compact-gap:\s*10px;/.test(mobileCssSource),
        'compact density rules should live under max-width 768px'
    );
    assert(
        /\.top-bar\s*\{[^}]*min-height:\s*64px;/.test(mobileCssSource),
        'mobile top bar should be compact'
    );
    assert(
        /\.form-group\s*\{[^}]*margin-bottom:\s*10px;/.test(mobileCssSource),
        'mobile forms should use compact spacing'
    );
}

function testMobileDashboardDonutTextIsCompact() {
    assert(
        /\.donut-value\s*\{[^}]*font-size:\s*20px;/.test(mobileCssSource),
        'mobile dashboard donut percentage should be smaller so it fits inside the chart'
    );
    assert(
        /\.donut-label\s*\{[^}]*font-size:\s*10px;/.test(mobileCssSource),
        'mobile dashboard donut label should be compact'
    );
}

function testMobileModalCompactRulesExist() {
    assert(
        /@media \(max-width:\s*576px\)\s*\{[\s\S]*\.modal-header\s*\{[^}]*min-height:\s*52px;/.test(modalCssSource),
        'mobile modal header should be compact on phones'
    );
    assert(
        /\.modal-profile\s+\.profile-modal-body\s*\{[^}]*padding:\s*14px;/.test(modalCssSource),
        'profile modal body should use compact mobile padding'
    );
}

function testProfileModalShowsBeforeProfileFetch() {
    const displayIndex = authSource.indexOf("modal.style.display = 'flex';");
    const fetchIndex = authSource.indexOf('await api.getEmployeeProfile');

    assert(displayIndex !== -1, 'profile modal should still be shown by setting display flex');
    assert(fetchIndex !== -1, 'profile modal should still refresh employee profile from backend');
    assert(
        displayIndex < fetchIndex,
        'profile modal should open immediately before waiting for backend profile data'
    );
}

function testLoginMobileUsesCompactLayout() {
    assert(
        /Compact mobile login/.test(loginCssSource),
        'login.css should document compact mobile login rules'
    );
    assert(
        /@media \(max-width:\s*576px\)\s*\{[\s\S]*\.login-left\s*\{[^}]*min-height:\s*160px;/.test(loginCssSource),
        'mobile login hero should be shorter'
    );
    assert(
        /\.role-card\s*\{[^}]*min-height:\s*58px;/.test(loginCssSource),
        'mobile role buttons should be compact'
    );
    assert(
        /\.btn-login\s*\{[^}]*min-height:\s*42px;/.test(loginCssSource),
        'mobile login button should be compact'
    );
}

function testLoginPasswordToggleStaysInsideInput() {
    assert(
        /\.toggle-password\s*\{[^}]*right:\s*12px;[^}]*top:\s*50%;/.test(loginCssSource),
        'password toggle should sit inside the password input'
    );
    assert(
        /\.input-wrapper\s+\.toggle-password\s+i\s*\{[^}]*position:\s*static;/.test(loginCssSource),
        'password toggle icon should not inherit the leading input icon absolute positioning'
    );
}

function testAdminMobileNavigationShowsAllMenusInScrollableBar() {
    assert(
        !indexSource.includes('id="admin-more-toggle"') && !indexSource.includes('id="admin-more-panel"'),
        'admin mobile nav should not depend on the Lainnya toggle or popup panel'
    );
    ['admin-dashboard', 'employees', 'attendance-reports', 'jurnal-reports', 'leave-reports', 'shift-schedule', 'settings'].forEach(page => {
        assert(
            indexSource.includes(`data-page="${page}"`),
            `admin mobile nav should include ${page}`
        );
    });
    assert(
        /\.admin-bottom-nav\s*\{[^}]*overflow-x:\s*auto;/.test(mobileCssSource),
        'admin mobile nav should scroll horizontally on phones'
    );
    assert(
        /\.admin-bottom-nav\s+\.bottom-nav-item\s*\{[^}]*flex:\s*0 0 auto;/.test(mobileCssSource),
        'admin mobile nav items should keep their width while scrolling'
    );
    assert(
        !mobileSource.includes('initAdminMoreMenu') && !mobileSource.includes('admin-more-panel') && !mobileSource.includes('admin-more-toggle'),
        'mobile JS should not keep unused admin more-menu handlers'
    );
}

testAdminMobileShowsOnlyAdminBottomNav();
testEmployeeMobileShowsOnlyEmployeeBottomNav();
testAdminCannotNavigateToEmployeePages();
testLoginRoleIsNormalizedBeforeSessionSave();
testEmployeeMobileHeaderUsesCompanyLogoOnlyForEmployeeRole();
testAdminMobileHeaderAlsoUsesCompanyLogo();
testProfileModalBodyIsScrollableOnMobile();
testEmployeeHistoryHeaderActionsAlignRightOnMobile();
testCompactMobileDensityRulesAreScopedToMobile();
testMobileDashboardDonutTextIsCompact();
testMobileModalCompactRulesExist();
testProfileModalShowsBeforeProfileFetch();
testLoginMobileUsesCompactLayout();
testLoginPasswordToggleStaysInsideInput();
testAdminMobileNavigationShowsAllMenusInScrollableBar();
console.log('mobile admin access tests passed');
