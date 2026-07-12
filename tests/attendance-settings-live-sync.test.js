const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const syncPath = path.join(root, 'js', 'attendance-settings-sync.js');
assert(fs.existsSync(syncPath), 'attendance settings synchronizer should exist');

const source = fs.readFileSync(syncPath, 'utf8');
const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const faceRecognitionSource = fs.readFileSync(path.join(root, 'js', 'face-recognition.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const listeners = {};
const documentListeners = {};
const stored = {
    app_settings: {
        unrelated_setting: 'keep-me',
        attendance_location_enabled: 'true',
        attendance_location_latitude: '-6.1',
        attendance_location_longitude: '107.1',
        attendance_location_radius: '100'
    }
};
const events = [];
const timers = [];
let freshCalls = 0;
let currentUser = { id: 'EMP001', role: 'karyawan' };
let freshResult = {
    success: true,
    data: {
        attendance_location_enabled: 'true',
        attendance_location_latitude: '-6.2',
        attendance_location_longitude: '107.2',
        attendance_location_radius: '150'
    }
};

function CustomEvent(type, options = {}) {
    this.type = type;
    this.detail = options.detail || {};
}

const auth = {
    getCurrentUser() {
        return currentUser;
    }
};

const context = {
    console,
    CustomEvent,
    setInterval(callback, delay) {
        timers.push({ callback, delay });
        return timers.length;
    },
    clearInterval() {},
    storage: {
        get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : fallback;
        },
        set(key, value) {
            stored[key] = value;
            return true;
        }
    },
    api: {
        async getFreshSettings() {
            freshCalls += 1;
            return freshResult;
        }
    },
    auth,
    document: {
        hidden: false,
        addEventListener(type, handler) {
            documentListeners[type] = handler;
        }
    },
    window: {
        auth,
        addEventListener(type, handler) {
            listeners[type] = handler;
        },
        dispatchEvent(event) {
            events.push(event);
        }
    }
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context);

async function run() {
    const sync = context.window.attendanceSettingsSync;
    assert(sync, 'synchronizer should be exported');
    assert.strictEqual(sync.refreshIntervalMs, 10000);

    sync.init();
    assert.strictEqual(timers.length, 1, 'visible authenticated user should start one timer');
    assert.strictEqual(timers[0].delay, 10000);
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(freshCalls, 1, 'initialization should perform an immediate refresh');
    assert.strictEqual(events.length, 1);

    await sync.refresh({ force: true });
    assert.strictEqual(freshCalls, 2);
    assert.strictEqual(stored.app_settings.unrelated_setting, 'keep-me');
    assert.strictEqual(stored.app_settings.attendance_location_latitude, '-6.2');
    assert.strictEqual(events.length, 1, 'unchanged values should not emit another event');
    assert.strictEqual(events[0].type, 'settingsUpdated');
    assert.strictEqual(events[0].detail.source, 'remote-sync');

    sync.isLoading = true;
    await sync.refresh({ force: true });
    assert.strictEqual(freshCalls, 2, 'in-flight lock should skip another request');
    sync.isLoading = false;

    freshResult = {
        success: true,
        data: {
            attendance_location_enabled: 'true',
            attendance_location_latitude: '-6.3',
            attendance_location_longitude: '107.3',
            attendance_location_radius: '200'
        }
    };
    await listeners.focus();
    assert.strictEqual(stored.app_settings.attendance_location_radius, '200');

    currentUser = null;
    documentListeners.authChanged();
    const callsBeforeLogoutRefresh = freshCalls;
    await sync.refresh();
    assert.strictEqual(freshCalls, callsBeforeLogoutRefresh, 'logged-out clients should not poll');

    assert(authSource.includes("new CustomEvent('authChanged'"), 'auth should emit lifecycle changes');
    assert(indexHtml.includes('js/attendance-settings-sync.js'), 'page should load the synchronizer');
    assert(
        faceRecognitionSource.includes('applyAttendanceLocationSettings') &&
        faceRecognitionSource.includes('this.locationVerified = accuracyReady && (!this.requiresAttendanceRadius() || this.locationRadiusStatus.allowed)'),
        'open attendance modal should recalculate validity from synchronized settings'
    );
    assert(
        faceRecognitionSource.includes('event?.detail?.values') &&
        faceRecognitionSource.includes('faceRecognition.applyAttendanceLocationSettings'),
        'settingsUpdated should apply supplied values without a duplicate server request'
    );
    console.log('attendance settings live sync tests passed');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
