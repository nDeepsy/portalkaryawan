const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function createElementMock() {
    return {
        hidden: false,
        innerHTML: '',
        textContent: '',
        addEventListener() {},
        querySelectorAll() { return []; },
        appendChild() {},
        prepend() {},
        remove() {},
        classList: {
            add() {},
            remove() {}
        },
        style: {}
    };
}

function loadNotificationCenter({ api }) {
    const elements = new Map();
    const documentMock = {
        hidden: false,
        readyState: 'loading',
        addEventListener() {},
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElementMock());
            return elements.get(id);
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        createElement() {
            return createElementMock();
        },
        body: createElementMock(),
        documentElement: createElementMock()
    };

    const storage = new Map();
    const context = {
        console,
        setInterval,
        clearInterval,
        setTimeout,
        requestAnimationFrame: callback => callback(),
        localStorage: {
            getItem: key => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key),
            clear: () => storage.clear(),
            get length() { return storage.size; },
            key: index => Array.from(storage.keys())[index] || null
        },
        sessionStorage: {
            getItem: () => null,
            setItem() {},
            removeItem() {},
            clear() {}
        },
        document: documentMock,
        window: {
            addEventListener() {},
            auth: {
                getCurrentUser: () => ({ id: 'admin', role: 'admin' })
            },
            api,
            router: { navigate() {} }
        },
        API_BASE_URL: 'https://example.test',
        api,
        auth: {
            getCurrentUser: () => ({ id: 'admin', role: 'admin' })
        },
        history: {},
        location: {},
        navigator: {},
        module: {},
        exports: {}
    };
    context.window.window = context.window;
    context.window.document = documentMock;
    context.window.localStorage = context.localStorage;
    context.window.sessionStorage = context.sessionStorage;
    context.window.setInterval = setInterval;
    context.window.clearInterval = clearInterval;
    context.window.setTimeout = setTimeout;

    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'main.js' });

    return {
        notificationCenter: context.window.notificationCenter,
        badge: elements.get('notification-badge') || documentMock.getElementById('notification-badge'),
        list: elements.get('notification-list') || documentMock.getElementById('notification-list')
    };
}

function loadRouterWithNotificationCenter(notificationCenter) {
    const context = {
        console,
        document: {
            title: '',
            addEventListener() {},
            querySelectorAll() { return []; },
            querySelector() { return null; },
            getElementById() { return null; },
            documentElement: { scrollTop: 0 },
            body: { scrollTop: 0 }
        },
        window: {
            addEventListener() {},
            scrollTo() {},
            notificationCenter
        },
        requestAnimationFrame: callback => callback(),
        setTimeout: callback => callback(),
        history: {
            scrollRestoration: '',
            pushState() {}
        },
        storage: { set() {} },
        auth: {
            isLoggedIn: () => true,
            isAdmin: () => true
        },
        APP_COMPANY_NAME: 'PT Magtas Radio 107.3 FM'
    };
    context.window.window = context.window;
    context.window.document = context.document;

    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'router.js' });
    return context.window.router;
}

function testBackendDeletesNotificationsBySameMenu() {
    const backendSource = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script-absensi', 'Notification.js'), 'utf8');
    const codeSource = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script-absensi', 'Code.js'), 'utf8');
    const apiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');

    assert(backendSource.includes('deleteNotificationsByMenuData'), 'backend should delete notifications by target menu');
    assert(backendSource.includes('markNotificationsForMenuData'), 'backend should expose a menu-based notification cleanup');
    assert(backendSource.includes('deleteNotificationsByMenuKeyData(menuKey, normalizedRole, normalizedUserId)'), 'backend should delete notifications by explicit menu key');
    assert(backendSource.includes('getNotificationMenuKeyData'), 'backend should map notification type and role to a menu key');
    assert(backendSource.includes('const deletedCount = deleteNotificationsByMenuData(notification, role, userId);'), 'mark single should delete all accessible notifications in the same menu');
    assert(backendSource.includes("normalizedRole === 'admin' && (type === 'leave' || type === 'permission')"), 'admin leave and permission notifications should share the leave reports menu');
    assert(codeSource.includes("case 'markNotificationsForMenu':"), 'backend router should expose markNotificationsForMenu');
    assert(apiSource.includes('async markNotificationsForMenu(page, role, userId)'), 'frontend API should expose markNotificationsForMenu');
}

function testNotificationPollingIsFastEnoughForCrossDeviceActivity() {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

    assert(
        mainSource.includes('refreshIntervalMs: 2000'),
        'notification center should poll quickly so cross-device activity appears without manual refresh'
    );
}

async function testMarkAllIgnoresStaleRefresh() {
    const loadRequest = createDeferred();
    const markAllRequest = createDeferred();
    const api = {
        getNotifications: () => loadRequest.promise,
        markAllNotificationsRead: () => markAllRequest.promise,
        clearRequestCache() {}
    };
    const { notificationCenter, badge } = loadNotificationCenter({ api });

    notificationCenter.items = [{ id: '1', isRead: false }];
    notificationCenter.renderBadge(1);

    const loadPromise = notificationCenter.load('admin', 'admin', { silent: true });
    const markPromise = notificationCenter.markAllAsRead();

    assert.strictEqual(badge.hidden, true, 'badge should hide immediately after mark all');

    loadRequest.resolve({
        success: true,
        data: {
            unreadCount: 1,
            items: [{ id: '1', isRead: false }]
        }
    });
    await loadPromise;

    assert.strictEqual(badge.hidden, true, 'stale refresh must not restore old unread badge');
    assert.strictEqual(notificationCenter.items.length, 0, 'stale refresh must not restore old unread items');

    markAllRequest.resolve({ success: true, data: { updatedCount: 1 } });
    await markPromise;
}

async function testMarkSingleDecrementsTotalUnreadCount() {
    const markRequest = createDeferred();
    const api = {
        getNotifications: async () => ({
            success: true,
            data: {
                unreadCount: 49,
                items: Array.from({ length: 30 }, (_, index) => ({ id: String(index + 1), isRead: false }))
            }
        }),
        markNotificationRead: async () => markRequest.promise,
        clearRequestCache() {}
    };
    const { notificationCenter, badge } = loadNotificationCenter({ api });

    notificationCenter.items = Array.from({ length: 30 }, (_, index) => ({ id: String(index + 1), isRead: false }));
    notificationCenter.unreadCount = 50;
    notificationCenter.renderBadge(notificationCenter.unreadCount);

    const markPromise = notificationCenter.markAsRead('1');

    assert.strictEqual(badge.textContent, '49', 'badge should decrement the total unread count, not use rendered item count');

    markRequest.resolve({ success: true, data: { deleted: true, id: '1' } });
    await markPromise;
}

async function testMarkSingleClearsNotificationsInSameMenu() {
    let markedId = '';
    const markRequest = createDeferred();
    const api = {
        getNotifications: async () => ({
            success: true,
            data: { unreadCount: 0, items: [] }
        }),
        markNotificationRead: async id => {
            markedId = id;
            return markRequest.promise;
        },
        clearRequestCache() {}
    };
    const { notificationCenter, badge } = loadNotificationCenter({ api });
    const navigatedPages = [];
    notificationCenter.getSession = () => ({ id: 'admin', role: 'admin' });
    notificationCenter.navigateToNotification = item => {
        navigatedPages.push(notificationCenter.getNotificationTargetPage(item, { role: 'admin' }));
    };

    notificationCenter.items = [
        { id: '1', type: 'leave', isRead: false },
        { id: '2', type: 'permission', isRead: false },
        { id: '3', type: 'attendance', isRead: false }
    ];
    notificationCenter.unreadCount = 3;
    notificationCenter.renderBadge(3);

    const markPromise = notificationCenter.markAsRead('1');

    assert.strictEqual(markedId, '1', 'clicked notification id should be sent to the backend');
    assert.deepStrictEqual(notificationCenter.items.map(item => item.id), ['3'], 'notifications in the same admin leave menu should be cleared together');
    assert.strictEqual(badge.textContent, '1', 'badge should decrement by all unread notifications cleared from the same menu');
    assert.deepStrictEqual(navigatedPages, ['leave-reports'], 'click should still navigate to the selected notification menu');

    markRequest.resolve({ success: true, data: { deletedCount: 2 } });
    await markPromise;
}

async function testEnteringMenuClearsNotificationsForThatMenu() {
    let clearedPage = '';
    const clearRequest = createDeferred();
    const api = {
        getNotifications: async () => ({ success: true, data: { unreadCount: 0, items: [] } }),
        markNotificationsForMenu: async (page) => {
            clearedPage = page;
            return clearRequest.promise;
        },
        clearRequestCache() {}
    };
    const { notificationCenter, badge } = loadNotificationCenter({ api });

    notificationCenter.getSession = () => ({ id: 'admin', role: 'admin' });
    notificationCenter.items = [
        { id: '1', type: 'attendance', isRead: false },
        { id: '2', type: 'journal', isRead: false }
    ];
    notificationCenter.unreadCount = 2;
    notificationCenter.renderBadge(2);

    const clearPromise = notificationCenter.clearForPage('attendance-reports');

    assert.strictEqual(clearedPage, 'attendance-reports', 'frontend should ask backend to clear notifications for the entered menu');
    assert.deepStrictEqual(notificationCenter.items.map(item => item.id), ['2'], 'only notifications for the entered menu should disappear locally');
    assert.strictEqual(badge.textContent, '1', 'badge should decrement after entering the notification menu');

    clearRequest.resolve({ success: true, data: { deletedCount: 1 } });
    await clearPromise;
}

function testRouterClearsNotificationsWhenShowingPage() {
    const clearedPages = [];
    const router = loadRouterWithNotificationCenter({
        clearForPage(page) {
            clearedPages.push(page);
        }
    });

    router.showPage('attendance-reports', false);

    assert.deepStrictEqual(clearedPages, ['attendance-reports'], 'router should clear notifications when a user enters any page/menu');
}

Promise.resolve()
    .then(testBackendDeletesNotificationsBySameMenu)
    .then(testNotificationPollingIsFastEnoughForCrossDeviceActivity)
    .then(testMarkAllIgnoresStaleRefresh)
    .then(testMarkSingleDecrementsTotalUnreadCount)
    .then(testMarkSingleClearsNotificationsInSameMenu)
    .then(testEnteringMenuClearsNotificationsForThatMenu)
    .then(testRouterClearsNotificationsWhenShowingPage)
    .then(() => {
        console.log('notification-center tests passed');
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
