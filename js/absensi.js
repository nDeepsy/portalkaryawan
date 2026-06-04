/**
 * Portal Karyawan - Absensi
 * Attendance/Clock In-Out functionality
 */

const absensi = {
    initialized: false,
    currentState: 'waiting', // waiting, clocked-in, on-break, completed, libur
    attendanceData: {},
    liveClockInterval: null,
    todayLoadPromise: null,
    historyLoadPromise: null,
    localMutationVersion: 0,
    attendanceSaveInFlight: 0,
    activeAttendanceLeave: null,
    attendanceHistoryData: [],
    selectedHistoryMonth: '',

    async init() {
        this.clearPendingAttendanceAction();

        if (!this.initialized) {
            this.hydrateCachedAttendance();
            this.initLiveClock();
            this.initHistoryMonthFilter();
            this.initButtons();
            this.renderTimeline();
            this.updateUI();
            this.initialized = true;
        } else {
            this.hydrateCachedAttendance();
            this.renderTimeline();
            this.updateUI();
        }

        this.loadTodayAttendance();
        this.loadAttendanceHistory();

        // Debug button state
        setTimeout(() => {
            const btnClockIn = document.getElementById('btn-clock-in');
            if (btnClockIn) {
                console.log('Clock In button - disabled:', btnClockIn.disabled);
                console.log('Clock In button - visible:', btnClockIn.offsetParent !== null);
            }
        }, 100);
    },

    hydrateCachedAttendance() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        const today = dateTime.getLocalDate();
        const allData = storage.get('attendance', []);
        const todayAttendance = allData.find(d => d.date === today && String(d.userId) === String(userId));

        if (todayAttendance) {
            this.attendanceData = this.normalizeAttendance(todayAttendance);
        } else if (!this.attendanceData?.date || this.attendanceData.date !== today || String(this.attendanceData.userId || '') !== String(userId)) {
            this.attendanceData = this.getDefaultAttendance(userId);
        }
        this.activeAttendanceLeave = this.getActiveApprovedLeaveOrPermission(
            storage.get('leaves', []),
            storage.get('izin', []),
            userId,
            today
        );
        this.setCurrentState();
    },

    initHistoryMonthFilter() {
        const monthInput = document.getElementById('attendance-history-month');
        if (!monthInput || monthInput.dataset.bound === 'true') return;

        this.selectedHistoryMonth = this.selectedHistoryMonth || this.getCurrentHistoryMonth();
        monthInput.value = this.selectedHistoryMonth;
        monthInput.dataset.bound = 'true';
        monthInput.addEventListener('change', (event) => {
            this.selectedHistoryMonth = event.target.value || this.getCurrentHistoryMonth();
            this.renderHistory(this.attendanceHistoryData);
        });
    },

    getCurrentHistoryMonth() {
        const today = dateTime.getLocalDate ? dateTime.getLocalDate() : new Date().toISOString().slice(0, 10);
        return String(today || '').slice(0, 7);
    },

    getDefaultAttendance(userId) {
        return {
            userId,
            date: dateTime.getLocalDate(),
            shift: this.getScheduledShiftName(userId),
            clockIn: null,
            clockOut: null,
            breakStart: null,
            breakEnd: null,
            break2Start: null,
            break2End: null,
            overtimeStart: null,
            status: 'waiting'
            ,
            attendanceLogs: []
        };
    },

    normalizeAttendance(data) {
        return {
            ...data,
            clockIn: data.clockIn || null,
            clockOut: data.clockOut || null,
            breakStart: data.breakStart || null,
            breakEnd: data.breakEnd || null,
            break2Start: data.break2Start || data.break2_start || null,
            break2End: data.break2End || data.break2_end || null,
            overtimeStart: data.overtimeStart || null,
            shift: data.shift || this.getScheduledShiftName(data.userId),
            attendanceLogs: this.normalizeAttendanceLogs(data.attendanceLogs)
        };
    },

    normalizeAttendanceLogs(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    },

    getPersistableAttendanceLogs() {
        return this.normalizeAttendanceLogs(this.attendanceData.attendanceLogs).map(log => ({
            action: log.action || '',
            label: log.label || '',
            time: log.time || '',
            timestamp: log.timestamp || ''
        }));
    },

    getScheduledShiftName(userId = auth.getCurrentUser()?.id || 'demo-user', dateValue = dateTime.getLocalDate()) {
        let currentShift = auth.getCurrentUser()?.shift || 'Pagi';
        try {
            const stringUserId = String(userId);
            const schedules = storage.get('shift_schedule', {});
            const todayObj = this.parseLocalDate(dateValue) || new Date();
            const key = `${todayObj.getFullYear()}-${todayObj.getMonth()}`;
            const assignedShift = schedules?.[key]?.[stringUserId]?.[todayObj.getDate()];
            if (assignedShift) {
                currentShift = assignedShift;
            } else if (!this.isConfiguredWorkday(todayObj)) {
                currentShift = 'Libur';
            }
        } catch (e) {
            console.error('Error reading cached shift schedule:', e);
        }
        return currentShift;
    },

    isConfiguredWorkday(date = new Date()) {
        const dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
        const dayKey = dayKeys[date.getDay()];
        const defaults = {
            senin: true,
            selasa: true,
            rabu: true,
            kamis: true,
            jumat: true,
            sabtu: false,
            minggu: false
        };
        const settings = storage.get('app_settings', {});
        let workdays = defaults;

        try {
            if (settings.working_days) {
                const parsed = typeof settings.working_days === 'string'
                    ? JSON.parse(settings.working_days)
                    : settings.working_days;
                workdays = { ...defaults, ...parsed };
            }
        } catch (e) {
            workdays = defaults;
        }

        return workdays[dayKey] !== false;
    },


    async loadTodayAttendance() {
        if (this.todayLoadPromise) return this.todayLoadPromise;

        this.todayLoadPromise = this.fetchTodayAttendance().finally(() => {
            this.todayLoadPromise = null;
        });
        return this.todayLoadPromise;
    },

    async fetchTodayAttendance() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        const mutationVersionAtStart = this.localMutationVersion;

        try {
            if (api.clearRequestCacheForMutation) {
                api.clearRequestCacheForMutation('approveLeave');
                api.clearRequestCacheForMutation('approveIzin');
            }

            const batchResult = await api.batch([
                { key: 'todayAttendance', action: 'getTodayAttendance', userId },
                { key: 'leaves', action: 'getLeaves', userId },
                { key: 'izin', action: 'getIzin', userId },
                { key: 'settings', action: 'getSettings' },
                { key: 'shifts', action: 'getShifts' }
            ]);
            const batch = batchResult?.data || {};
            const result = batch.todayAttendance;
            const leavesResult = batch.leaves;
            const izinResult = batch.izin;
            const settingsRes = batch.settings;
            const shiftsResult = batch.shifts;
            const leaves = leavesResult?.success ? (leavesResult.data || []) : storage.get('leaves', []);
            const izinList = izinResult?.success ? (izinResult.data || []) : storage.get('izin', []);

            if (leavesResult?.success) storage.set('leaves', leaves);
            if (izinResult?.success) storage.set('izin', izinList);

            if (shiftsResult && shiftsResult.success) {
                storage.set('shifts', shiftsResult.data || []);
            }

            if (settingsRes && settingsRes.success && settingsRes.data) {
                const globalSettings = settingsRes.data;
                storage.set('app_settings', globalSettings);
                const loadedSchedules = {};
                Object.keys(globalSettings).forEach(k => {
                    if (k.startsWith('shift_schedule_')) {
                        const monthKey = k.replace('shift_schedule_', '');
                        try {
                            loadedSchedules[monthKey] = JSON.parse(globalSettings[k]);
                        } catch (e) { }
                    }
                });
                if (Object.keys(loadedSchedules).length > 0) {
                    storage.set('shift_schedule', loadedSchedules);
                }
            }

            let todayAttendance = result?.data || {};
            this.activeAttendanceLeave = this.getActiveApprovedLeaveOrPermission(
                leaves,
                izinList,
                userId,
                dateTime.getLocalDate()
            );

            const today = dateTime.getLocalDate();
            const currentShift = this.getScheduledShiftName(userId, today);

            if (!todayAttendance.date) {
                todayAttendance = this.getDefaultAttendance(userId);
            } else if (!todayAttendance.clockIn) {
                todayAttendance.shift = currentShift;
            }

            if (mutationVersionAtStart !== this.localMutationVersion || this.attendanceSaveInFlight > 0) {
                return;
            }

            this.attendanceData = this.mergeAttendanceRecords(this.attendanceData, todayAttendance);
            this.setCurrentState();
            this.updateUI();
            this.renderTimeline();

            const allData = storage.get('attendance', []);
            const idx = allData.findIndex(d => d.date === todayAttendance.date && String(d.userId) === String(userId));
            if (idx >= 0) {
                allData[idx] = this.attendanceData;
            } else {
                allData.unshift(this.attendanceData);
            }
            storage.set('attendance', allData);
        } catch (error) {
            console.error('Error loading attendance:', error);
        }
    },

    setCurrentState() {
        const todayAttendance = this.attendanceData || {};
        if (this.activeAttendanceLeave) {
            this.currentState = 'on-leave';
        } else if (todayAttendance.shift === 'Libur' && !todayAttendance.clockIn) {
            this.currentState = 'libur';
        } else if (todayAttendance.clockOut) {
            this.currentState = 'completed';
        } else if (this.isOnAnyBreak(todayAttendance)) {
            this.currentState = 'on-break';
        } else if (todayAttendance.clockIn) {
            this.currentState = 'clocked-in';
        } else {
            this.currentState = 'waiting';
        }
    },

    async loadAttendanceHistory(options = {}) {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        const force = Boolean(options.force);
        const mutationVersionAtStart = this.localMutationVersion;
        const cached = storage.get('attendance', []);
        const cachedHistory = cached.filter(d => String(d.userId) === String(userId));
        this.renderHistory(cachedHistory);

        if (this.historyLoadPromise && !force) return this.historyLoadPromise;

        const historyPromise = this.fetchAttendanceHistory(userId, mutationVersionAtStart).finally(() => {
            if (this.historyLoadPromise === historyPromise) {
                this.historyLoadPromise = null;
            }
        });

        this.historyLoadPromise = historyPromise;
        return historyPromise;
    },

    async fetchAttendanceHistory(userId, mutationVersionAtStart = this.localMutationVersion) {
        try {
            const result = await api.getAllAttendance();
            const allData = result.data || [];
            const historyData = allData.filter(d => String(d.userId) === String(userId));

            if (mutationVersionAtStart !== this.localMutationVersion || this.attendanceSaveInFlight > 0) {
                this.renderHistory(this.getCachedAttendanceHistory());
                return;
            }

            this.renderHistory(historyData);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    },

    getActiveApprovedLeaveOrPermission(leaves = [], izinList = [], userId = auth.getCurrentUser()?.id || 'demo-user', today = dateTime.getLocalDate()) {
        const normalizedUserId = String(userId || '');
        const todayDate = this.parseLocalDate(today);
        if (!todayDate) return null;

        const approvedLeaves = (Array.isArray(leaves) ? leaves : [])
            .filter(item => String(item.userId || item.user_id || '') === normalizedUserId)
            .filter(item => String(item.status || '').toLowerCase() === 'approved')
            .map(item => ({
                source: 'cuti',
                label: item.typeLabel || this.getLeaveTypeLabel(item.type) || 'Cuti',
                startDate: item.startDate || item.start_date || item.date || '',
                endDate: item.endDate || item.end_date || item.startDate || item.date || ''
            }));

        const approvedIzin = (Array.isArray(izinList) ? izinList : [])
            .filter(item => String(item.userId || item.user_id || '') === normalizedUserId)
            .filter(item => String(item.status || '').toLowerCase() === 'approved')
            .map(item => {
                const startDate = item.date || item.startDate || item.start_date || '';
                const duration = Math.max(1, parseInt(item.duration, 10) || 1);
                return {
                    source: 'izin',
                    label: item.typeLabel || this.getIzinTypeLabel(item.type) || 'Izin',
                    startDate,
                    endDate: this.addDaysToDateString(startDate, duration - 1)
                };
            });

        return approvedLeaves.concat(approvedIzin).find(item => {
            const start = this.parseLocalDate(item.startDate);
            const end = this.parseLocalDate(item.endDate || item.startDate);
            return start && end && todayDate >= start && todayDate <= end;
        }) || null;
    },

    parseLocalDate(value) {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }

        const raw = String(value).trim().split('T')[0];
        const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    },

    formatLeaveLockDate(value) {
        const date = this.parseLocalDate(value);
        if (!date) return String(value || '-');
        if (dateTime.formatNumericDate) return dateTime.formatNumericDate(date);
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    },

    addDaysToDateString(value, days) {
        const date = this.parseLocalDate(value);
        if (!date) return value || '';
        date.setDate(date.getDate() + Number(days || 0));
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    getLeaveTypeLabel(type) {
        const labels = {
            annual: 'Cuti Tahunan',
            sick: 'Cuti Sakit',
            emergency: 'Cuti Darurat',
            other: 'Cuti'
        };
        return labels[String(type || '').toLowerCase()] || 'Cuti';
    },

    getIzinTypeLabel(type) {
        const labels = {
            sick: 'Sakit',
            permission: 'Izin',
            emergency: 'Izin Darurat'
        };
        return labels[String(type || '').toLowerCase()] || 'Izin';
    },

    renderHistory(historyData) {
        const tbody = document.getElementById('attendance-history');
        if (!tbody) return;

        this.attendanceHistoryData = Array.isArray(historyData) ? historyData : [];
        const filteredHistory = this.getFilteredHistoryData(this.attendanceHistoryData);

        if (filteredHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Belum ada riwayat absensi.</td></tr>';
            return;
        }

        tbody.innerHTML = filteredHistory.slice(0, 10).map(record => {
            const clockIn = this.formatHistoryTime(record.clockIn || record.clock_in);
            const clockOut = this.formatHistoryTime(record.clockOut || record.clock_out);
            const breakStart = this.formatHistoryTime(record.breakStart || record.break_start);
            const breakEnd = this.formatHistoryTime(record.breakEnd || record.break_end);
            const break2Start = this.formatHistoryTime(record.break2Start || record.break2_start);
            const break2End = this.formatHistoryTime(record.break2End || record.break2_end);
            const duration = this.calculateAttendanceDuration(clockIn, clockOut, [
                [breakStart, breakEnd],
                [break2Start, break2End]
            ]);

            // Status Badge
            let statusBadge = '<span class="badge-status">Waiting</span>';
            const status = String(record.status || '').toLowerCase();
            if (status === 'ontime') {
                statusBadge = '<span class="badge-status success">Tepat Waktu</span>';
            } else if (status === 'terlambat' || status === 'late') {
                statusBadge = '<span class="badge-status warning">Terlambat</span>';
            }

            const dateStr = dateTime.formatNumericDate
                ? dateTime.formatNumericDate(record.date || record.tanggal || '')
                : (record.date || record.tanggal || '-');

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td>${record.shift || '-'}</td>
                    <td>${clockIn || '--:--'}</td>
                    <td>${clockOut || '--:--'}</td>
                    <td>${duration}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    },

    getFilteredHistoryData(historyData = this.attendanceHistoryData) {
        const selectedMonth = this.selectedHistoryMonth || this.getCurrentHistoryMonth();
        return (Array.isArray(historyData) ? historyData : [])
            .filter(record => !selectedMonth || String(record.date || record.tanggal || '').startsWith(selectedMonth))
            .sort((a, b) => String(b.date || b.tanggal || '').localeCompare(String(a.date || a.tanggal || '')));
    },

    formatHistoryTime(value) {
        if (!value) return '';
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return dateTime.formatTime(value);
        }

        const text = String(value).trim();
        if (!text) return '';

        const decimalMatch = text.match(/^(\d{1,2})[.](\d{1,2})$/);
        if (decimalMatch) {
            const hours = decimalMatch[1].padStart(2, '0');
            const minutes = decimalMatch[2].padEnd(2, '0');
            return `${hours}:${minutes}`;
        }

        const timeMatch = text.match(/(\d{1,2})[:.](\d{1,2})/);
        if (!timeMatch) return text;

        const hours = timeMatch[1].padStart(2, '0');
        const minutes = timeMatch[2].padStart(2, '0');
        return `${hours}:${minutes}`;
    },

    calculateAttendanceDuration(clockIn, clockOut, breakSessions = []) {
        const startMinutes = this.timeToMinutes(clockIn);
        const endMinutes = this.timeToMinutes(clockOut);
        if (startMinutes === null || endMinutes === null) return '--';

        let diffInMinutes = endMinutes - startMinutes;
        if (diffInMinutes < 0) diffInMinutes += 24 * 60;

        breakSessions.forEach(([breakStart, breakEnd]) => {
            const breakStartMinutes = this.timeToMinutes(breakStart);
            const breakEndMinutes = this.timeToMinutes(breakEnd);
            if (breakStartMinutes !== null && breakEndMinutes !== null) {
                let breakMinutes = breakEndMinutes - breakStartMinutes;
                if (breakMinutes < 0) breakMinutes += 24 * 60;
                diffInMinutes -= breakMinutes;
            }
        });

        if (diffInMinutes < 0) diffInMinutes = 0;

        const h = Math.floor(diffInMinutes / 60);
        const m = diffInMinutes % 60;
        return `${h}j ${m}m`;
    },

    timeToMinutes(time) {
        const match = String(time || '').match(/^(\d{1,2})[:.](\d{2})$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

        return (hours * 60) + minutes;
    },

    initLiveClock() {
        // Clear existing interval
        if (this.liveClockInterval) {
            clearInterval(this.liveClockInterval);
        }

        const updateClock = () => {
            const clockEl = document.getElementById('live-clock');
            const dateEl = document.getElementById('live-date');

            if (clockEl) {
                clockEl.textContent = dateTime.getCurrentTime();
            }
            if (dateEl) {
                dateEl.textContent = dateTime.getCurrentDate();
            }
        };

        updateClock();
        this.liveClockInterval = setInterval(updateClock, 1000);
    },

    initButtons() {
        // Clock In
        const btnClockIn = document.getElementById('btn-clock-in');
        if (btnClockIn) {
            this.bindAttendanceButton(btnClockIn, () => this.handleClockIn());
            console.log('Clock In button initialized, disabled:', btnClockIn.disabled);
        }

        // Break
        const btnBreak = document.getElementById('btn-break');
        if (btnBreak) {
            this.bindAttendanceButton(btnBreak, () => this.handleBreak());
        }

        // After Break
        const btnAfterBreak = document.getElementById('btn-after-break');
        if (btnAfterBreak) {
            this.bindAttendanceButton(btnAfterBreak, () => this.handleAfterBreak());
        }

        // Break 2
        const btnBreak2 = document.getElementById('btn-break-2');
        if (btnBreak2) {
            this.bindAttendanceButton(btnBreak2, () => this.handleBreak2());
        }

        // After Break 2
        const btnAfterBreak2 = document.getElementById('btn-after-break-2');
        if (btnAfterBreak2) {
            this.bindAttendanceButton(btnAfterBreak2, () => this.handleAfterBreak2());
        }

        // Overtime
        const btnOvertime = document.getElementById('btn-overtime');
        if (btnOvertime) {
            this.bindAttendanceButton(btnOvertime, () => this.handleOvertime());
        }

        // Clock Out
        const btnClockOut = document.getElementById('btn-clock-out');
        if (btnClockOut) {
            this.bindAttendanceButton(btnClockOut, () => this.handleClockOut());
        }
    },

    bindAttendanceButton(button, handler) {
        if (!button) return;
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (button.disabled) return;
            handler();
        };
    },

    clearPendingAttendanceAction() {
        storage.remove('pending_attendance_action');
    },

    handleClockIn() {
        if (this.attendanceData.clockIn) return;

        this.startFaceVerification('clock-in');
    },

    handleBreak() {
        if (!this.canStartBreak()) return;

        this.startFaceVerification('break');
    },

    handleAfterBreak() {
        if (!this.canEndBreak()) return;

        this.startFaceVerification('after-break');
    },

    handleBreak2() {
        if (!this.canStartBreak2()) return;

        this.startFaceVerification('break-2');
    },

    handleAfterBreak2() {
        if (!this.canEndBreak2()) return;

        this.startFaceVerification('after-break-2');
    },

    handleOvertime() {
        if (!this.attendanceData.clockIn) return;

        this.startFaceVerification('overtime');
    },

    handleClockOut() {
        if (!this.attendanceData.clockIn || this.attendanceData.clockOut) return;

        this.startFaceVerification('clock-out');
    },

    startFaceVerification(action) {
        storage.set('pending_attendance_action', action);
        router.navigate('face-recognition');
    },

    // Process attendance after face recognition verification
    async processWithVerification(action, verificationData) {
        const now = this.getVerificationDate(verificationData);
        const timeStr = dateTime.formatTime(now);
        this.localMutationVersion += 1;

        switch (action) {
            case 'clock-in':
                this.attendanceData.clockIn = timeStr;
                this.attendanceData.status = 'ontime';
                this.currentState = 'clocked-in';
                toast.success(`Masuk berhasil: ${timeStr}`);
                break;
            case 'break':
                this.attendanceData.breakStart = timeStr;
                toast.info(`Mulai istirahat 1: ${timeStr}`);
                this.currentState = 'on-break';
                break;
            case 'after-break':
                this.attendanceData.breakEnd = timeStr;
                toast.success(`Selesai istirahat 1: ${timeStr}`);
                this.currentState = 'clocked-in';
                break;
            case 'break-2':
                this.attendanceData.break2Start = timeStr;
                toast.info(`Mulai istirahat 2: ${timeStr}`);
                this.currentState = 'on-break';
                break;
            case 'after-break-2':
                this.attendanceData.break2End = timeStr;
                toast.success(`Selesai istirahat 2: ${timeStr}`);
                this.currentState = 'clocked-in';
                break;
            case 'overtime':
                this.attendanceData.overtimeStart = timeStr;
                toast.info(`Mulai lembur: ${timeStr}`);
                break;
            case 'clock-out':
                this.attendanceData.clockOut = timeStr;
                this.currentState = 'completed';
                toast.success(`Pulang berhasil: ${timeStr}`);
                break;
        }

        const logEntry = this.buildVerificationLog(action, timeStr, verificationData);
        const logs = this.normalizeAttendanceLogs(this.attendanceData.attendanceLogs)
            .filter(item => String(item.action || '') !== String(action));
        logs.push(logEntry);
        this.attendanceData.attendanceLogs = logs;
        this.applyVerificationEvidence(action, verificationData);

        // Save latest verification data for backward compatibility
        this.attendanceData.verification = {
            timestamp: verificationData.timestamp,
            location: verificationData.location,
            photo: verificationData.photo
        };
        this.attendanceData.verificationTimestamp = verificationData.timestamp;
        this.attendanceData.verificationLocation = this.serializeVerificationLocation(verificationData.location);
        this.attendanceData.verificationPhoto = verificationData.photo || '';
        this.attendanceData.clientUpdatedAt = new Date().toISOString();

        this.setCurrentState();
        this.syncAttendanceCache();
        this.updateUI();
        this.renderTimeline();
        this.renderHistory(this.getCachedAttendanceHistory());

        this.attendanceSaveInFlight += 1;
        try {
            await this.saveAttendance();
        } finally {
            this.attendanceSaveInFlight = Math.max(0, this.attendanceSaveInFlight - 1);
        }

        this.setCurrentState();
        this.updateUI();
        this.renderTimeline();
        await this.loadAttendanceHistory({ force: true });

        // Clean up temp data
        storage.remove('temp_attendance');
        storage.remove('pending_attendance_action');
    },

    getVerificationDate(verificationData = {}) {
        const verifiedAt = verificationData.timestamp ? new Date(verificationData.timestamp) : null;
        return verifiedAt && !Number.isNaN(verifiedAt.getTime()) ? verifiedAt : new Date();
    },

    getVerificationEvidenceFields(action) {
        const fieldsByAction = {
            'clock-in': { photo: 'clockInPhoto', location: 'clockInLocation', timestamp: 'clockInTimestamp' },
            'break': { photo: 'breakStartPhoto', location: 'breakStartLocation', timestamp: 'breakStartTimestamp' },
            'after-break': { photo: 'breakEndPhoto', location: 'breakEndLocation', timestamp: 'breakEndTimestamp' },
            'break-2': { photo: 'break2StartPhoto', location: 'break2StartLocation', timestamp: 'break2StartTimestamp' },
            'after-break-2': { photo: 'break2EndPhoto', location: 'break2EndLocation', timestamp: 'break2EndTimestamp' },
            'overtime': { photo: 'overtimeStartPhoto', location: 'overtimeStartLocation', timestamp: 'overtimeStartTimestamp' },
            'clock-out': { photo: 'clockOutPhoto', location: 'clockOutLocation', timestamp: 'clockOutTimestamp' }
        };
        return fieldsByAction[action] || null;
    },

    getVerificationEvidenceFieldNames() {
        const names = [];
        ['clock-in', 'break', 'after-break', 'break-2', 'after-break-2', 'overtime', 'clock-out'].forEach(action => {
            const fields = this.getVerificationEvidenceFields(action);
            if (fields) names.push(fields.photo, fields.location, fields.timestamp);
        });
        return names;
    },

    serializeVerificationLocation(location) {
        if (!location) return '';
        if (typeof location === 'string') return location;
        try {
            return JSON.stringify(location);
        } catch (e) {
            return '';
        }
    },

    applyVerificationEvidence(action, verificationData = {}) {
        const fields = this.getVerificationEvidenceFields(action);
        if (!fields) return;

        this.attendanceData[fields.photo] = verificationData.photo || '';
        this.attendanceData[fields.location] = this.serializeVerificationLocation(verificationData.location);
        this.attendanceData[fields.timestamp] = verificationData.timestamp || '';
    },

    getCachedAttendanceHistory() {
        const currentUser = auth.getCurrentUser();
        const userId = String(currentUser?.id || 'demo-user');
        return storage.get('attendance', []).filter(row => String(row.userId || '') === userId);
    },

    buildVerificationLog(action, time, verificationData) {
        const labels = {
            'clock-in': 'Masuk',
            'break': 'Istirahat 1',
            'after-break': 'Selesai Istirahat 1',
            'break-2': 'Istirahat 2',
            'after-break-2': 'Selesai Istirahat 2',
            'overtime': 'Lembur',
            'clock-out': 'Pulang'
        };

        return {
            action,
            label: labels[action] || action,
            time,
            timestamp: verificationData.timestamp,
            location: verificationData.location || '',
            photo: verificationData.photo || ''
        };
    },

    async saveAttendance() {
        const currentUser = auth.getCurrentUser();
        this.attendanceData.userId = currentUser?.id || 'demo-user';
        const payload = {
            ...this.attendanceData,
            attendanceLogs: JSON.stringify(this.getPersistableAttendanceLogs())
        };

        try {
            const result = await api.saveAttendance(payload);
            if (result && result.success && result.data) {
                // Keep the frontend in sync with server-calculated data (especially 'status')
                this.attendanceData = this.mergeAttendanceRecords(this.attendanceData, result.data);
            }
            this.syncAttendanceCache();
        } catch (error) {
            console.error('Error saving attendance:', error);
            this.syncAttendanceCache();
        }
    },

    syncAttendanceCache() {
        const currentUser = auth.getCurrentUser();
        const userId = String(currentUser?.id || 'demo-user');
        const allData = storage.get('attendance', []);
        const idx = allData.findIndex(d =>
            String(d.userId || '') === userId &&
            String(d.date || '') === String(this.attendanceData.date || '')
        );

        const cachedRecord = {
            ...this.attendanceData,
            userId,
            attendanceLogs: this.normalizeAttendanceLogs(this.attendanceData.attendanceLogs)
        };

        if (idx >= 0) {
            allData[idx] = cachedRecord;
        } else {
            allData.unshift(cachedRecord);
        }

        storage.set('attendance', allData);
    },

    mergeAttendanceRecords(currentRecord = {}, incomingRecord = {}) {
        const current = this.normalizeAttendance(currentRecord || {});
        const incoming = this.normalizeAttendance(incomingRecord || {});
        const merged = { ...current, ...incoming };
        const stickyFields = [
            'clockIn',
            'breakStart',
            'breakEnd',
            'break2Start',
            'break2End',
            'overtimeStart',
            'clockOut',
            'verificationPhoto',
            'verificationLocation',
            'verificationTimestamp'
        ].concat(this.getVerificationEvidenceFieldNames());

        stickyFields.forEach(field => {
            if (!incoming[field] && current[field]) {
                merged[field] = current[field];
            }
        });

        merged.attendanceLogs = this.mergeAttendanceLogs(current.attendanceLogs, incoming.attendanceLogs);
        return this.normalizeAttendance(merged);
    },

    mergeAttendanceLogs(currentLogs, incomingLogs) {
        const mergedByAction = new Map();

        [...this.normalizeAttendanceLogs(currentLogs), ...this.normalizeAttendanceLogs(incomingLogs)].forEach(log => {
            const action = String(log?.action || log?.label || '').trim();
            if (!action) return;

            const existing = mergedByAction.get(action) || {};
            mergedByAction.set(action, {
                ...existing,
                ...log,
                photo: log.photo || existing.photo || '',
                location: log.location || existing.location || '',
                timestamp: log.timestamp || existing.timestamp || '',
                time: log.time || existing.time || ''
            });
        });

        return Array.from(mergedByAction.values());
    },

    updateUI() {
        this.updateShiftInfo();

        // Update status ring
        const statusRing = document.querySelector('.status-ring');
        const statusIcon = document.querySelector('.status-icon i');
        const statusText = document.querySelector('.status-text');
        const statusSubtext = document.querySelector('.status-subtext');

        if (statusIcon) {
            statusIcon.className = 'fas fa-clock';
        }

        if (statusRing) {
            statusRing.className = 'status-ring';

            switch (this.currentState) {
                case 'libur':
                    statusRing.classList.add('waiting'); // Reuse waiting style or custom if desired
                    if (statusIcon) statusIcon.className = 'fas fa-calendar-times';
                    if (statusText) statusText.textContent = 'Hari Libur';
                    if (statusSubtext) statusSubtext.textContent = 'Anda tidak memiliki jadwal kerja hari ini.';
                    break;
                case 'on-leave': {
                    const leaveInfo = this.activeAttendanceLeave || {};
                    statusRing.classList.add('waiting');
                    if (statusIcon) statusIcon.className = this.getAttendanceLeaveIcon(leaveInfo);
                    if (statusText) statusText.textContent = `Sedang ${leaveInfo.label || 'Izin/Cuti'}`;
                    if (statusSubtext) {
                        const start = this.formatLeaveLockDate(leaveInfo.startDate);
                        const end = this.formatLeaveLockDate(leaveInfo.endDate || leaveInfo.startDate);
                        statusSubtext.textContent = start === end ? start : `${start} - ${end}`;
                    }
                    break;
                }
                case 'waiting':
                    statusRing.classList.add('waiting');
                    if (statusText) statusText.textContent = 'Siap Masuk';
                    if (statusSubtext) statusSubtext.textContent = 'Tekan tombol di bawah untuk memulai';
                    break;
                case 'clocked-in':
                    statusRing.classList.add('active');
                    if (statusText) statusText.textContent = 'Sedang Bekerja';
                    if (statusSubtext) statusSubtext.textContent = 'Semangat bekerja!';
                    break;
                case 'on-break':
                    statusRing.classList.add('on-break');
                    if (statusText) statusText.textContent = 'Sedang Istirahat';
                    if (statusSubtext) statusSubtext.textContent = 'Nikmati waktu istirahat Anda';
                    break;
                case 'completed':
                    statusRing.classList.add('completed');
                    if (statusText) statusText.textContent = 'Selesai Bekerja';
                    if (statusSubtext) statusSubtext.textContent = 'Terima kasih atas kerja kerasnya!';
                    break;
            }
        }

        // Update buttons
        const btnClockIn = document.getElementById('btn-clock-in');
        const btnBreak = document.getElementById('btn-break');
        const btnAfterBreak = document.getElementById('btn-after-break');
        const btnBreak2 = document.getElementById('btn-break-2');
        const btnAfterBreak2 = document.getElementById('btn-after-break-2');
        const btnOvertime = document.getElementById('btn-overtime');
        const btnClockOut = document.getElementById('btn-clock-out');
        this.updateBreakButtonVisibility();
        const isAttendanceLocked = this.currentState === 'on-leave';

        // Clock In button
        if (btnClockIn) {
            const isClockedIn = this.attendanceData.clockIn !== null && this.attendanceData.clockIn !== undefined;
            const isLibur = this.currentState === 'libur';

            btnClockIn.disabled = isClockedIn || isLibur || isAttendanceLocked;

            if (isClockedIn) {
                btnClockIn.classList.add('completed');
                const timeEl = document.getElementById('clock-in-time');
                if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.clockIn);
            } else if (isLibur) {
                btnClockIn.classList.add('completed');
            } else {
                btnClockIn.classList.remove('completed');
            }
        }

        // Break button
        if (btnBreak) {
            btnBreak.disabled = isAttendanceLocked || !this.canStartBreak1();
            btnBreak.classList.remove('completed');
            const breakTimeEl = document.getElementById('break-time');
            if (breakTimeEl) breakTimeEl.textContent = this.formatHistoryTime(this.attendanceData.breakStart) || '--:--';
            if (this.attendanceData.breakStart) {
                btnBreak.classList.add('completed');
            }
        }

        // After Break button
        if (btnAfterBreak) {
            btnAfterBreak.disabled = isAttendanceLocked || !this.canEndBreak1();
            btnAfterBreak.classList.remove('completed');
            const afterBreakTimeEl = document.getElementById('after-break-time');
            if (afterBreakTimeEl) afterBreakTimeEl.textContent = this.formatHistoryTime(this.attendanceData.breakEnd) || '--:--';
            if (this.attendanceData.breakEnd) {
                btnAfterBreak.classList.add('completed');
            }
        }

        // Break 2 button
        if (btnBreak2) {
            btnBreak2.disabled = isAttendanceLocked || !this.canStartBreak2();
            btnBreak2.classList.remove('completed');
            const break2TimeEl = document.getElementById('break-2-time');
            if (break2TimeEl) break2TimeEl.textContent = this.formatHistoryTime(this.attendanceData.break2Start) || '--:--';
            if (this.attendanceData.break2Start) {
                btnBreak2.classList.add('completed');
            }
        }

        // After Break 2 button
        if (btnAfterBreak2) {
            btnAfterBreak2.disabled = isAttendanceLocked || !this.canEndBreak2();
            btnAfterBreak2.classList.remove('completed');
            const afterBreak2TimeEl = document.getElementById('after-break-2-time');
            if (afterBreak2TimeEl) afterBreak2TimeEl.textContent = this.formatHistoryTime(this.attendanceData.break2End) || '--:--';
            if (this.attendanceData.break2End) {
                btnAfterBreak2.classList.add('completed');
            }
        }

        // Overtime button
        if (btnOvertime) {
            btnOvertime.disabled = isAttendanceLocked || !this.attendanceData.clockIn || this.attendanceData.clockOut !== null;
            if (this.attendanceData.overtimeStart) {
                btnOvertime.classList.add('completed');
                document.getElementById('overtime-time').textContent = this.formatHistoryTime(this.attendanceData.overtimeStart);
            }
        }

        // Clock Out button
        if (btnClockOut) {
            btnClockOut.disabled = isAttendanceLocked || !this.attendanceData.clockIn || this.attendanceData.clockOut !== null;
            if (this.attendanceData.clockOut) {
                btnClockOut.classList.add('completed');
                document.getElementById('clock-out-time').textContent = this.formatHistoryTime(this.attendanceData.clockOut);
            }
        }
    },

    getAttendanceLeaveIcon(leaveInfo = {}) {
        const source = String(leaveInfo.source || '').toLowerCase();
        const label = String(leaveInfo.label || '').toLowerCase();

        if (label.includes('sakit')) return 'fas fa-notes-medical';
        if (source === 'izin') return 'fas fa-user-clock';
        if (source === 'cuti' || label.includes('cuti')) return 'fas fa-umbrella-beach';
        return 'fas fa-calendar-check';
    },

    renderTimeline() {
        const timeline = document.getElementById('attendance-timeline');
        if (!timeline) return;

        this.renderTimelineItems(timeline);
        const items = timeline.querySelectorAll('.timeline-item');

        items.forEach(item => {
            const type = item.dataset.type;
            const timeEl = item.querySelector('.timeline-time');

            item.className = 'timeline-item pending';

            switch (type) {
                case 'clock-in':
                    if (this.attendanceData.clockIn) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.clockIn);
                    }
                    break;
                case 'break':
                    if (this.attendanceData.breakStart) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.breakStart);
                    }
                    break;
                case 'after-break':
                    if (this.attendanceData.breakEnd) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.breakEnd);
                    }
                    break;
                case 'break-2':
                    if (this.attendanceData.break2Start) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.break2Start);
                    }
                    break;
                case 'after-break-2':
                    if (this.attendanceData.break2End) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.break2End);
                    }
                    break;
                case 'clock-out':
                    if (this.attendanceData.clockOut) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.formatHistoryTime(this.attendanceData.clockOut);
                    }
                    break;
            }
        });

        // Set active state for current
        if (this.currentState === 'clocked-in' && !this.attendanceData.clockOut) {
            const activeItem = timeline.querySelector('.timeline-item.completed:last-child');
            if (activeItem && activeItem.nextElementSibling) {
                activeItem.nextElementSibling.classList.add('active');
            }
        } else if (this.currentState === 'on-break') {
            const activeBreakType = this.getActiveBreakSession() === 2 ? 'break-2' : 'break';
            const breakItem = timeline.querySelector(`[data-type="${activeBreakType}"]`);
            if (breakItem) {
                breakItem.classList.remove('completed');
                breakItem.classList.add('active');
            }
        }
    },

    updateShiftInfo() {
        const shiftName = this.getCurrentShiftName() || this.getScheduledShiftName();
        const shiftNameEl = document.getElementById('current-shift-name');
        const shiftTimeEl = document.getElementById('current-shift-time');
        const shifts = storage.get('shifts', []) || [];
        const shift = shifts.find(item => String(item.name || '') === String(shiftName));

        if (shiftNameEl) shiftNameEl.textContent = shiftName || '-';
        if (shiftTimeEl) {
            if (shiftName === 'Libur') {
                shiftTimeEl.textContent = 'Hari libur';
            } else if (shift?.startTime && shift?.endTime) {
                shiftTimeEl.textContent = `${shift.startTime} - ${shift.endTime}`;
            } else {
                shiftTimeEl.textContent = '--:-- - --:--';
            }
        }
    },

    getCurrentShiftName() {
        return String(this.attendanceData.shift || auth.getCurrentUser()?.shift || '').trim();
    },

    getMaxBreakSessions() {
        return this.getCurrentShiftName().toLowerCase().includes('pagi') ? 2 : 1;
    },

    getActiveBreakSession(data = this.attendanceData) {
        if (data.break2Start && !data.break2End) return 2;
        if (data.breakStart && !data.breakEnd) return 1;
        return 0;
    },

    isOnAnyBreak(data = this.attendanceData) {
        return this.getActiveBreakSession(data) > 0;
    },

    canStartBreak() {
        return this.canStartBreak1() || this.canStartBreak2();
    },

    canEndBreak() {
        return Boolean(this.attendanceData.clockIn && !this.attendanceData.clockOut && this.isOnAnyBreak());
    },

    canStartBreak1() {
        return Boolean(
            this.attendanceData.clockIn &&
            !this.attendanceData.clockOut &&
            !this.isOnAnyBreak() &&
            !this.attendanceData.breakStart
        );
    },

    canEndBreak1() {
        return Boolean(
            this.attendanceData.clockIn &&
            !this.attendanceData.clockOut &&
            this.attendanceData.breakStart &&
            !this.attendanceData.breakEnd
        );
    },

    canStartBreak2() {
        return Boolean(
            this.getMaxBreakSessions() > 1 &&
            this.attendanceData.clockIn &&
            !this.attendanceData.clockOut &&
            !this.isOnAnyBreak() &&
            this.attendanceData.breakEnd &&
            !this.attendanceData.break2Start
        );
    },

    canEndBreak2() {
        return Boolean(
            this.getMaxBreakSessions() > 1 &&
            this.attendanceData.clockIn &&
            !this.attendanceData.clockOut &&
            this.attendanceData.break2Start &&
            !this.attendanceData.break2End
        );
    },

    updateBreakButtonVisibility() {
        const isTwoBreakShift = this.getMaxBreakSessions() > 1;
        const breakLabel = document.querySelector('#btn-break .btn-label');
        const afterBreakLabel = document.querySelector('#btn-after-break .btn-label');
        const btnBreak2 = document.getElementById('btn-break-2');
        const btnAfterBreak2 = document.getElementById('btn-after-break-2');

        if (breakLabel) breakLabel.textContent = isTwoBreakShift ? 'Istirahat 1' : 'Istirahat';
        if (afterBreakLabel) afterBreakLabel.textContent = isTwoBreakShift ? 'Selesai Istirahat 1' : 'Selesai Istirahat';
        if (btnBreak2) btnBreak2.style.display = isTwoBreakShift ? '' : 'none';
        if (btnAfterBreak2) btnAfterBreak2.style.display = isTwoBreakShift ? '' : 'none';
    },

    renderTimelineItems(timeline) {
        const breakItems = this.getMaxBreakSessions() > 1
            ? `
                <div class="timeline-item pending" data-type="break">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content"><span class="timeline-title">Istirahat 1</span><span class="timeline-time">--:--</span></div>
                </div>
                <div class="timeline-item pending" data-type="after-break">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content"><span class="timeline-title">Selesai Istirahat 1</span><span class="timeline-time">--:--</span></div>
                </div>
                <div class="timeline-item pending" data-type="break-2">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content"><span class="timeline-title">Istirahat 2</span><span class="timeline-time">--:--</span></div>
                </div>
                <div class="timeline-item pending" data-type="after-break-2">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content"><span class="timeline-title">Selesai Istirahat 2</span><span class="timeline-time">--:--</span></div>
                </div>
            `
            : `
                <div class="timeline-item pending" data-type="break">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content"><span class="timeline-title">Istirahat</span><span class="timeline-time">--:--</span></div>
                </div>
                <div class="timeline-item pending" data-type="after-break">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content"><span class="timeline-title">Selesai Istirahat</span><span class="timeline-time">--:--</span></div>
                </div>
            `;

        timeline.innerHTML = `
            <div class="timeline-item pending" data-type="clock-in">
                <div class="timeline-dot"></div>
                <div class="timeline-content"><span class="timeline-title">Masuk</span><span class="timeline-time">--:--</span></div>
            </div>
            ${breakItems}
            <div class="timeline-item pending" data-type="clock-out">
                <div class="timeline-dot"></div>
                <div class="timeline-content"><span class="timeline-title">Pulang</span><span class="timeline-time">--:--</span></div>
            </div>
        `;
    }
};

// Global init function
window.initAbsensi = () => {
    absensi.init();
};

window.absensi = absensi;
