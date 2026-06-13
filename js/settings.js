/**
 * Portal Karyawan - Settings
 * Admin settings functionality
 */

const settings = {
    shifts: [],
    draftShifts: [],
    originalShifts: [],
    pendingDeletedShiftIds: [],
    dirtySections: new Set(),
    localOverrideKey: 'settings_local_override',

    async init() {
        // Check if admin
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }

        this.applyCachedSettings();
        this.renderCachedShifts();
        this.initForms();
        await this.loadSettings();
        if (this.canApplySection('shifts')) this.renderShifts();
    },

    async loadSettings() {
        try {
            const [settingsResult, shiftsResult] = await Promise.all([
                api.getSettings(),
                api.getShifts()
            ]);

            // Fix shift times - Google Sheets converts "08:00" to Date objects
            const loadedShifts = (shiftsResult.data || []).map(shift => ({
                ...shift,
                startTime: this.normalizeTime(shift.startTime),
                endTime: this.normalizeTime(shift.endTime)
            }));
            storage.set('shifts', loadedShifts);
            if (this.canApplySection('shifts')) {
                this.shifts = loadedShifts;
                this.resetShiftDrafts();
            }

            const savedLocalSettings = this.getLocalSettingsOverride();
            const allSettings = { ...(settingsResult.data || {}), ...storage.get('app_settings', {}), ...savedLocalSettings };
            storage.set('app_settings', allSettings);
            this.applySettingsToForm(allSettings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.shifts = storage.get('shifts', []);
        }
    },

    parseWorkdays(value) {
        if (!value) return null;
        if (typeof value === 'object') return value;
        try {
            return JSON.parse(value);
        } catch (error) {
            console.error('Error parsing working days:', error);
            return null;
        }
    },

    applyCachedSettings() {
        const cached = {
            ...storage.get('app_settings', {}),
            ...this.getLocalSettingsOverride()
        };
        this.applySettingsToForm(cached);
    },

    renderCachedShifts() {
        const cached = storage.get('shifts', []);
        if (Array.isArray(cached) && cached.length > 0) {
            this.shifts = cached.map(shift => ({
                ...shift,
                startTime: this.normalizeTime(shift.startTime),
                endTime: this.normalizeTime(shift.endTime)
            }));
            this.resetShiftDrafts();
            this.renderShifts();
        }
    },

    resetShiftDrafts() {
        this.draftShifts = this.cloneShifts(this.shifts);
        this.originalShifts = this.cloneShifts(this.shifts);
        this.pendingDeletedShiftIds = [];
    },

    markSectionDirty(section) {
        this.dirtySections.add(section);
    },

    clearSectionDirty(section) {
        this.dirtySections.delete(section);
    },

    canApplySection(section) {
        return !this.dirtySections.has(section);
    },

    cloneShifts(shifts = []) {
        return (Array.isArray(shifts) ? shifts : []).map(shift => ({ ...shift }));
    },

    applySettingsToForm(allSettings = {}) {
        const workdays = this.parseWorkdays(allSettings.working_days);
        if (workdays && this.canApplySection('workdays')) {
            const days = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
            days.forEach(day => {
                const el = document.getElementById(`day-${day}`);
                if (el) el.checked = workdays[day] !== false;
            });
        }

        if (allSettings.late_tolerance !== undefined && this.canApplySection('system')) {
            const el = document.getElementById('setting-late-tolerance');
            if (el) el.value = allSettings.late_tolerance;
        }

        if (allSettings.annual_leave_days !== undefined && this.canApplySection('system')) {
            const el = document.getElementById('setting-annual-leave-days');
            if (el) el.value = allSettings.annual_leave_days;
        }
    },

    getLocalSettingsOverride() {
        const record = storage.get(this.localOverrideKey, {});
        return record && typeof record.values === 'object' ? record.values : {};
    },

    setLocalSettingsOverride(values) {
        const current = this.getLocalSettingsOverride();
        const merged = { ...current, ...values };
        storage.set(this.localOverrideKey, {
            updatedAt: Date.now(),
            values: merged
        });
        const appSettings = storage.get('app_settings', {});
        storage.set('app_settings', { ...appSettings, ...merged });
    },

    /**
     * Normalize time values from Google Sheets.
     * Sheets converts "08:00" to a Date (e.g. "1899-12-30T01:00:00.000Z").
     * This extracts HH:mm from whatever format we get.
     */
    normalizeTime(val) {
        if (!val) return '09:00';
        let str = String(val).trim();
        // Already HH:mm format
        if (/^\d{2}:\d{2}$/.test(str)) return str;
        // Accept 00.00 / 0.00 / 12.00 and normalize to HH:mm
        const dotTime = str.match(/^(\d{1,2})[.:](\d{2})$/);
        if (dotTime) {
            const hours = Math.min(23, Math.max(0, Number(dotTime[1])));
            const minutes = Math.min(59, Math.max(0, Number(dotTime[2])));
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        // Convert 12-hour strings if they ever come from browser/Sheets
        const amPm = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (amPm) {
            let hours = Number(amPm[1]);
            const minutes = Number(amPm[2]);
            const suffix = amPm[3].toUpperCase();
            if (suffix === 'PM' && hours < 12) hours += 12;
            if (suffix === 'AM' && hours === 12) hours = 0;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        // ISO date string from Sheets - extract time portion based on timezone offset
        if (str.includes('T') || str.includes('1899')) {
            try {
                const d = new Date(str);
                // Google Sheets stores time as a date in 1899 with UTC offset
                // We need to get the time in the original timezone (Asia/Jakarta UTC+7)
                const hours = String(d.getUTCHours() + 7).padStart(2, '0');
                const mins = String(d.getUTCMinutes()).padStart(2, '0');
                const h = parseInt(hours) % 24;
                return String(h).padStart(2, '0') + ':' + mins;
            } catch (e) {
                return '09:00';
            }
        }
        return str;
    },

    initForms() {
        // Add shift button
        const addShiftBtn = document.getElementById('btn-add-shift');
        if (addShiftBtn) {
            addShiftBtn.onclick = () => this.addShift();
        }

        const saveShiftBtn = document.getElementById('btn-save-shifts');
        if (saveShiftBtn) {
            saveShiftBtn.onclick = () => this.saveShifts();
        }

        // Save working days
        const workdayInputs = document.querySelectorAll('#working-days-container input[type="checkbox"]');
        workdayInputs.forEach(input => {
            input.onchange = () => this.markSectionDirty('workdays');
        });

        const saveWorkdaysBtn = document.getElementById('btn-save-workdays');
        if (saveWorkdaysBtn) {
            saveWorkdaysBtn.onclick = () => this.saveWorkdays();
        }

        // Save system settings
        ['setting-late-tolerance', 'setting-annual-leave-days'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.oninput = () => this.markSectionDirty('system');
                input.onchange = () => this.markSectionDirty('system');
            }
        });

        const saveSystemBtn = document.getElementById('btn-save-system');
        if (saveSystemBtn) {
            saveSystemBtn.onclick = () => this.saveSystemSettings();
        }
    },

    async saveWorkdays() {
        const days = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
        const workdays = {};
        days.forEach(day => {
            const el = document.getElementById(`day-${day}`);
            workdays[day] = el ? el.checked : false;
        });

        this.setLocalSettingsOverride({ working_days: JSON.stringify(workdays) });
        this.clearSectionDirty('workdays');
        if (window.api?.clearRequestCacheForMutation) api.clearRequestCacheForMutation('saveSetting');
        this.syncCurrentMonthScheduleWithWorkdays(workdays);
        this.refreshShiftConsumers();
        toast.success('Hari kerja berhasil disimpan!');

        api.saveSetting('working_days', JSON.stringify(workdays)).catch(error => {
            console.error('Error saving workdays:', error);
            toast.warning('Hari kerja tampil lokal, tetapi server belum tersinkron');
        });
    },

    async syncCurrentMonthScheduleWithWorkdays(workdays) {
        const now = new Date();
        const month = Number.isInteger(window.shiftSchedule?.currentMonth)
            ? window.shiftSchedule.currentMonth
            : now.getMonth();
        const year = Number.isInteger(window.shiftSchedule?.currentYear)
            ? window.shiftSchedule.currentYear
            : now.getFullYear();
        const key = `${year}-${month}`;
        const settingKey = `shift_schedule_${key}`;
        const employees = window.shiftSchedule?.employees?.length
            ? window.shiftSchedule.employees
            : storage.get('admin_employees', []);
        let schedules = storage.get('shift_schedule', {}) || {};
        this.applyWorkdaysToMonthSchedule(employees, schedules, key, year, month, workdays);

        storage.set('shift_schedule', schedules);

        if (window.shiftSchedule) {
            shiftSchedule.scheduleData = schedules;
            if (shiftSchedule.currentYear === year && shiftSchedule.currentMonth === month) {
                shiftSchedule.renderTable();
                shiftSchedule.updateSummary();
            }
        }

        api.getEmployees().then(result => {
            const freshEmployees = result?.data || [];
            if (freshEmployees.length) {
                this.applyWorkdaysToMonthSchedule(freshEmployees, schedules, key, year, month, workdays);
                storage.set('shift_schedule', schedules);
                if (window.shiftSchedule) {
                    shiftSchedule.employees = freshEmployees;
                    shiftSchedule.scheduleData = schedules;
                    if (shiftSchedule.currentYear === year && shiftSchedule.currentMonth === month) {
                        shiftSchedule.renderTable();
                        shiftSchedule.updateSummary();
                    }
                }
            }
            return api.saveSetting(settingKey, JSON.stringify(schedules[key] || {}));
        }).catch(error => {
            console.error('Error syncing workdays schedule:', error);
            toast.warning('Kalender tampil lokal, tetapi server belum tersinkron');
        });
    },

    applyWorkdaysToMonthSchedule(employees, schedules, key, year, month, workdays) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
        const monthData = schedules[key] || {};

        employees.forEach(emp => {
            if (!emp?.id) return;
            const empId = String(emp.id);
            const defaultShift = this.getDefaultWorkdayShift(emp);
            if (!monthData[empId]) monthData[empId] = {};

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dayKey = dayKeys[date.getDay()];
                const isWorkday = workdays[dayKey] !== false;
                const currentValue = monthData[empId][day];

                if (!isWorkday) {
                    monthData[empId][day] = 'Libur';
                } else if (!currentValue || currentValue === 'Libur') {
                    monthData[empId][day] = defaultShift;
                }
            }
        });

        schedules[key] = monthData;
    },

    getDefaultWorkdayShift(emp) {
        const employeeShift = String(emp?.shift || '').trim();
        if (employeeShift && employeeShift.toLowerCase() !== 'libur') return employeeShift;

        const firstShift = (this.shifts || storage.get('shifts', []) || [])
            .find(shift => String(shift?.name || '').trim());
        return firstShift?.name || 'Pagi';
    },

    async saveSystemSettings() {
        const lateTolerance = document.getElementById('setting-late-tolerance');
        const tolerance = String(Math.min(60, Math.max(0, Number(lateTolerance ? lateTolerance.value : 15) || 0)));
        if (lateTolerance) lateTolerance.value = tolerance;
        const annualLeaveInput = document.getElementById('setting-annual-leave-days');
        const annualLeaveDays = String(Math.min(365, Math.max(0, Number(annualLeaveInput ? annualLeaveInput.value : 12) || 0)));
        if (annualLeaveInput) annualLeaveInput.value = annualLeaveDays;

        this.setLocalSettingsOverride({ late_tolerance: tolerance, annual_leave_days: annualLeaveDays });
        this.clearSectionDirty('system');
        if (window.api?.clearRequestCacheForMutation) api.clearRequestCacheForMutation('saveSetting');
        if (window.cuti && typeof cuti.applyAnnualLeaveSetting === 'function') {
            cuti.applyAnnualLeaveSetting(annualLeaveDays);
        }
        toast.success('Pengaturan sistem berhasil disimpan!');

        Promise.all([
            api.saveSetting('late_tolerance', tolerance),
            api.saveSetting('annual_leave_days', annualLeaveDays)
        ]).catch(error => {
            console.error('Error saving system settings:', error);
            toast.warning('Pengaturan tampil lokal, tetapi server belum tersinkron');
        });
    },

    renderShifts() {
        const container = document.getElementById('shifts-list');
        if (!container) return;

        if (!this.draftShifts.length) {
            container.innerHTML = '<p class="empty-state">Belum ada shift</p>';
            return;
        }

        container.innerHTML = this.draftShifts.map((shift, index) => `
            <div class="shift-item" data-index="${index}">
                <div class="shift-input-group">
                    <label>Nama Shift</label>
                    <input type="text" value="${shift.name}" placeholder="Nama Shift" 
                           oninput="settings.updateShift(${index}, 'name', this.value, false)"
                           onchange="settings.updateShift(${index}, 'name', this.value)">
                </div>
                <div class="shift-input-group">
                    <label>Jam Masuk</label>
                    <input type="text" inputmode="numeric" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]"
                           value="${this.normalizeTime(shift.startTime)}" placeholder="00:00"
                           oninput="settings.updateShift(${index}, 'startTime', this.value, false)"
                           onchange="settings.updateShift(${index}, 'startTime', this.value)">
                </div>
                <div class="shift-input-group">
                    <label>Jam Pulang</label>
                    <input type="text" inputmode="numeric" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]"
                           value="${this.normalizeTime(shift.endTime)}" placeholder="12:00"
                           oninput="settings.updateShift(${index}, 'endTime', this.value, false)"
                           onchange="settings.updateShift(${index}, 'endTime', this.value)">
                </div>
                <button type="button" class="btn-delete-shift" onclick="settings.deleteShift(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    addShift() {
        const newShift = {
            draftId: `draft-${Date.now()}-${this.draftShifts.length}`,
            name: 'Shift Baru',
            startTime: '09:00',
            endTime: '18:00'
        };

        this.markSectionDirty('shifts');
        this.draftShifts.push(newShift);
        this.renderShifts();
    },

    updateShift(index, field, value, validate = true) {
        if (this.draftShifts[index]) {
            this.markSectionDirty('shifts');
            if (!validate) {
                this.draftShifts[index][field] = value;
                return;
            }
            if (field === 'startTime' || field === 'endTime') {
                value = this.normalizeTime(value);
            }
            if (field === 'name' && !String(value || '').trim()) {
                toast.error('Nama shift tidak boleh kosong');
                this.renderShifts();
                return;
            }
            this.draftShifts[index][field] = value;
        }
    },

    async saveShifts() {
        const validationError = this.validateDraftShifts();
        if (validationError) {
            toast.error(validationError);
            this.renderShifts();
            return;
        }

        const saveBtn = document.getElementById('btn-save-shifts');
        const originalHtml = saveBtn?.innerHTML;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Menyimpan...</span>';
        }

        const previousShifts = this.cloneShifts(this.shifts);
        try {
            for (const shiftId of this.pendingDeletedShiftIds) {
                await api.deleteShift(shiftId);
            }

            const savedShifts = [];
            for (const draft of this.draftShifts) {
                const normalizedDraft = {
                    ...draft,
                    name: String(draft.name || '').trim(),
                    startTime: this.normalizeTime(draft.startTime),
                    endTime: this.normalizeTime(draft.endTime)
                };
                if (normalizedDraft.id) {
                    const original = this.originalShifts.find(shift => String(shift.id) === String(normalizedDraft.id));
                    const payload = {
                        name: normalizedDraft.name,
                        startTime: normalizedDraft.startTime,
                        endTime: normalizedDraft.endTime
                    };
                    if (original && String(original.name) !== String(normalizedDraft.name)) {
                        payload.oldName = original.name;
                    }
                    const result = await api.updateShift(normalizedDraft.id, payload);
                    const saved = result?.success && result.data ? result.data : normalizedDraft;
                    savedShifts.push({
                        ...saved,
                        startTime: this.normalizeTime(saved.startTime || normalizedDraft.startTime),
                        endTime: this.normalizeTime(saved.endTime || normalizedDraft.endTime)
                    });
                    if (payload.oldName) this.syncLocalShiftName(payload.oldName, normalizedDraft.name);
                } else {
                    const result = await api.addShift({
                        name: normalizedDraft.name,
                        startTime: normalizedDraft.startTime,
                        endTime: normalizedDraft.endTime
                    });
                    if (result?.success && result.data) {
                        savedShifts.push({
                            ...result.data,
                            startTime: this.normalizeTime(result.data.startTime),
                            endTime: this.normalizeTime(result.data.endTime)
                        });
                    }
                }
            }

            this.shifts = savedShifts;
            storage.set('shifts', this.shifts);
            this.resetShiftDrafts();
            this.clearSectionDirty('shifts');
            this.renderShifts();
            this.refreshShiftConsumers();
            toast.success('Pengaturan shift berhasil disimpan!');
        } catch (error) {
            this.shifts = previousShifts;
            this.resetShiftDrafts();
            this.renderShifts();
            console.error('Error saving shifts:', error);
            toast.error('Gagal menyimpan pengaturan shift');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalHtml || '<i class="fas fa-save"></i><span>Simpan Pengaturan Shift</span>';
            }
        }
    },

    validateDraftShifts() {
        const names = new Set();
        for (const shift of this.draftShifts) {
            const name = String(shift.name || '').trim();
            if (!name) return 'Nama shift tidak boleh kosong';
            const key = name.toLowerCase();
            if (names.has(key)) return 'Nama shift tidak boleh duplikat';
            names.add(key);
        }
        return '';
    },

    syncLocalShiftName(oldName, newName) {
        if (!oldName || oldName === newName) return;

        const employees = storage.get('admin_employees', []);
        let employeesChanged = false;
        employees.forEach(emp => {
            if (String(emp.shift) === String(oldName)) {
                emp.shift = newName;
                employeesChanged = true;
            }
        });
        if (employeesChanged) {
            storage.set('admin_employees', employees);
        }

        const currentUser = auth.getCurrentUser();
        if (currentUser && String(currentUser.shift) === String(oldName)) {
            currentUser.shift = newName;
            sessionStorage_manager.set('session', currentUser);
        }

        const schedules = storage.get('shift_schedule', {});
        let schedulesChanged = false;
        Object.keys(schedules || {}).forEach(monthKey => {
            Object.keys(schedules[monthKey] || {}).forEach(employeeId => {
                Object.keys(schedules[monthKey][employeeId] || {}).forEach(day => {
                    if (String(schedules[monthKey][employeeId][day]) === String(oldName)) {
                        schedules[monthKey][employeeId][day] = newName;
                        schedulesChanged = true;
                    }
                });
            });
        });
        if (schedulesChanged) {
            storage.set('shift_schedule', schedules);
        }
    },

    refreshShiftConsumers() {
        window.dispatchEvent(new CustomEvent('shiftsUpdated', {
            detail: { shifts: this.shifts }
        }));

        if (window.dashboard && dashboard.updateWelcomeCard) {
            dashboard.updateWelcomeCard();
        }
        if (window.absensi && absensi.loadTodayAttendance) {
            absensi.loadTodayAttendance();
        }
        if (window.adminEmployees && adminEmployees.loadEmployees) {
            const refreshEmployees = adminEmployees.loadEmployees().then(() => {
                adminEmployees.renderTable();
                adminEmployees.renderMobileCards();
                adminEmployees.updatePaginationInfo();
            }).catch(() => { });
            if (adminEmployees.populateShiftOptions) {
                refreshEmployees.then(() => adminEmployees.populateShiftOptions()).catch(() => { });
            }
        }
        if (window.shiftSchedule && shiftSchedule.loadData) {
            shiftSchedule.loadData().then(() => {
                shiftSchedule.renderTable();
                shiftSchedule.updateSummary();
            }).catch(() => { });
        }
    },

    deleteShift(index) {
        if (confirm('Apakah Anda yakin ingin menghapus shift ini?')) {
            const shift = this.draftShifts[index];
            if (shift?.id) {
                this.pendingDeletedShiftIds.push(shift.id);
            }
            this.markSectionDirty('shifts');
            this.draftShifts.splice(index, 1);
            this.renderShifts();
            toast.info('Shift akan dihapus setelah pengaturan disimpan');
        }
    },

    getShiftOptions() {
        return this.shifts.map(shift => ({
            value: shift.name,
            label: `${shift.name} (${shift.startTime} - ${shift.endTime})`
        }));
    }
};

// Global init function
window.initSettings = () => {
    settings.init();
};

// Expose settings object
window.settings = settings;
