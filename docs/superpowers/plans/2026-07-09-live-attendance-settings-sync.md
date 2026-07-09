# Live Attendance Settings Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize admin attendance-location changes to visible authenticated clients within approximately 10 seconds and immediately on focus, same-browser tab updates, or attendance-modal opening.

**Architecture:** Add a focused `attendance-settings-sync.js` module that owns polling, change detection, request ordering, and lifecycle state. Add an API method that bypasses only settings caches and local overlays for remote reads. Reuse the existing `settingsUpdated` event to update consumers, including recalculating an open attendance modal without discarding its photo.

**Tech Stack:** JavaScript, browser events, localStorage, Google Apps Script HTTP API, Node.js VM/assertion tests.

---

## File Structure

- Create `js/attendance-settings-sync.js`: synchronization lifecycle, normalization, fresh polling, storage-event handling, request locking, and change dispatch.
- Create `tests/attendance-settings-live-sync.test.js`: behavioral unit tests for the synchronizer and source contracts for integration points.
- Modify `js/api.js`: add a fresh remote settings read that excludes local overlays.
- Modify `js/auth.js`: emit authentication lifecycle events after login/logout state changes.
- Modify `js/face-recognition.js`: apply synchronized settings directly and recalculate the open modal.
- Modify `index.html`: load the synchronizer and update cache-busting identifiers.

### Task 1: Define and Implement Fresh Settings Reads

**Files:**
- Modify: `tests/data-refresh-events.test.js`
- Modify: `js/api.js:724-760`
- Test: `tests/data-refresh-events.test.js`

- [ ] **Step 1: Add failing API assertions**

Add:

```js
assert(
    apiJs.includes('async getFreshSettings()') &&
    apiJs.includes("this.clearRequestCacheForActions(['getSettings', 'batch'])") &&
    apiJs.includes('return this.getSettings({ includeLocalOverrides: false })'),
    'api should expose a focused fresh settings read without stale local overlays'
);

assert(
    apiJs.includes('async getSettings(options = {})') &&
    apiJs.includes('options.includeLocalOverrides !== false'),
    'settings reads should explicitly control whether local overlays are applied'
);
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
node tests/data-refresh-events.test.js
```

Expected: FAIL with `api should expose a focused fresh settings read without stale local overlays`.

- [ ] **Step 3: Implement the fresh-read option**

Change the method signature and remote merge:

```js
async getSettings(options = {}) {
    const includeLocalOverrides = options.includeLocalOverrides !== false;
    const override = storage.get('settings_local_override', {});
    const localSettings = {
        ...storage.get('app_settings', {}),
        ...(override?.values || {})
    };

    if (!API_BASE_URL) {
        return {
            success: true,
            data: {
                working_days: localSettings.working_days || JSON.stringify({
                    senin: true,
                    selasa: true,
                    rabu: true,
                    kamis: true,
                    jumat: true,
                    sabtu: false,
                    minggu: false
                }),
                late_tolerance: localSettings.late_tolerance || '15',
                annual_leave_days: localSettings.annual_leave_days || '12',
                attendance_location_enabled: localSettings.attendance_location_enabled || 'true',
                attendance_location_latitude: localSettings.attendance_location_latitude || '',
                attendance_location_longitude: localSettings.attendance_location_longitude || '',
                attendance_location_radius: localSettings.attendance_location_radius || '100'
            }
        };
    }

    const result = await this.request('getSettings');
    if (result?.success && includeLocalOverrides) {
        result.data = { ...(result.data || {}), ...localSettings };
    }
    return result;
},

async getFreshSettings() {
    this.clearRequestCacheForActions(['getSettings', 'batch']);
    return this.getSettings({ includeLocalOverrides: false });
},
```

- [ ] **Step 4: Run the test and verify GREEN**

```powershell
node tests/data-refresh-events.test.js
node --check js/api.js
```

Expected: `Data refresh event tests passed`; syntax check exits 0.

- [ ] **Step 5: Commit**

```powershell
git add tests/data-refresh-events.test.js js/api.js
git commit -m "feat: add fresh settings API read"
```

### Task 2: Add the Shared Synchronizer

**Files:**
- Create: `tests/attendance-settings-live-sync.test.js`
- Create: `js/attendance-settings-sync.js`
- Modify: `js/auth.js:145-155`
- Modify: `js/auth.js:182-187`
- Modify: `index.html:1725-1728`
- Test: `tests/attendance-settings-live-sync.test.js`

- [ ] **Step 1: Write the behavioral synchronizer test**

Create `tests/attendance-settings-live-sync.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'attendance-settings-sync.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
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
    auth: {
        getCurrentUser() {
            return currentUser;
        }
    },
    document: {
        hidden: false,
        addEventListener(type, handler) {
            documentListeners[type] = handler;
        }
    },
    window: {
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
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'settingsUpdated');
    assert.strictEqual(events[0].detail.source, 'remote-sync');

    await sync.refresh({ force: true });
    assert.strictEqual(events.length, 1, 'unchanged values should not emit another event');

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
    console.log('attendance settings live sync tests passed');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
node tests/attendance-settings-live-sync.test.js
```

Expected: FAIL with `ENOENT` for `js/attendance-settings-sync.js`.

- [ ] **Step 3: Implement the synchronizer**

Create `js/attendance-settings-sync.js`:

```js
const attendanceSettingsSync = {
    refreshIntervalMs: 10000,
    timer: null,
    initialized: false,
    isLoading: false,
    requestSequence: 0,
    appliedSequence: 0,
    lastFingerprint: '',
    locationKeys: [
        'attendance_location_enabled',
        'attendance_location_latitude',
        'attendance_location_longitude',
        'attendance_location_radius'
    ],

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.lastFingerprint = this.fingerprint(
            this.normalize(storage.get('app_settings', {}) || {})
        );

        window.addEventListener('focus', () => this.refresh({ force: true }));
        window.addEventListener('storage', event => this.handleStorageEvent(event));
        window.addEventListener('settingsUpdated', event => this.handleLocalSettingsEvent(event));
        document.addEventListener('visibilitychange', () => this.updateLifecycle());
        document.addEventListener('authReady', () => this.updateLifecycle());
        document.addEventListener('authChanged', () => this.updateLifecycle());

        this.updateLifecycle();
    },

    hasSession() {
        return Boolean(window.auth?.getCurrentUser?.());
    },

    normalize(values = {}) {
        return {
            attendance_location_enabled: String(values.attendance_location_enabled ?? 'true'),
            attendance_location_latitude: String(values.attendance_location_latitude ?? ''),
            attendance_location_longitude: String(values.attendance_location_longitude ?? ''),
            attendance_location_radius: String(values.attendance_location_radius ?? '100')
        };
    },

    fingerprint(values) {
        return this.locationKeys.map(key => `${key}:${values[key]}`).join('|');
    },

    start() {
        if (this.timer || document.hidden || !this.hasSession()) return;
        this.timer = setInterval(() => this.refresh(), this.refreshIntervalMs);
    },

    stop() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    },

    updateLifecycle() {
        if (document.hidden || !this.hasSession()) {
            this.stop();
            return;
        }
        this.start();
        this.refresh({ force: true });
    },

    async refresh(options = {}) {
        if (this.isLoading || !this.hasSession()) return false;
        if (document.hidden && !options.force) return false;

        const sequence = ++this.requestSequence;
        this.isLoading = true;
        try {
            const result = await api.getFreshSettings();
            if (!result?.success || !result.data || sequence < this.appliedSequence) return false;
            return this.apply(result.data, { sequence, source: 'remote-sync', emit: true });
        } catch (error) {
            console.error('Attendance settings sync error:', error);
            return false;
        } finally {
            this.isLoading = false;
        }
    },

    apply(values, options = {}) {
        const normalized = this.normalize(values);
        const nextFingerprint = this.fingerprint(normalized);
        const sequence = Number(options.sequence || ++this.requestSequence);
        if (sequence < this.appliedSequence || nextFingerprint === this.lastFingerprint) return false;

        this.appliedSequence = sequence;
        this.lastFingerprint = nextFingerprint;
        storage.set('app_settings', {
            ...(storage.get('app_settings', {}) || {}),
            ...normalized
        });

        if (options.emit !== false) {
            window.dispatchEvent(new CustomEvent('settingsUpdated', {
                detail: {
                    section: 'system',
                    values: normalized,
                    source: options.source || 'remote-sync'
                }
            }));
        }
        return true;
    },

    handleStorageEvent(event) {
        if (event?.key !== 'app_settings' || !event.newValue) return;
        try {
            this.apply(JSON.parse(event.newValue), { source: 'storage-sync', emit: true });
        } catch (error) {
            console.error('Attendance settings storage sync error:', error);
        }
    },

    handleLocalSettingsEvent(event) {
        if (event?.detail?.source === 'remote-sync' || event?.detail?.source === 'storage-sync') return;
        const section = event?.detail?.section || '';
        if (section && section !== 'system') return;

        const values = event?.detail?.values || storage.get('app_settings', {}) || {};
        this.apply(values, {
            sequence: ++this.requestSequence,
            source: 'local-save',
            emit: false
        });
    }
};

window.attendanceSettingsSync = attendanceSettingsSync;
attendanceSettingsSync.init();
```

- [ ] **Step 4: Emit auth lifecycle changes**

After assigning the successful login session:

```js
this.currentUser = user;
sessionStorage_manager.set('session', user);
document.dispatchEvent(new CustomEvent('authChanged', {
    detail: { authenticated: true, role: user.role }
}));
```

In `clearSession()`, after clearing the session:

```js
document.dispatchEvent(new CustomEvent('authChanged', {
    detail: { authenticated: false }
}));
```

- [ ] **Step 5: Load the synchronizer**

In `index.html`, immediately after `js/auth.js`:

```html
<script src="js/attendance-settings-sync.js?v=20260709-live-location-sync"></script>
```

- [ ] **Step 6: Run tests and syntax checks**

```powershell
node tests/attendance-settings-live-sync.test.js
node --check js/attendance-settings-sync.js
node --check js/auth.js
```

Expected: `attendance settings live sync tests passed`; both syntax checks exit 0.

- [ ] **Step 7: Commit**

```powershell
git add tests/attendance-settings-live-sync.test.js js/attendance-settings-sync.js js/auth.js index.html
git commit -m "feat: sync attendance settings across active clients"
```

### Task 3: Recalculate an Open Attendance Modal

**Files:**
- Modify: `tests/attendance-settings-live-sync.test.js`
- Modify: `js/face-recognition.js:195-217`
- Modify: `js/face-recognition.js:768-774`
- Modify: `index.html:1735`
- Test: `tests/attendance-settings-live-sync.test.js`

- [ ] **Step 1: Add failing modal integration assertions**

Read `js/face-recognition.js` in the test and add:

```js
assert(
    faceRecognitionSource.includes('applyAttendanceLocationSettings') &&
    faceRecognitionSource.includes('this.locationVerified = accuracyReady && this.locationRadiusStatus.allowed'),
    'open attendance modal should recalculate validity from synchronized settings'
);

assert(
    faceRecognitionSource.includes('event?.detail?.values') &&
    faceRecognitionSource.includes('faceRecognition.applyAttendanceLocationSettings'),
    'settingsUpdated should apply supplied values without a duplicate server request'
);
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
node tests/attendance-settings-live-sync.test.js
```

Expected: FAIL with `open attendance modal should recalculate validity from synchronized settings`.

- [ ] **Step 3: Extract modal settings application**

Replace the successful settings application in `loadAttendanceLocationSettings()` and add:

```js
async loadAttendanceLocationSettings() {
    if (!this.requiresAttendanceRadius()) {
        this.attendanceLocationSettings = { enabled: false, configured: true };
        return;
    }

    try {
        const result = window.api?.getFreshSettings
            ? await api.getFreshSettings()
            : await api.getSettings();
        const data = result?.data || storage.get('app_settings', {}) || {};
        storage.set('app_settings', { ...storage.get('app_settings', {}), ...data });
        this.applyAttendanceLocationSettings(data);
    } catch (error) {
        console.error('Error loading attendance location settings:', error);
        this.applyAttendanceLocationSettings(storage.get('app_settings', {}) || {});
    }
},

applyAttendanceLocationSettings(data = {}) {
    this.attendanceLocationSettings = this.normalizeAttendanceLocationSettings(data);
    if (!this.position) return;

    const accuracy = Number(this.position.coords?.accuracy || Infinity);
    const waitedLongEnough = (Date.now() - this.locationStartedAt) >= this.locationMaxWaitMs;
    const accuracyReady = accuracy <= this.maxAcceptableAccuracyMeters || waitedLongEnough;
    this.locationRadiusStatus = this.getLocationRadiusStatus(this.position);
    this.locationVerified = accuracyReady && this.locationRadiusStatus.allowed;
    this.renderLocation(this.position, this.locationVerified);
    this.checkCanSubmit();
},
```

- [ ] **Step 4: Apply event values directly**

Replace the bottom `settingsUpdated` listener with:

```js
window.addEventListener('settingsUpdated', (event) => {
    if (router?.currentPage !== 'face-recognition' || !faceRecognition.currentAction) return;
    const section = event?.detail?.section || '';
    if (section && section !== 'system') return;

    const values = event?.detail?.values;
    if (values) {
        faceRecognition.applyAttendanceLocationSettings(values);
        return;
    }
    faceRecognition.loadAttendanceLocationSettings();
});
```

- [ ] **Step 5: Update cache busting**

```html
<script src="js/face-recognition.js?v=20260709-live-location-sync"></script>
```

- [ ] **Step 6: Run focused tests**

```powershell
node tests/attendance-settings-live-sync.test.js
node tests/data-refresh-events.test.js
node --check js/face-recognition.js
```

Expected: both test scripts pass; syntax check exits 0.

- [ ] **Step 7: Commit**

```powershell
git add tests/attendance-settings-live-sync.test.js js/face-recognition.js index.html
git commit -m "feat: refresh open attendance modal settings"
```

### Task 4: Verify Full Related Behavior

**Files:**
- Test: `tests/attendance-settings-live-sync.test.js`
- Test: `tests/data-refresh-events.test.js`
- Test: `tests/attendance-location-radius.test.js`
- Test: `tests/attendance-backend-frontend-sync.test.js`
- Test: `tests/absensi-responsive-update.test.js`
- Test: `tests/settings-location-picker.test.js`

- [ ] **Step 1: Run all related tests**

```powershell
node tests/attendance-settings-live-sync.test.js
node tests/data-refresh-events.test.js
node tests/attendance-location-radius.test.js
node tests/attendance-backend-frontend-sync.test.js
node tests/absensi-responsive-update.test.js
node tests/settings-location-picker.test.js
node --check js/api.js
node --check js/auth.js
node --check js/attendance-settings-sync.js
node --check js/face-recognition.js
```

Expected:

```text
attendance settings live sync tests passed
Data refresh event tests passed
attendance location radius tests passed
attendance backend/frontend sync tests passed
absensi responsive update tests passed
settings location picker tests passed
```

All syntax checks exit 0.

- [ ] **Step 2: Inspect scope and cleanliness**

```powershell
git diff --check main...HEAD
git status --short
git diff --stat main...HEAD
```

Expected: no whitespace errors, a clean worktree, and only the frontend synchronization files listed in this plan.

- [ ] **Step 3: Browser verification**

Using non-production admin and employee sessions:

1. Open the employee attendance modal and capture a photo.
2. Change the office point or radius in the admin session.
3. Verify the admin tab reacts immediately after save.
4. Verify the employee tab updates within 10 seconds without reload.
5. Verify the captured photo remains present.
6. Verify the distance message and `Di Luar Radius`/`Konfirmasi Absensi` button state update from the new settings.
7. Hide the employee tab for more than 10 seconds and verify polling pauses.
8. Return to the employee tab and verify one immediate refresh occurs.
9. Log out and verify no further settings requests occur.
10. Submit a deliberately stale outside-radius payload and verify Apps Script rejects it.
