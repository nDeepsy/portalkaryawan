const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const absensiJs = fs.readFileSync(path.join(root, 'js', 'absensi.js'), 'utf8');
const faceRecognitionJs = fs.readFileSync(path.join(root, 'js', 'face-recognition.js'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'css', 'mobile.css'), 'utf8');

function createAbsensiHarness(overrides = {}) {
    const store = overrides.store || {};
    const elements = overrides.elements || new Map();
    const getElement = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                disabled: false,
                textContent: '',
                className: '',
                style: {},
                classList: {
                    classes: new Set(),
                    add(name) { this.classes.add(name); },
                    remove(name) { this.classes.delete(name); },
                    contains(name) { return this.classes.has(name); }
                },
                querySelector: () => null,
                querySelectorAll: () => []
            });
        }
        return elements.get(id);
    };
    const sandbox = {
        console,
        window: {},
        document: {
            getElementById: getElement,
            querySelector: selector => {
                const map = {
                    '.status-ring': 'status-ring',
                    '.status-text': 'status-text',
                    '.status-subtext': 'status-subtext',
                    '.status-icon i': 'status-icon-i',
                    '#btn-break .btn-label': 'break-label',
                    '#btn-after-break .btn-label': 'after-break-label'
                };
                return map[selector] ? getElement(map[selector]) : null;
            }
        },
        auth: {
            getCurrentUser: () => ({ id: 'KRY001', shift: 'Pagi' })
        },
        dateTime: {
            getLocalDate: () => '2026-05-24',
            formatTime: () => '08.05',
            ...(overrides.dateTime || {})
        },
        storage: {
            get: (key, fallback = null) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback,
            set: (key, value) => {
                store[key] = value;
                return true;
            },
            remove: key => {
                delete store[key];
                return true;
            }
        },
        toast: {
            success: () => {},
            info: () => {},
            error: () => {}
        },
        api: overrides.api || {
            getAllAttendance: async () => ({ success: true, data: [] })
        }
    };

    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(absensiJs, sandbox);
    return { absensi: sandbox.window.absensi, store, elements };
}

async function testAttendanceUiUpdatesBeforeBackendSaveResolves() {
    let updateCalls = 0;
    let timelineCalls = 0;
    let saveResolved = false;
    let resolveSave;
    const { absensi } = createAbsensiHarness();

    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');
    absensi.updateUI = () => { updateCalls += 1; };
    absensi.renderTimeline = () => { timelineCalls += 1; };
    absensi.loadAttendanceHistory = async () => {};
    absensi.saveAttendance = () => new Promise(resolve => {
        resolveSave = () => {
            saveResolved = true;
            resolve();
        };
    });

    const processPromise = absensi.processWithVerification('clock-in', {
        timestamp: '2026-05-24T01:05:00.000Z',
        location: { latitude: -7.1, longitude: 108.2, accuracy: 20 },
        photo: 'data:image/jpeg;base64,test'
    });

    await Promise.resolve();

    assert.strictEqual(saveResolved, false, 'save should still be pending during optimistic UI check');
    assert.strictEqual(absensi.attendanceData.clockIn, '08.05', 'clock-in time should be applied immediately');
    assert(updateCalls > 0, 'attendance UI should update before backend save resolves');
    assert(timelineCalls > 0, 'attendance timeline should render before backend save resolves');

    resolveSave();
    await processPromise;
}

async function testAttendanceTimeUsesVerificationTimestamp() {
    const { absensi } = createAbsensiHarness({
        dateTime: {
            formatTime: date => {
                const parsed = new Date(date);
                if (Number.isNaN(parsed.getTime())) return '';
                return parsed.toISOString().slice(11, 16);
            }
        }
    });

    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');
    absensi.updateUI = () => {};
    absensi.renderTimeline = () => {};
    absensi.renderHistory = () => {};
    absensi.loadAttendanceHistory = async () => {};
    absensi.saveAttendance = async () => {};

    await absensi.processWithVerification('clock-in', {
        timestamp: '2026-05-24T01:05:00.000Z',
        location: { latitude: -7.1, longitude: 108.2, accuracy: 20 },
        photo: 'data:image/jpeg;base64,test'
    });

    assert.strictEqual(absensi.attendanceData.clockIn, '01:05', 'clock-in time should come from the verified timestamp');
}

async function testBreak2VerificationEvidenceIsStoredInDedicatedFields() {
    const { absensi } = createAbsensiHarness({
        dateTime: {
            formatTime: () => '15:00'
        }
    });

    absensi.attendanceData = absensi.normalizeAttendance({
        ...absensi.getDefaultAttendance('KRY001'),
        clockIn: '08:00',
        breakStart: '12:00',
        breakEnd: '12:30'
    });
    absensi.updateUI = () => {};
    absensi.renderTimeline = () => {};
    absensi.renderHistory = () => {};
    absensi.loadAttendanceHistory = async () => {};
    absensi.saveAttendance = async () => {};

    await absensi.processWithVerification('break-2', {
        timestamp: '2026-05-24T08:00:00.000Z',
        location: { latitude: -7.12, longitude: 108.22, accuracy: 12 },
        photo: 'data:image/jpeg;base64,break2'
    });

    assert.strictEqual(absensi.attendanceData.break2StartPhoto, 'data:image/jpeg;base64,break2');
    assert.strictEqual(absensi.attendanceData.break2StartLocation, JSON.stringify({ latitude: -7.12, longitude: 108.22, accuracy: 12 }));
    assert.strictEqual(absensi.attendanceData.break2StartTimestamp, '2026-05-24T08:00:00.000Z');
}

async function testSavePayloadKeepsPhotosOutOfAttendanceLogs() {
    let savedPayload;
    const { absensi } = createAbsensiHarness({
        api: {
            saveAttendance: async payload => {
                savedPayload = payload;
                return { success: true, data: payload };
            },
            getAllAttendance: async () => ({ success: true, data: [] })
        }
    });

    absensi.attendanceData = absensi.normalizeAttendance({
        ...absensi.getDefaultAttendance('KRY001'),
        clockIn: '08:00',
        breakStart: '12:00',
        breakEnd: '12:30',
        break2Start: '16:03',
        break2End: '16:31'
    });
    absensi.updateUI = () => {};
    absensi.renderTimeline = () => {};
    absensi.renderHistory = () => {};
    absensi.loadAttendanceHistory = async () => {};

    await absensi.processWithVerification('clock-out', {
        timestamp: '2026-05-24T11:02:00.000Z',
        location: { latitude: -6.681, longitude: 107.555, accuracy: 30 },
        photo: 'data:image/jpeg;base64,clockout'
    });

    const logs = JSON.parse(savedPayload.attendanceLogs);
    assert.strictEqual(logs[0].photo, undefined, 'large proof photos should be stored in dedicated fields, not attendanceLogs');
    assert.strictEqual(logs[0].location, undefined, 'locations should be stored in dedicated fields, not attendanceLogs');
    assert.strictEqual(savedPayload.clockOutPhoto, 'data:image/jpeg;base64,clockout');
    assert.strictEqual(savedPayload.clockOutLocation, JSON.stringify({ latitude: -6.681, longitude: 107.555, accuracy: 30 }));
}

async function testStaleHistoryFetchCannotReplaceFreshLocalHistory() {
    let resolveFetch;
    const renderedHistories = [];
    const { absensi, store } = createAbsensiHarness({
        store: {
            attendance: [
                { userId: 'KRY001', date: '2026-05-24', shift: 'Pagi', clockIn: '08.05', status: 'ontime' }
            ]
        },
        api: {
            getAllAttendance: () => new Promise(resolve => {
                resolveFetch = resolve;
            })
        }
    });

    absensi.renderHistory = rows => {
        renderedHistories.push((rows || []).map(row => row.clockIn || '').join(','));
    };

    const pendingHistoryLoad = absensi.loadAttendanceHistory();
    assert.strictEqual(renderedHistories.at(-1), '08.05', 'cached local history should render immediately');

    absensi.localMutationVersion += 1;
    store.attendance = [
        { userId: 'KRY001', date: '2026-05-24', shift: 'Pagi', clockIn: '08.05', status: 'ontime' }
    ];
    resolveFetch({ success: true, data: [] });
    await pendingHistoryLoad;

    assert.strictEqual(renderedHistories.at(-1), '08.05', 'stale remote history must not replace fresh local history');
}

function testAttendanceHistoryUsesMonthFilterControl() {
    assert(indexHtml.includes('id="attendance-history-month"'), 'attendance history should expose a month filter');
    assert(indexHtml.includes('type="month"'), 'attendance history filter should use a native month input');
    assert(indexHtml.includes('class="employee-date-input jurnal-date-filter attendance-history-month"'), 'attendance history month filter should reuse the polished calendar icon style');
    assert(absensiJs.includes('selectedHistoryMonth'), 'absensi should keep selected attendance history month state');
    assert(absensiJs.includes('initHistoryMonthFilter()'), 'absensi init should bind the attendance history month filter');
    assert(absensiJs.includes('getFilteredHistoryData(historyData = this.attendanceHistoryData)'), 'absensi should filter history data by selected month');
    assert(absensiJs.includes('this.renderHistory(this.attendanceHistoryData);'), 'changing month should rerender already loaded history data immediately');
}

async function testIncompleteServerSaveCannotClearCompletedSecondBreak() {
    const { absensi } = createAbsensiHarness({
        api: {
            saveAttendance: async () => ({
                success: true,
                data: {
                    userId: 'KRY001',
                    date: '2026-05-24',
                    shift: 'Pagi',
                    clockIn: '08.00',
                    breakStart: '12.00',
                    breakEnd: '12.30',
                    break2Start: '',
                    break2End: '',
                    clockOut: ''
                }
            })
        }
    });

    absensi.attendanceData = absensi.normalizeAttendance({
        userId: 'KRY001',
        date: '2026-05-24',
        shift: 'Pagi',
        clockIn: '08.00',
        breakStart: '12.00',
        breakEnd: '12.30',
        break2Start: '15.00',
        break2End: '15.15',
        attendanceLogs: [
            { action: 'break-2', photo: 'photo-break-2' },
            { action: 'after-break-2', photo: 'photo-after-break-2' }
        ]
    });

    await absensi.saveAttendance();

    assert.strictEqual(absensi.attendanceData.break2Start, '15.00', 'incomplete server save must not clear break 2 start');
    assert.strictEqual(absensi.attendanceData.break2End, '15.15', 'incomplete server save must not clear break 2 end');
assert.strictEqual(absensi.attendanceData.attendanceLogs.length, 2, 'incomplete server save must preserve local verification logs');
}

function testFaceCaptureUsesSmallCompressedProofPhoto() {
    assert(faceRecognitionJs.includes('maxCaptureDimension'), 'face recognition should define a proof photo size limit');
    assert(faceRecognitionJs.includes('maxCaptureDimension: 440'), 'face recognition should keep proof photos clearer');
    assert(faceRecognitionJs.includes('maxPhotoDataLength: 42000'), 'face recognition should keep proof photos under backend limits');
    assert(faceRecognitionJs.includes('compressCanvasPhoto()'), 'face recognition should use adaptive proof photo compression');
    assert(faceRecognitionJs.includes('while (photo.length > this.maxPhotoDataLength'), 'face recognition should keep shrinking photos until payload is safe');
}

function testLocationRefreshButtonExistsAndIsBound() {
    assert(indexHtml.includes('id="btn-refresh-location"'), 'face recognition page should include refresh location button');
    assert(indexHtml.includes('Refresh Lokasi'), 'refresh location button should have clear label');
    assert(faceRecognitionJs.includes('refreshLocation()'), 'face recognition should expose refresh location behavior');
    assert(faceRecognitionJs.includes("getElementById('btn-refresh-location')"), 'refresh location button should be bound in JS');
}

function testLocationRefreshButtonHasStableLayout() {
    const faceCss = fs.readFileSync(path.join(root, 'css', 'face-rec.css'), 'utf8');

    assert(
        /\.location-actions\s*\{[^}]*padding:\s*var\(--spacing-lg\)\s+var\(--spacing-md\)\s+var\(--spacing-xs\);/s.test(faceCss),
        'location refresh action area should sit lower from the map while keeping a compact gap to coordinates'
    );
    assert(
        /\.location-info\s*\{[^}]*padding:\s*var\(--spacing-xs\)\s+var\(--spacing-md\)\s+var\(--spacing-md\);/s.test(faceCss),
        'location info should start close to the refresh button'
    );
    assert(
        /\.btn-refresh-location\s*\{[^}]*box-sizing:\s*border-box;/s.test(faceCss),
        'location refresh button should include border in its stable height'
    );
    assert(
        /\.btn-refresh-location\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border-color\);/s.test(faceCss),
        'location refresh button should use a neutral gray border by default'
    );
    assert(
        /\.btn-refresh-location\s*\{[^}]*background:\s*var\(--color-white\);/s.test(faceCss),
        'location refresh button should use a flat white background'
    );
    assert(
        /\.btn-refresh-location\s*\{[^}]*color:\s*var\(--color-primary\);/s.test(faceCss),
        'location refresh button label should be blue by default'
    );
    assert(
        !/\.btn-refresh-location\s*\{[^}]*box-shadow:/s.test(faceCss),
        'location refresh button should not use a shadow'
    );
    assert(
        !/\.btn-refresh-location\s*\{[^}]*linear-gradient/s.test(faceCss),
        'location refresh button should not use a gradient'
    );
    assert(
        /\.btn-refresh-location:hover,\s*\.btn-refresh-location:active\s*\{[^}]*background:\s*var\(--color-primary\);/s.test(faceCss),
        'location refresh button hover/active should use a blue fill'
    );
    assert(
        /\.btn-refresh-location:hover,\s*\.btn-refresh-location:active\s*\{[^}]*border-color:\s*var\(--color-primary\);/s.test(faceCss),
        'location refresh button hover/active should keep the blue border visible'
    );
    assert(
        /\.btn-refresh-location:hover,\s*\.btn-refresh-location:active\s*\{[^}]*color:\s*var\(--color-white\);/s.test(faceCss),
        'location refresh button hover/active should use white text'
    );
    assert(
        /\.btn-refresh-location:focus:not\(:hover\)\s*\{[^}]*background:\s*var\(--color-white\);/s.test(faceCss),
        'location refresh button should return to white after click focus only when it is not hovered'
    );
    assert(
        /\.btn-refresh-location\s+span\s*\{[^}]*white-space:\s*nowrap;/s.test(faceCss),
        'location refresh button label should stay on one line'
    );
    assert(
        /\.btn-refresh-location\s+i\s*\{[^}]*flex:\s*0\s+0\s+auto;/s.test(faceCss),
        'location refresh button icon should not be squeezed during first render'
    );
    assert(
        faceRecognitionJs.includes("classList.remove('location-map--empty')") &&
            faceRecognitionJs.includes("classList.add('location-map--empty')"),
        'location map should mark the permission fallback state with a stable class'
    );
    assert(
        /\.location-map--empty\s*\{[^}]*border-bottom:\s*1px\s+solid\s+var\(--border-color\);/s.test(faceCss),
        'location permission fallback should have a clean lower border before the action area'
    );
    assert(
        /\.location-map--empty\s*\+\s*\.location-actions\s*\{[^}]*background:\s*var\(--color-white\);/s.test(faceCss),
        'location permission fallback actions should sit on a clean white surface'
    );
}

function testLocationTimeHasIndependentLiveClock() {
    assert(faceRecognitionJs.includes('locationTimeInterval'), 'face recognition should track a live location clock interval');
    assert(faceRecognitionJs.includes('startLocationClock()'), 'face recognition should start a live location clock');
    assert(faceRecognitionJs.includes('stopLocationClock()'), 'face recognition should stop the live location clock during cleanup');
}

function testVerifiedLocationUsesProfessionalGreenStatus() {
    const faceCss = fs.readFileSync(path.join(root, 'css', 'face-rec.css'), 'utf8');

    assert(faceRecognitionJs.includes('Lokasi terverifikasi akurat'), 'verified GPS status should use professional success copy');
    assert(faceRecognitionJs.includes('location-ready'), 'verified GPS status should apply a dedicated success class');
    assert(faceCss.includes('.info-value.location-ready'), 'verified GPS status should have a green style');
    assert(faceCss.includes('var(--color-success)'), 'verified GPS status should use the success color token');
}

function testLocationMapUsesSingleSatelliteEmbed() {
    const faceCss = fs.readFileSync(path.join(root, 'css', 'face-rec.css'), 'utf8');

    assert(faceRecognitionJs.includes('maps.google.com/maps'), 'location map should use Google Maps embed');
    assert(faceRecognitionJs.includes('&t=k'), 'location map should request satellite imagery');
    assert(faceRecognitionJs.includes('map-satellite-frame'), 'location map should render a satellite iframe');
    assert(!faceRecognitionJs.includes('class="map-marker"'), 'location map should rely on the Google Maps marker only');
    assert(!faceRecognitionJs.includes('class="map-accuracy-ring"'), 'location map should not overlay a competing blue accuracy point');
    assert(!faceRecognitionJs.includes('map-layer-controls'), 'location map should not render multiple layer controls');
    assert(faceCss.includes('.map-satellite-frame'), 'location map should style the satellite iframe');
    assert(/\.map-satellite-frame\s*\{[^}]*pointer-events:\s*none;/s.test(faceCss), 'satellite iframe should be non-interactive to avoid desktop Ctrl zoom prompts');
    assert(faceCss.includes('.map-static-fallback'), 'location map should keep a visual fallback');
}

function testAttendanceDurationAlwaysDisplaysShortWorkDurations() {
    const { absensi } = createAbsensiHarness();

    assert.strictEqual(
        absensi.calculateAttendanceDuration('08.00', '08.01'),
        '0j 1m',
        'one minute attendance duration should be displayed'
    );
    assert.strictEqual(
        absensi.calculateAttendanceDuration('08.00', '08.00'),
        '0j 0m',
        'zero minute attendance duration should still be displayed'
    );
}

function testAttendanceButtonsUseActionColorEffects() {
    const absensiCss = fs.readFileSync(path.join(root, 'css', 'absensi.css'), 'utf8');

    assert(
        /\.attendance-btn:hover:not\(:disabled\)\s*\{[^}]*border-color:\s*var\(--attendance-action-color\);/s.test(absensiCss),
        'attendance button hover border should follow the action icon color'
    );
    assert(
        /\.attendance-btn\.active\s*\{[^}]*background:\s*var\(--attendance-action-bg\);[^}]*border-color:\s*var\(--attendance-action-color\);/s.test(absensiCss),
        'active attendance button should follow the action color'
    );
    assert(
        /\.attendance-btn\.completed\s*\{[^}]*background:\s*var\(--attendance-action-bg\);[^}]*border-color:\s*var\(--attendance-action-color\);/s.test(absensiCss),
        'completed attendance button should follow the action color'
    );
    assert(
        /\.clock-in-btn\s*\{[^}]*--attendance-action-color:\s*var\(--color-success\);/s.test(absensiCss),
        'clock-in effect should be green'
    );
    assert(
        /\.break-btn\s*\{[^}]*--attendance-action-color:\s*var\(--color-info\);/s.test(absensiCss),
        'break effect should be blue'
    );
    assert(
        /\.after-break-btn\s*\{[^}]*--attendance-action-color:\s*var\(--color-info\);/s.test(absensiCss),
        'after-break effect should stay blue as part of break flow'
    );
    assert(
        /\.overtime-btn\s*\{[^}]*--attendance-action-color:\s*var\(--color-secondary\);/s.test(absensiCss),
        'overtime effect should be dark'
    );
    assert(
        /\.clock-out-btn\s*\{[^}]*--attendance-action-color:\s*var\(--color-danger\);/s.test(absensiCss),
        'clock-out effect should be red'
    );
}

function testAttendancePageDoesNotAutoStartVerification() {
    assert(
        absensiJs.includes('clearPendingAttendanceAction()'),
        'opening attendance page should clear stale pending verification actions'
    );
    assert(
        absensiJs.includes("storage.remove('pending_attendance_action')"),
        'attendance page should remove pending_attendance_action before waiting for a real button click'
    );
    assert(
        absensiJs.includes('bindAttendanceButton('),
        'attendance buttons should be bound through a single safe helper'
    );
    assert(
        !/btnClockIn\.addEventListener\('touchend'/.test(absensiJs),
        'attendance buttons should not use separate touchend handlers that can fire from mobile navigation taps'
    );
    assert(
        absensiJs.includes('button.onclick ='),
        'attendance button binding should replace old handlers instead of stacking listeners on every page init'
    );
}

function testClockOutAvailableImmediatelyAfterClockIn() {
    const { absensi, elements } = createAbsensiHarness();

    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        elements.get(id);
    });

    absensi.attendanceData = absensi.normalizeAttendance({
        ...absensi.getDefaultAttendance('KRY001'),
        shift: 'Pagi',
        clockIn: '09:00',
        breakStart: null,
        breakEnd: null,
        break2Start: null,
        break2End: null,
        clockOut: null
    });
    absensi.currentState = 'clocked-in';
    absensi.updateUI();

    assert.strictEqual(elements.get('btn-clock-out').disabled, false, 'clock out should be available right after clock in even before break attendance');
}

function testClockOutAvailableWhileBreakIsOpen() {
    const { absensi, elements } = createAbsensiHarness();

    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        elements.get(id);
    });

    absensi.attendanceData = absensi.normalizeAttendance({
        ...absensi.getDefaultAttendance('KRY001'),
        shift: 'Malam',
        clockIn: '21:00',
        breakStart: '22:00',
        breakEnd: null,
        clockOut: null
    });
    absensi.currentState = 'on-break';
    absensi.updateUI();

    assert.strictEqual(elements.get('btn-clock-out').disabled, false, 'clock out should stay available even if employee forgot to end break');
}

async function testApprovedLeaveLocksEmployeeAttendanceButtons() {
    const { absensi, elements } = createAbsensiHarness({
        dateTime: {
            getLocalDate: () => '2026-05-24'
        },
        api: {
            batch: async () => ({
                success: true,
                data: {
                    todayAttendance: {
                        success: true,
                        data: { userId: 'KRY001', date: '2026-05-24', shift: 'Pagi', status: 'waiting' }
                    },
                    leaves: {
                        success: true,
                        data: [{
                            userId: 'KRY001',
                            type: 'annual',
                            typeLabel: 'Cuti Tahunan',
                            startDate: '2026-05-24',
                            endDate: '2026-05-26',
                            status: 'approved'
                        }]
                    },
                    izin: { success: true, data: [] },
                    settings: { success: true, data: {} },
                    shifts: { success: true, data: [] }
                }
            }),
            getAllAttendance: async () => ({ success: true, data: [] })
        }
    });

    elements.set('status-icon-i', { className: '' });
    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        elements.get(id);
    });

    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');
    absensi.renderTimeline = () => {};
    absensi.loadAttendanceHistory = async () => {};

    await absensi.fetchTodayAttendance();

    assert.strictEqual(absensi.currentState, 'on-leave', 'approved leave should put attendance in leave lock state');
    assert.strictEqual(elements.get('status-text').textContent, 'Sedang Cuti Tahunan', 'status should explain the approved leave type');
    assert.strictEqual(elements.get('status-subtext').textContent, '24/05/2026 - 26/05/2026', 'status should show leave date range');
    assert.strictEqual(elements.get('status-icon-i').className, 'fas fa-umbrella-beach', 'approved annual leave should use leave icon while keeping the same ring animation');
    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        assert.strictEqual(elements.get(id).disabled, true, `${id} should be disabled during approved leave`);
    });
}

async function testConfiguredHolidayLocksEmployeeAttendanceButtons() {
    const { absensi, elements } = createAbsensiHarness({
        dateTime: {
            getLocalDate: () => '2026-05-24'
        },
        api: {
            batch: async () => ({
                success: true,
                data: {
                    todayAttendance: {
                        success: true,
                        data: {}
                    },
                    leaves: { success: true, data: [] },
                    izin: { success: true, data: [] },
                    settings: {
                        success: true,
                        data: {
                            working_days: JSON.stringify({
                                senin: true,
                                selasa: true,
                                rabu: true,
                                kamis: true,
                                jumat: true,
                                sabtu: false,
                                minggu: false
                            })
                        }
                    },
                    shifts: { success: true, data: [] }
                }
            }),
            getAllAttendance: async () => ({ success: true, data: [] })
        }
    });

    elements.set('status-icon-i', { className: '' });
    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        elements.get(id);
    });

    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');
    absensi.renderTimeline = () => {};
    absensi.loadAttendanceHistory = async () => {};

    await absensi.fetchTodayAttendance();

    assert.strictEqual(absensi.currentState, 'libur', 'configured holiday should put attendance in holiday lock state');
    assert.strictEqual(elements.get('status-text').textContent, 'Hari Libur', 'holiday status should explain the locked state');
    assert.strictEqual(elements.get('status-subtext').textContent, 'Anda tidak memiliki jadwal kerja hari ini.', 'holiday status should explain why attendance is locked');
    assert.strictEqual(elements.get('status-icon-i').className, 'fas fa-calendar-times', 'holiday lock should use a holiday calendar icon');
    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        assert.strictEqual(elements.get(id).disabled, true, `${id} should be disabled on configured holiday`);
    });
}

async function testShiftScheduleOverridesConfiguredHoliday() {
    const store = {
        shift_schedule: {
            '2026-4': {
                KRY001: {
                    24: 'Pagi'
                }
            }
        }
    };
    const { absensi, elements } = createAbsensiHarness({
        store,
        dateTime: {
            getLocalDate: () => '2026-05-24'
        },
        api: {
            batch: async () => ({
                success: true,
                data: {
                    todayAttendance: {
                        success: true,
                        data: {}
                    },
                    leaves: { success: true, data: [] },
                    izin: { success: true, data: [] },
                    settings: {
                        success: true,
                        data: {
                            working_days: JSON.stringify({
                                senin: true,
                                selasa: true,
                                rabu: true,
                                kamis: true,
                                jumat: true,
                                sabtu: false,
                                minggu: false
                            }),
                            'shift_schedule_2026-4': JSON.stringify({
                                KRY001: {
                                    24: 'Pagi'
                                }
                            })
                        }
                    },
                    shifts: { success: true, data: [] }
                }
            }),
            getAllAttendance: async () => ({ success: true, data: [] })
        }
    });

    ['btn-clock-in', 'btn-break', 'btn-after-break', 'btn-break-2', 'btn-after-break-2', 'btn-overtime', 'btn-clock-out'].forEach(id => {
        elements.get(id);
    });

    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');
    absensi.renderTimeline = () => {};
    absensi.loadAttendanceHistory = async () => {};

    await absensi.fetchTodayAttendance();

    assert.strictEqual(absensi.currentState, 'waiting', 'assigned shift should override a default holiday');
    assert.strictEqual(absensi.attendanceData.shift, 'Pagi', 'attendance should use the shift assigned by admin schedule');
    assert.strictEqual(elements.get('btn-clock-in').disabled, false, 'clock in should stay available when admin assigns a shift on a holiday');
}

function testAttendanceLeaveLockIconMatchesPermissionType() {
    const { absensi } = createAbsensiHarness();

    assert.strictEqual(absensi.getAttendanceLeaveIcon({ source: 'izin', label: 'Sakit' }), 'fas fa-notes-medical');
    assert.strictEqual(absensi.getAttendanceLeaveIcon({ source: 'izin', label: 'Izin' }), 'fas fa-user-clock');
    assert.strictEqual(absensi.getAttendanceLeaveIcon({ source: 'cuti', label: 'Cuti Tahunan' }), 'fas fa-umbrella-beach');
}

function testMobileAttendanceStatusDoesNotClipPulseAnimation() {
    assert(
        /\.attendance-status\s*\{[^}]*overflow:\s*visible;/s.test(mobileCss),
        'mobile attendance status should allow the pulsing status ring to render without clipping'
    );
    assert(
        /\.attendance-status\s+\.status-ring\s*\{[^}]*width:\s*82px;[^}]*height:\s*82px;/s.test(mobileCss),
        'mobile status ring should use compact stable dimensions'
    );
    assert(
        /\.attendance-status\s+\.status-icon\s*\{[^}]*width:\s*50px;[^}]*height:\s*50px;/s.test(mobileCss),
        'mobile status icon should be compact inside the ring'
    );
}

(async () => {
    await testAttendanceUiUpdatesBeforeBackendSaveResolves();
    await testAttendanceTimeUsesVerificationTimestamp();
    await testBreak2VerificationEvidenceIsStoredInDedicatedFields();
    await testSavePayloadKeepsPhotosOutOfAttendanceLogs();
    await testStaleHistoryFetchCannotReplaceFreshLocalHistory();
    testAttendanceHistoryUsesMonthFilterControl();
    await testIncompleteServerSaveCannotClearCompletedSecondBreak();
    testFaceCaptureUsesSmallCompressedProofPhoto();
    testLocationRefreshButtonExistsAndIsBound();
    testLocationRefreshButtonHasStableLayout();
    testLocationTimeHasIndependentLiveClock();
    testVerifiedLocationUsesProfessionalGreenStatus();
    testLocationMapUsesSingleSatelliteEmbed();
    testAttendanceDurationAlwaysDisplaysShortWorkDurations();
    testAttendanceButtonsUseActionColorEffects();
    testAttendancePageDoesNotAutoStartVerification();
    testClockOutAvailableImmediatelyAfterClockIn();
    testClockOutAvailableWhileBreakIsOpen();
    await testApprovedLeaveLocksEmployeeAttendanceButtons();
    await testConfiguredHolidayLocksEmployeeAttendanceButtons();
    await testShiftScheduleOverridesConfiguredHoliday();
    testAttendanceLeaveLockIconMatchesPermissionType();
    testMobileAttendanceStatusDoesNotClipPulseAnimation();
    console.log('absensi responsive update tests passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
