const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const absensiJs = fs.readFileSync(path.join(root, 'js', 'absensi.js'), 'utf8');
const attendanceBackendJs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Attendance.js'), 'utf8');

function createHarness(shifts) {
    const elements = new Map();
    const getElement = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                disabled: false,
                textContent: '',
                className: '',
                style: {},
                classList: {
                    values: new Set(),
                    add(value) { this.values.add(value); },
                    remove(value) { this.values.delete(value); }
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
            querySelector(selector) {
                const selectors = {
                    '.status-ring': 'status-ring',
                    '.status-icon i': 'status-icon-i',
                    '.status-text': 'status-text',
                    '.status-subtext': 'status-subtext',
                    '#btn-break .btn-label': 'break-label',
                    '#btn-after-break .btn-label': 'after-break-label'
                };
                return selectors[selector] ? getElement(selectors[selector]) : null;
            }
        },
        auth: { getCurrentUser: () => ({ id: 'KRY001', shift: 'Pagi' }) },
        dateTime: {
            getLocalDate: () => '2026-07-09',
            formatTime: date => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        },
        storage: {
            get(key, fallback) {
                return key === 'shifts' ? shifts : fallback;
            },
            set() {},
            remove() {}
        },
        toast: { success() {}, info() {}, error() {} },
        api: { getAllAttendance: async () => ({ success: true, data: [] }) }
    };

    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(absensiJs, sandbox);
    return { absensi: sandbox.absensi, elements };
}

function prepareButtons(elements) {
    [
        'btn-clock-in',
        'btn-break',
        'btn-after-break',
        'btn-break-2',
        'btn-after-break-2',
        'btn-overtime',
        'btn-clock-out'
    ].forEach(id => elements.get(id));
}

function testRegularShiftWindow() {
    const { absensi } = createHarness([{ name: 'Pagi', startTime: '08:00', endTime: '17:00' }]);
    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');

    assert.strictEqual(absensi.getClockInWindowStatus(new Date(2026, 6, 9, 10, 0)).allowed, true);
    assert.strictEqual(absensi.getClockInWindowStatus(new Date(2026, 6, 9, 21, 0)).allowed, false);
}

function testOvernightShiftWindow() {
    const { absensi } = createHarness([{ name: 'Malam', startTime: '20:00', endTime: '05:00' }]);
    absensi.attendanceData = { ...absensi.getDefaultAttendance('KRY001'), shift: 'Malam' };

    assert.strictEqual(absensi.getClockInWindowStatus(new Date(2026, 6, 9, 22, 0)).allowed, true);
    assert.strictEqual(absensi.getClockInWindowStatus(new Date(2026, 6, 10, 2, 0)).allowed, true);
    assert.strictEqual(absensi.getClockInWindowStatus(new Date(2026, 6, 9, 12, 0)).allowed, false);
}

function testMissingShiftConfigurationFailsOpen() {
    const { absensi } = createHarness([]);
    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');

    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(absensi.getClockInWindowStatus(new Date(2026, 6, 9, 23, 0)))),
        { configured: false, allowed: true, shiftName: 'Pagi', startTime: '', endTime: '' }
    );
}

function testOutsideWindowUsesLockedStatusAndOnlyClockInIsTimeLocked() {
    const { absensi, elements } = createHarness([{ name: 'Pagi', startTime: '08:00', endTime: '17:00' }]);
    prepareButtons(elements);
    absensi.attendanceData = absensi.getDefaultAttendance('KRY001');
    absensi.getClockInWindowStatus = () => ({
        configured: true,
        allowed: false,
        shiftName: 'Pagi',
        startTime: '08:00',
        endTime: '17:00'
    });

    absensi.setCurrentState();
    absensi.updateUI();

    assert.strictEqual(absensi.currentState, 'outside-shift-window');
    assert.strictEqual(elements.get('status-text').textContent, 'Di Luar Jam Shift');
    assert.strictEqual(elements.get('status-subtext').textContent, 'Shift Pagi: 08:00 - 17:00');
    assert.strictEqual(elements.get('status-icon-i').className, 'fas fa-clock');
    assert.strictEqual(elements.get('btn-clock-in').disabled, true);
    assert.strictEqual(elements.get('btn-clock-out').disabled, true, 'clock out still requires clock in');

    absensi.attendanceData.clockIn = '08:05';
    absensi.setCurrentState();
    absensi.updateUI();
    assert.strictEqual(absensi.currentState, 'clocked-in', 'time gate must not lock later attendance actions');
    assert.strictEqual(elements.get('btn-clock-out').disabled, false, 'clock out is available after clock in');
}

function createBackendHarness(shifts) {
    const sandbox = {
        console,
        getAllRows(sheetName) {
            return sheetName === 'Shifts' ? shifts : [];
        },
        Utilities: {
            formatDate(date, timezone, format) {
                assert.strictEqual(timezone, 'Asia/Jakarta');
                if (format === 'HH:mm') {
                    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                }
                return '';
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(attendanceBackendJs, sandbox);
    return sandbox;
}

function testBackendRejectsOnlyFirstClockInOutsideShiftWindow() {
    const backend = createBackendHarness([{ name: 'Pagi', startTime: '08:00', endTime: '17:00' }]);
    const firstClockIn = { userId: 'KRY001', shift: 'Pagi', clockIn: '21:00' };

    const rejected = backend.validateAttendanceClockInShiftWindow(
        firstClockIn,
        null,
        new Date(2026, 6, 9, 21, 0)
    );
    assert.strictEqual(rejected.success, false);
    assert.match(rejected.error, /Shift Pagi.*08:00.*17:00/);

    const laterClockOut = backend.validateAttendanceClockInShiftWindow(
        { ...firstClockIn, clockOut: '21:05' },
        { userId: 'KRY001', clockIn: '08:05' },
        new Date(2026, 6, 9, 21, 5)
    );
    assert.strictEqual(laterClockOut.success, true, 'later actions must remain available after clock in');
}

testRegularShiftWindow();
testOvernightShiftWindow();
testMissingShiftConfigurationFailsOpen();
testOutsideWindowUsesLockedStatusAndOnlyClockInIsTimeLocked();
testBackendRejectsOnlyFirstClockInOutsideShiftWindow();
console.log('attendance shift window tests passed');
