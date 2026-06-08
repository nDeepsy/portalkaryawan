const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElementMock(id) {
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        src: '',
        disabled: false,
        style: {},
        classList: {
            add() {},
            remove() {}
        },
        addEventListener() {},
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        scrollIntoView() {},
        focus() {}
    };
}

function createFormMock(elements) {
    const submitBtn = createElementMock('jurnal-submit');
    elements.set('jurnal-submit', submitBtn);
    const textareaIds = ['jurnal-tasks', 'jurnal-achievements', 'jurnal-obstacles', 'jurnal-plan'];
    const inputIds = ['jurnal-photo'];
    [...textareaIds, ...inputIds].forEach(id => {
        if (!elements.has(id)) elements.set(id, createElementMock(id));
    });

    return {
        id: 'jurnal-form',
        style: {},
        addEventListener() {},
        querySelector(selector) {
            return selector === 'button[type="submit"]' ? submitBtn : null;
        },
        querySelectorAll(selector) {
            if (selector === 'textarea') return textareaIds.map(id => elements.get(id));
            if (selector === 'input') return inputIds.map(id => elements.get(id));
            return [];
        }
    };
}

function loadJurnal({ currentUser, api = {}, storageSeed = {}, toastOverrides = {}, consoleOverrides = {} } = {}) {
    const elements = new Map();
    const summaryValues = [createElementMock('summary-filled'), createElementMock('summary-missing'), createElementMock('summary-streak')];
    const storageData = new Map(Object.entries(storageSeed));
    let user = currentUser || { id: 'KRY001', email: 'a@example.test', role: 'karyawan' };

    const documentMock = {
        addEventListener() {},
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElementMock(id));
            return elements.get(id);
        },
        querySelector(selector) {
            if (selector === '.jurnal-form-card .card-header h3') {
                return this.getElementById('jurnal-form-title');
            }
            return createElementMock(selector);
        },
        querySelectorAll(selector) {
            if (selector === '#page-jurnal .summary-value') return summaryValues;
            return [];
        }
    };

    const context = {
        console: {
            ...console,
            ...consoleOverrides
        },
        window: {},
        document: documentMock,
        Image: function Image() {},
        FileReader: function FileReader() {},
        setTimeout,
        storage: {
            get(key, defaultValue = null) {
                return storageData.has(key) ? storageData.get(key) : defaultValue;
            },
            set(key, value) {
                storageData.set(key, value);
            },
            remove(key) {
                storageData.delete(key);
            }
        },
        sessionStorage_manager: {
            set() {}
        },
        auth: {
            getCurrentUser: () => user,
            saveSession() {}
        },
        api: {
            getSettings: async () => ({ success: true, data: {} }),
            getEmployeeProfile: async () => ({ success: true, data: {} }),
            getJournals: async () => ({ success: true, data: [] }),
            getAttendance: async () => ({ success: true, data: [] }),
            saveJournal: async data => ({ success: true, data }),
            ...api
        },
        toast: {
            warning() {},
            error() {},
            success() {},
            ...toastOverrides
        },
        dateTime: {
            getLocalDate: () => '2026-05-27',
            formatDate: value => String(value),
            formatTime: value => String(value || ''),
            getCurrentTime: () => '17:00',
            getCurrentDate: () => '27 Mei 2026'
        },
        modal: {
            show() {},
            close() {}
        }
    };
    context.window.window = context.window;
    context.window.document = documentMock;
    context.window.setTimeout = setTimeout;

    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jurnal.js'), 'utf8');
    vm.runInNewContext(source, context, { filename: 'jurnal.js' });

    return {
        jurnal: context.window.jurnal,
        elements,
        summaryValues,
        storageData,
        setUser(nextUser) {
            user = nextUser;
        }
    };
}

function testTodayJournalIsHiddenUntilClockOut() {
    const { jurnal } = loadJurnal();
    jurnal.currentDate = jurnal.parseLocalDate('2026-05-27');

    assert.strictEqual(
        JSON.stringify(jurnal.getJournalHistoryItems().map(item => item.date)),
        JSON.stringify([]),
        'today should not appear as a fillable/missing journal before clock out'
    );

    jurnal.attendanceRecords = [
        { userId: 'KRY001', date: '2026-05-27', clockIn: '08:00', clockOut: '17:00' }
    ];

    assert.strictEqual(
        JSON.stringify(jurnal.getJournalHistoryItems().map(item => item.date)),
        JSON.stringify(['2026-05-27']),
        'today should appear once the employee has clocked out'
    );
}

async function testSwitchingUsersClearsPreviousJournalFormImmediately() {
    let resolveB;
    const { jurnal, elements, setUser } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' },
        api: {
            getJournals: async userId => ({
                success: true,
                data: userId === 'KRY001'
                    ? [{ userId: 'KRY001', date: '2026-05-27', tasks: 'Tugas akun A' }]
                    : await new Promise(resolve => {
                        resolveB = data => resolve(data);
                    })
            }),
            getAttendance: async userId => ({
                success: true,
                data: [{ userId, date: '2026-05-27', clockIn: '08:00', clockOut: '17:00' }]
            })
        }
    });

    jurnal.currentDate = jurnal.parseLocalDate('2026-05-27');
    await jurnal.init();
    assert.strictEqual(elements.get('jurnal-tasks').value, 'Tugas akun A');

    setUser({ id: 'KRY002', email: 'b@example.test', role: 'karyawan' });
    const initPromise = jurnal.init();

    assert.strictEqual(
        elements.get('jurnal-tasks').value,
        '',
        'form must not keep account A journal while account B data is loading'
    );

    resolveB([]);
    await initPromise;
}

async function testSuccessfulSubmitClearsJournalForm() {
    const { jurnal, elements } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' },
        api: {
            saveJournal: async data => ({ success: true, data })
        }
    });

    jurnal.currentDate = jurnal.parseLocalDate('2026-05-27');
    jurnal.attendanceRecords = [
        { userId: 'KRY001', date: '2026-05-27', clockIn: '08:00', clockOut: '17:00' }
    ];

    ['jurnal-tasks', 'jurnal-achievements', 'jurnal-obstacles', 'jurnal-plan'].forEach(id => {
        if (!elements.has(id)) elements.set(id, createElementMock(id));
    });

    elements.get('jurnal-tasks').value = 'Menyelesaikan laporan harian';
    elements.get('jurnal-achievements').value = 'Laporan selesai';
    elements.get('jurnal-obstacles').value = 'Tidak ada';
    elements.get('jurnal-plan').value = 'Follow up besok';
    jurnal.currentPhoto = 'data:image/jpeg;base64,test';

    await jurnal.handleSubmit({ preventDefault() {} });

    assert.strictEqual(elements.get('jurnal-tasks').value, '', 'tasks field should clear after successful submit');
    assert.strictEqual(elements.get('jurnal-achievements').value, '', 'achievements field should clear after successful submit');
    assert.strictEqual(elements.get('jurnal-obstacles').value, '', 'obstacles field should clear after successful submit');
    assert.strictEqual(elements.get('jurnal-plan').value, '', 'plan field should clear after successful submit');
    assert.strictEqual(jurnal.currentPhoto, null, 'photo state should clear after successful submit');
}

async function testFailedJournalSaveKeepsFormAndShowsError() {
    let successCount = 0;
    let errorCount = 0;
    const { jurnal, elements } = loadJurnal({
        api: {
            saveJournal: async () => ({ success: false, error: 'Server lambat' })
        },
        toastOverrides: {
            success() { successCount++; },
            error() { errorCount++; }
        },
        consoleOverrides: {
            error() {}
        }
    });
    jurnal.currentDate = jurnal.parseLocalDate('2026-05-27');
    jurnal.attendanceRecords = [
        { userId: 'KRY001', date: '2026-05-27', clockIn: '08:00', clockOut: '17:00' }
    ];
    jurnal.toast = null;

    ['jurnal-tasks', 'jurnal-achievements', 'jurnal-obstacles', 'jurnal-plan'].forEach(id => {
        if (!elements.has(id)) elements.set(id, createElementMock(id));
    });

    elements.get('jurnal-tasks').value = 'Tugas belum tersimpan';
    elements.get('jurnal-achievements').value = 'Menunggu server';
    elements.get('jurnal-obstacles').value = 'Apps Script lambat';
    elements.get('jurnal-plan').value = 'Coba lagi';

    await jurnal.handleSubmit({ preventDefault() {} });

    assert.strictEqual(successCount, 0, 'failed journal save should not show a success toast');
    assert.strictEqual(errorCount, 1, 'failed journal save should show an error toast');
    assert.strictEqual(elements.get('jurnal-tasks').value, 'Tugas belum tersimpan', 'tasks field should stay filled after failed submit');
    assert.strictEqual(elements.get('jurnal-achievements').value, 'Menunggu server', 'achievements field should stay filled after failed submit');
    assert.strictEqual(elements.get('jurnal-obstacles').value, 'Apps Script lambat', 'obstacles field should stay filled after failed submit');
    assert.strictEqual(elements.get('jurnal-plan').value, 'Coba lagi', 'plan field should stay filled after failed submit');
}

async function testJournalFormUsesFreshLocalClockOutBeforeStaleAttendanceApi() {
    const { jurnal, elements } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' },
        storageSeed: {
            attendance: [
                { userId: 'KRY001', date: '2026-05-27', clockIn: '08:00', clockOut: '17:00' }
            ]
        },
        api: {
            getAttendance: async () => ({ success: true, data: [] }),
            getJournals: async () => ({ success: true, data: [] })
        }
    });

    elements.set('jurnal-form', createFormMock(elements));
    jurnal.currentDate = jurnal.parseLocalDate('2026-05-27');

    await jurnal.init();

    assert(
        elements.get('jurnal-form-title').textContent.startsWith('Isi Jurnal'),
        'journal form title should switch to fill mode immediately from local clock-out cache'
    );
    assert.strictEqual(elements.get('jurnal-submit').disabled, false, 'journal submit should be available immediately from local clock-out cache');
    assert.strictEqual(elements.get('jurnal-tasks').disabled, false, 'journal fields should be editable immediately from local clock-out cache');
}

function testJournalHistoryUsesSummaryMonthFilterInsteadOfDuplicateControls() {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jurnal.js'), 'utf8');
    const jurnalCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'jurnal.css'), 'utf8');

    assert(!indexHtml.includes('id="jurnal-history-date"'), 'journal history should not expose a duplicate date filter');
    assert(indexHtml.includes('id="jurnal-summary-month"'), 'journal summary should expose the single month filter');
    assert(!indexHtml.includes('placeholder="Cari jurnal..."'), 'journal history should not show free-text search copy');
    assert(!indexHtml.includes('<option>Terbaru</option>'), 'journal history should not show newest sort dropdown');
    assert(!indexHtml.includes('<option>Terlama</option>'), 'journal history should not show oldest sort dropdown');
    assert(!source.includes("querySelector('.jurnal-history-card .jurnal-date-filter')"), 'journal script should not bind a duplicate date filter');
    assert(!source.includes("querySelector('.jurnal-history-card .select-filter')"), 'journal script should not bind the removed sort dropdown');
    assert(source.includes('this.renderJurnalList();'), 'journal summary month filter should refresh the history list');
    assert(source.includes('date.getMonth() === currentMonth && date.getFullYear() === currentYear'), 'journal history should follow the selected summary month');
    assert(/\.jurnal-date-filter\s*\{[^}]*background-image:\s*url\(/s.test(jurnalCss), 'journal date filter should have a calendar icon treatment');
    assert(/\.jurnal-date-filter\s*\{[^}]*border-radius:\s*var\(--border-radius\);/s.test(jurnalCss), 'journal date filter should use the polished control radius');
    assert(/\.jurnal-date-filter:hover\s*\{[^}]*border-color:\s*var\(--color-primary\);/s.test(jurnalCss), 'journal date filter should have a blue hover border');
}

function testJournalSummaryUsesMonthFilter() {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jurnal.js'), 'utf8');

    assert(indexHtml.includes('id="jurnal-summary-month"'), 'journal summary should expose a month filter');
    assert(indexHtml.includes('type="month"'), 'journal summary filter should use a native month input');
    assert(indexHtml.includes('class="employee-date-input jurnal-date-filter jurnal-summary-month"'), 'journal summary month filter should reuse the polished calendar style');
    assert(source.includes('selectedSummaryMonth'), 'journal script should store selected summary month');
    assert(source.includes('initSummaryMonthFilter()'), 'journal init should bind the summary month filter');
}

function testExistingJournalIsReadonlyUntilEditButtonIsUsed() {
    const { jurnal, elements } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' }
    });

    elements.set('jurnal-form', createFormMock(elements));
    elements.set('jurnal-upload-area', createElementMock('jurnal-upload-area'));
    jurnal.currentDate = jurnal.parseLocalDate('2026-05-27');
    jurnal.attendanceRecords = [
        { userId: 'KRY001', date: '2026-05-27', clockIn: '08:00', clockOut: '17:00' }
    ];
    jurnal.jurnals = [
        {
            userId: 'KRY001',
            date: '2026-05-27',
            tasks: 'Jurnal tersimpan',
            achievements: 'Selesai',
            obstacles: 'Tidak ada',
            plan: 'Lanjut'
        }
    ];

    jurnal.updateUI();

    assert.strictEqual(elements.get('jurnal-tasks').value, 'Jurnal tersimpan');
    assert.strictEqual(elements.get('jurnal-tasks').disabled, true, 'saved journal fields should be read-only when selected');
    assert.strictEqual(elements.get('jurnal-submit').disabled, true, 'saved journal submit button should be disabled until edit is clicked');

    jurnal.editJurnal('2026-05-27');

    assert.strictEqual(elements.get('jurnal-tasks').disabled, false, 'edit button should unlock saved journal fields');
    assert.strictEqual(elements.get('jurnal-submit').disabled, false, 'edit button should unlock submit button');
}

function testMonthlySummaryCountsFilledJournalsFromSavedJournalRows() {
    const { jurnal, summaryValues } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' }
    });

    jurnal.jurnals = [
        { userId: 'KRY001', date: '2026-05-10', tasks: 'Jurnal bulan ini' },
        { userId: 'KRY001', date: '2026-04-30', tasks: 'Jurnal bulan lalu' },
        { userId: 'KRY002', date: '2026-05-12', tasks: 'Jurnal user lain' }
    ];
    jurnal.attendanceRecords = [];

    jurnal.updateSummary();

    assert.strictEqual(summaryValues[0].textContent, 1, 'filled summary should count saved current-user journals in the current month');
}

function testMonthlySummaryCanUseSelectedMonth() {
    const { jurnal, summaryValues } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' }
    });

    jurnal.selectedSummaryMonth = '2026-05';
    jurnal.jurnals = [
        { userId: 'KRY001', date: '2026-05-10', tasks: 'Jurnal Mei' },
        { userId: 'KRY001', date: '2026-06-01', tasks: 'Jurnal Juni' }
    ];
    jurnal.attendanceRecords = [];

    jurnal.updateSummary();

    assert.strictEqual(summaryValues[0].textContent, 1, 'summary should count journals in the selected month');
}

function testMonthlySummaryIgnoresJournalsWithoutMatchingCurrentUser() {
    const { jurnal, summaryValues } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' }
    });

    jurnal.jurnals = [
        { date: '2026-05-09', tasks: 'Jurnal tanpa user id' },
        { userId: 'KRY002', date: '2026-05-10', tasks: 'Jurnal user lain' },
        { user_id: 'KRY001', date: '2026-05-11', tasks: 'Jurnal user aktif' }
    ];

    jurnal.updateSummary();

    assert.strictEqual(summaryValues[0].textContent, 1, 'summary should only count journals owned by the current employee');
}

function testMonthlySummaryStreakUsesOnlyCurrentUserJournals() {
    const { jurnal, summaryValues } = loadJurnal({
        currentUser: { id: 'KRY001', email: 'a@example.test', role: 'karyawan' }
    });

    jurnal.jurnals = [
        { userId: 'KRY001', date: '2026-05-27', tasks: 'Jurnal user aktif hari ini' },
        { userId: 'KRY002', date: '2026-05-26', tasks: 'Jurnal user lain kemarin' }
    ];

    jurnal.updateSummary();

    assert.strictEqual(summaryValues[2].textContent, 1, 'streak should not include another employee journal');
}

function testMonthlySummaryDoesNotCountAllJournalsWhenCurrentUserIdMissing() {
    const { jurnal, summaryValues } = loadJurnal({
        currentUser: { email: 'missing-id@example.test', role: 'karyawan' }
    });

    jurnal.jurnals = [
        { userId: 'KRY001', date: '2026-05-10', tasks: 'Jurnal akun A' },
        { userId: 'KRY002', date: '2026-05-11', tasks: 'Jurnal akun B' }
    ];

    jurnal.updateSummary();

    assert.strictEqual(summaryValues[0].textContent, 0, 'missing current user id must not make summary count every employee journal');
}

function testWaitingClockOutStatusUsesCompactBadge() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jurnal.js'), 'utf8');
    const jurnalCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'jurnal.css'), 'utf8');

    assert(source.includes("badge.classList.add('waiting-clock-out')"), 'waiting clock-out status should have a dedicated class');
    assert(source.includes("badge.textContent = 'Menunggu Pulang'"), 'waiting clock-out copy should return to the original short label');
    assert(
        /\.entry-status\.waiting-clock-out\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(jurnalCss),
        'waiting clock-out status should render as a tidy compact badge'
    );
    assert(
        /\.entry-status\.waiting-clock-out\s*\{[^}]*white-space:\s*nowrap;/s.test(jurnalCss),
        'waiting clock-out badge should stay on one line'
    );
    assert(
        /\.entry-status\.waiting-clock-out\s*\{[^}]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.1\);/s.test(jurnalCss),
        'waiting clock-out badge should keep a calm blue treatment'
    );
}

function testEmployeeDateInputsShareJournalDateStyle() {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const mainCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'main.css'), 'utf8');

    ['izin-date', 'leave-start', 'leave-end', 'jurnal-summary-month'].forEach(id => {
        const inputPattern = new RegExp(`<input[^>]*id="${id}"[^>]*class="[^"]*employee-date-input[^"]*jurnal-date-filter`, 's');
        assert(inputPattern.test(indexHtml), `${id} should use the same polished date style class`);
    });

    assert(
        /\.employee-date-input\s*\{[^}]*padding:\s*10px\s+14px\s+10px\s+42px;/s.test(mainCss),
        'shared employee date input should match the journal date input spacing'
    );
    assert(
        /\.form-group\s+input\.employee-date-input\s*\{[^}]*padding:\s*10px\s+14px\s+10px\s+42px;/s.test(mainCss),
        'form date inputs should override the generic form input spacing'
    );
    assert(
        /\.form-group\s+input\.jurnal-date-filter\s*\{[^}]*width:\s*100%;/s.test(mainCss),
        'journal-style date inputs inside forms should keep the form column width'
    );
    assert(
        /\.employee-date-input\s*\{[^}]*background-image:\s*url\(/s.test(mainCss),
        'shared employee date input should include the calendar icon treatment'
    );
    assert(
        /\.employee-date-input:hover\s*\{[^}]*border-color:\s*var\(--color-primary\);/s.test(mainCss),
        'shared employee date input should use the same blue hover border'
    );
    assert(
        /\.employee-date-input:focus\s*\{[^}]*box-shadow:\s*0\s+0\s+0\s+3px\s+rgba\(59,\s*130,\s*246,\s*0\.12\);/s.test(mainCss),
        'shared employee date input should use the same focus ring'
    );
    assert(
        /\.employee-date-input::-webkit-calendar-picker-indicator\s*\{[^}]*filter:\s*invert\(45%\)\s+sepia\(97%\)\s+saturate\(2035%\)\s+hue-rotate\(203deg\)\s+brightness\(101%\)\s+contrast\(94%\);/s.test(mainCss),
        'employee calendar picker icon should be blue'
    );
}

function testJournalHeaderDateSelectorIsRemoved() {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jurnal.js'), 'utf8');
    const jurnalCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'jurnal.css'), 'utf8');

    assert(!indexHtml.includes('jurnal-date-selector'), 'journal header should not show the duplicate date selector');
    assert(!indexHtml.includes('id="prev-date"'), 'journal header previous date button should be removed');
    assert(!indexHtml.includes('id="next-date"'), 'journal header next date button should be removed');
    assert(!indexHtml.includes('id="jurnal-current-date"'), 'journal header current date display should be removed');
    assert(!source.includes('initDateSelector'), 'journal script should not bind removed date selector buttons');
    assert(!source.includes('changeDate(direction)'), 'journal script should not keep removed date navigation handler');
    assert(!jurnalCss.includes('.jurnal-date-selector'), 'journal CSS should not keep removed header date selector styles');
}

function testJournalFormUsesGeneralRadioWorkQuestions() {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jurnal.js'), 'utf8');

    assert(indexHtml.includes('Aktivitas Kerja Hari Ini'), 'journal form should ask for daily work activity');
    assert(indexHtml.includes('Hasil Kerja'), 'journal form should ask for work results');
    assert(indexHtml.includes('Kendala atau Catatan'), 'journal form should ask for obstacles or notes');
    assert(indexHtml.includes('Rencana Berikutnya'), 'journal form should ask for next plan');
    assert(indexHtml.includes('id="jurnal-tasks"'), 'journal form should keep existing tasks field id');
    assert(indexHtml.includes('id="jurnal-achievements"'), 'journal form should keep existing achievements field id');
    assert(indexHtml.includes('id="jurnal-obstacles"'), 'journal form should keep existing obstacles field id');
    assert(indexHtml.includes('id="jurnal-plan"'), 'journal form should keep existing plan field id');
    assert(source.includes('<label>Aktivitas Kerja:</label>'), 'employee journal detail should use the updated activity label');
    assert(source.includes('<label>Hasil Kerja:</label>'), 'employee journal detail should use the updated result label');
}

Promise.resolve()
    .then(testTodayJournalIsHiddenUntilClockOut)
    .then(testSwitchingUsersClearsPreviousJournalFormImmediately)
    .then(testSuccessfulSubmitClearsJournalForm)
    .then(testFailedJournalSaveKeepsFormAndShowsError)
    .then(testJournalFormUsesFreshLocalClockOutBeforeStaleAttendanceApi)
    .then(testJournalHistoryUsesSummaryMonthFilterInsteadOfDuplicateControls)
    .then(testJournalSummaryUsesMonthFilter)
    .then(testExistingJournalIsReadonlyUntilEditButtonIsUsed)
    .then(testMonthlySummaryCountsFilledJournalsFromSavedJournalRows)
    .then(testMonthlySummaryCanUseSelectedMonth)
    .then(testMonthlySummaryIgnoresJournalsWithoutMatchingCurrentUser)
    .then(testMonthlySummaryStreakUsesOnlyCurrentUserJournals)
    .then(testMonthlySummaryDoesNotCountAllJournalsWhenCurrentUserIdMissing)
    .then(testWaitingClockOutStatusUsesCompactBadge)
    .then(testEmployeeDateInputsShareJournalDateStyle)
    .then(testJournalHeaderDateSelectorIsRemoved)
    .then(testJournalFormUsesGeneralRadioWorkQuestions)
    .then(() => {
        console.log('jurnal attendance gate tests passed');
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
