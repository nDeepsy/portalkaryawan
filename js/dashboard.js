/**
 * Portal Karyawan - Dashboard
 * Employee dashboard backed by actual database data
 */

const dashboard = {
    initialized: false,
    attendanceData: [],
    leaves: [],
    izin: [],
    journals: [],
    employees: [],
    allAttendance: [],
    loadingPromise: null,
    lastLoadedAt: 0,
    refreshTtl: 30000,
    dataUpdateBound: false,

    async init() {
        this.bindDataUpdateEvents();
        this.loadCachedData();
        this.renderDashboard();

        if (this.loadingPromise) {
            return;
        }

        if (Date.now() - this.lastLoadedAt < this.refreshTtl) return;

        this.loadingPromise = this.loadData().finally(() => {
            this.loadingPromise = null;
            this.lastLoadedAt = Date.now();
            this.initialized = true;
        });
    },

    bindDataUpdateEvents() {
        if (this.dataUpdateBound) return;
        window.addEventListener('dataUpdated', (event) => this.handleDataUpdated(event));
        this.dataUpdateBound = true;
    },

    async handleDataUpdated(event) {
        const detail = event?.detail || {};
        const relevantTypes = ['settings', 'employees', 'attendance', 'journals', 'leaves', 'izin'];
        if (!relevantTypes.includes(detail.type)) return;
        if (router?.currentPage !== 'dashboard') return;
        if (!auth.isKaryawan || !auth.isKaryawan()) return;

        this.lastLoadedAt = 0;
        this.loadCachedData();
        this.renderDashboard();
        if (this.loadingPromise) await this.loadingPromise;
        this.loadingPromise = this.loadData().finally(() => {
            this.loadingPromise = null;
            this.lastLoadedAt = Date.now();
            this.initialized = true;
        });
        await this.loadingPromise;
    },

    resetData() {
        this.attendanceData = [];
        this.leaves = [];
        this.izin = [];
        this.journals = [];
        this.employees = [];
        this.allAttendance = [];
    },

    renderDashboard() {
        this.updateWelcomeCard();
        this.updateStats();
        this.updateSessionInfo();
        this.updateProgressBar();
        this.renderWeeklyAttendance();
        this.renderRecentActivity();
        this.renderTeamPresence();
    },

    renderLoadingState() {
        const donutValue = document.querySelector('.donut-value');
        if (donutValue) donutValue.textContent = '0%';
        this.updateDonutChart(0, 0, 0);

        const legendValues = document.querySelectorAll('.stats-card .legend-value');
        legendValues.forEach(el => { el.textContent = '0 hari'; });

        const clockInEl = document.getElementById('dashboard-clock-in');
        const clockOutEl = document.getElementById('dashboard-clock-out');
        const durationEl = document.getElementById('dashboard-duration');
        if (clockInEl) clockInEl.textContent = '--:--';
        if (clockOutEl) clockOutEl.textContent = '--:--';
        if (durationEl) durationEl.textContent = '0j 0m';

        const statusBadge = document.querySelector('.session-card .status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'Memuat';
            statusBadge.className = 'status-badge';
        }

        const chart = document.querySelector('.chart-card .bar-chart');
        if (chart) {
            const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
            chart.innerHTML = labels.map((label, index) => `
                <div class="bar-item">
                    <div class="bar-fill ${index >= 5 ? 'weekend' : ''}" style="height:0%"></div>
                    <span class="bar-label">${label}</span>
                </div>
            `).join('');
        }

        const activityList = document.querySelector('.activity-card .activity-list');
        if (activityList) activityList.innerHTML = '<div class="empty-state">Memuat aktivitas...</div>';

        const teamCount = document.querySelector('.team-card .team-count');
        if (teamCount) teamCount.textContent = '0 orang';
        const avatarStack = document.querySelector('.team-card .avatar-stack');
        if (avatarStack) avatarStack.innerHTML = '<div class="empty-state">Memuat tim...</div>';
        const presenceStats = document.querySelector('.team-card .presence-stats');
        if (presenceStats) {
            presenceStats.innerHTML = `
                <div class="presence-item"><span class="presence-dot online"></span><span>0 Online</span></div>
                <div class="presence-item"><span class="presence-dot offline"></span><span>0 Offline</span></div>
            `;
        }
    },

    loadCachedData() {
        const currentUser = auth.getCurrentUser();
        const userId = String(currentUser?.id || '');
        const cachedUserAttendance = userId ? storage.get(`attendance_${userId}`, null) : null;
        this.attendanceData = Array.isArray(cachedUserAttendance)
            ? cachedUserAttendance
            : this.filterRowsByUser(storage.get('attendance', []) || [], userId);
        this.leaves = this.filterRowsByUser(storage.get('leaves', []) || [], userId);
        this.izin = this.filterRowsByUser(storage.get('izin', []) || [], userId);
        this.journals = this.filterRowsByUser(storage.get('jurnals', []) || [], userId);
        this.employees = storage.get('admin_employees', []) || [];
        this.allAttendance = storage.get('attendance', []) || [];
    },

    async loadData() {
        try {
            const currentUser = auth.getCurrentUser();
            if (!currentUser?.id) return;

            const userId = String(currentUser.id);
            const batchResult = await api.batch([
                { key: 'attendance', action: 'getAttendance', userId },
                { key: 'settings', action: 'getSettings' },
                { key: 'shifts', action: 'getShifts' },
                { key: 'leaves', action: 'getLeaves', userId },
                { key: 'izin', action: 'getIzin', userId },
                { key: 'journals', action: 'getJournals', userId },
                { key: 'employees', action: 'getEmployees' },
                { key: 'allAttendance', action: 'getAllAttendance' }
            ]);
            const batch = batchResult?.data || {};
            const attResult = batch.attendance;
            const settingsRes = batch.settings;
            const shiftsResult = batch.shifts;
            const leaveResult = batch.leaves;
            const izinResult = batch.izin;
            const journalResult = batch.journals;
            const empResult = batch.employees;
            const allAttResult = batch.allAttendance;

            if (attResult?.success) {
                this.attendanceData = this.filterRowsByUser(attResult.data || [], userId);
                storage.set(`attendance_${userId}`, this.attendanceData);
            } else {
                this.attendanceData = [];
            }
            if (leaveResult?.success) {
                this.leaves = this.filterRowsByUser(leaveResult.data || [], userId);
                storage.set('leaves', this.mergeUserRows(storage.get('leaves', []) || [], this.leaves, userId));
            } else {
                this.leaves = [];
            }
            if (izinResult?.success) {
                this.izin = this.filterRowsByUser(izinResult.data || [], userId);
                storage.set('izin', this.mergeUserRows(storage.get('izin', []) || [], this.izin, userId));
            } else {
                this.izin = [];
            }
            if (journalResult?.success) {
                this.journals = this.filterRowsByUser(journalResult.data || [], userId);
                storage.set('jurnals', this.mergeUserRows(storage.get('jurnals', []) || [], this.journals, userId));
            } else {
                this.journals = [];
            }
            if (empResult?.success) {
                this.employees = empResult.data || [];
                storage.set('admin_employees', this.employees);
            }
            if (allAttResult?.success) {
                this.allAttendance = allAttResult.data || [];
                storage.set('attendance', this.allAttendance);
            }
            if (shiftsResult?.success) storage.set('shifts', shiftsResult.data || []);
            if (settingsRes?.success && settingsRes.data) this.cacheSchedules(settingsRes.data);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            this.renderDashboard();
        }
    },

    filterRowsByUser(rows, userId) {
        if (!Array.isArray(rows) || !userId) return [];
        return rows.filter(row => String(row?.userId || row?.user_id || '') === String(userId));
    },

    mergeUserRows(existingRows, userRows, userId) {
        const retainedRows = (existingRows || []).filter(row => {
            const rowUserId = String(row?.userId || row?.user_id || '');
            return rowUserId && rowUserId !== String(userId);
        });
        return [...userRows, ...retainedRows];
    },

    usesRemoteApi() {
        return typeof API_BASE_URL !== 'undefined' && Boolean(API_BASE_URL);
    },

    cacheSchedules(settingsData) {
        const loadedSchedules = {};
        Object.keys(settingsData).forEach(key => {
            if (!key.startsWith('shift_schedule_')) return;
            try {
                loadedSchedules[key.replace('shift_schedule_', '')] = JSON.parse(settingsData[key]);
            } catch (e) { }
        });
        if (Object.keys(loadedSchedules).length) storage.set('shift_schedule', loadedSchedules);
    },

    getLocalDate(value) {
        if (!value) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
        return new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    getCurrentShiftName() {
        const currentUser = auth.getCurrentUser();
        let currentShiftName = currentUser?.shift || 'Pagi';

        try {
            const userId = String(currentUser?.id);
            const schedules = storage.get('shift_schedule', {});
            const todayObj = new Date();
            const key = `${todayObj.getFullYear()}-${todayObj.getMonth()}`;
            const assignedShift = schedules[key]?.[userId]?.[todayObj.getDate()];
            if (assignedShift) currentShiftName = assignedShift;
        } catch (e) {
            console.error('Error reading shift schedule:', e);
        }

        return currentShiftName;
    },

    updateWelcomeCard() {
        const welcomeCard = document.querySelector('.welcome-card');
        const greetingEl = document.querySelector('.welcome-content h2');
        const shiftEl = document.getElementById('welcome-shift');
        const iconEl = document.querySelector('.welcome-illustration i');
        if (!welcomeCard || !greetingEl) return;

        const currentShiftName = this.getCurrentShiftName();
        const greetingConfig = this.getDashboardGreeting(currentShiftName);

        const userName = auth.getCurrentUser()?.name?.split(' ')[0] || 'User';
        greetingEl.innerHTML = `${greetingConfig.greeting}, <span id="welcome-name">${this.escapeHtml(userName)}</span>!`;
        if (iconEl) iconEl.className = `fas ${greetingConfig.icon}`;
        welcomeCard.className = `welcome-card ${greetingConfig.className}`;

        const shifts = storage.get('shifts', []);
        const activeShift = shifts.find(s => s.name === currentShiftName);

        if (shiftEl) {
            shiftEl.textContent = currentShiftName === 'Libur'
                ? 'Shift: Libur (Tidak ada jadwal)'
                : `Shift: ${currentShiftName}${activeShift ? ` (${activeShift.startTime} - ${activeShift.endTime})` : ''}`;
        }
    },

    getDashboardGreeting(currentShiftName = '') {
        const shiftGreeting = this.getShiftGreeting(currentShiftName);
        if (shiftGreeting) return shiftGreeting;

        const hour = new Date().getHours();
        if (hour >= 11 && hour < 15) {
            return { greeting: 'Selamat Siang', icon: 'fa-sun', className: 'afternoon' };
        }
        if (hour >= 15 && hour < 18) {
            return { greeting: 'Selamat Sore', icon: 'fa-cloud-sun', className: 'evening' };
        }
        if (hour >= 18 || hour < 4) {
            return { greeting: 'Selamat Malam', icon: 'fa-moon', className: 'evening' };
        }

        return { greeting: 'Selamat Pagi', icon: 'fa-sun', className: 'morning' };
    },

    getShiftGreeting(currentShiftName = '') {
        const normalized = String(currentShiftName || '').toLowerCase();
        if (normalized.includes('malam')) {
            return { greeting: 'Selamat Malam', icon: 'fa-moon', className: 'evening' };
        }
        if (normalized.includes('siang')) {
            return { greeting: 'Selamat Siang', icon: 'fa-sun', className: 'afternoon' };
        }
        return null;
    },

    updateStats() {
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        const monthAttendance = this.attendanceData.filter(a => {
            const date = new Date(this.getLocalDate(a.date));
            return date.getMonth() === month && date.getFullYear() === year;
        });

        const present = monthAttendance.filter(a => a.clockIn && !this.isLate(a.status)).length;
        const late = monthAttendance.filter(a => a.clockIn && this.isLate(a.status)).length;
        const absentFromAttendance = monthAttendance.filter(a => {
            const status = String(a.status || '').toLowerCase();
            return status === 'absent' || status === 'tidak hadir' || (!a.clockIn && status && status !== 'waiting');
        }).length;
        const approvedLeaves = this.leaves.filter(l => {
            const status = String(l.status || '').toLowerCase();
            const start = new Date(this.getLocalDate(l.startDate));
            return status === 'approved' && start.getMonth() === month && start.getFullYear() === year;
        }).reduce((sum, item) => sum + (parseInt(item.duration, 10) || 1), 0);
        const approvedIzin = this.izin.filter(i => {
            const status = String(i.status || '').toLowerCase();
            const date = new Date(this.getLocalDate(i.date));
            return status === 'approved' && date.getMonth() === month && date.getFullYear() === year;
        }).reduce((sum, item) => sum + (parseInt(item.duration, 10) || 1), 0);
        const absent = absentFromAttendance + approvedLeaves + approvedIzin;
        const total = present + late + absent;
        const presentPercent = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

        const donutValue = document.querySelector('.donut-value');
        if (donutValue) donutValue.textContent = `${presentPercent}%`;
        this.updateDonutChart(present, late, absent);

        const legendValues = document.querySelectorAll('.stats-card .legend-value');
        if (legendValues.length >= 3) {
            legendValues[0].textContent = `${present} hari`;
            legendValues[1].textContent = `${late} hari`;
            legendValues[2].textContent = `${absent} hari`;
        }
    },

    updateDonutChart(present, late, absent) {
        const circumference = 251;
        const total = present + late + absent;
        const segments = [
            { selector: '.donut-fill.present', value: present },
            { selector: '.donut-fill.late', value: late },
            { selector: '.donut-fill.absent', value: absent }
        ];

        let offset = 0;
        segments.forEach(segment => {
            const el = document.querySelector(segment.selector);
            if (!el) return;
            const length = total > 0 ? (segment.value / total) * circumference : 0;
            el.style.strokeDasharray = `${length} ${circumference}`;
            el.style.strokeDashoffset = `${-offset}`;
            offset += length;
        });
    },

    isLate(status) {
        const normalized = String(status || '').toLowerCase();
        return normalized === 'late' || normalized === 'terlambat';
    },

    updateSessionInfo() {
        const today = dateTime.getLocalDate();
        const todayAttendance = this.attendanceData.find(a => this.getLocalDate(a.date) === today);
        const clockInEl = document.getElementById('dashboard-clock-in');
        const clockOutEl = document.getElementById('dashboard-clock-out');
        const durationEl = document.getElementById('dashboard-duration');
        const statusBadge = document.querySelector('.session-card .status-badge');

        if (clockInEl) clockInEl.textContent = dateTime.formatClockTime(todayAttendance?.clockIn) || '--:--';
        if (clockOutEl) clockOutEl.textContent = dateTime.formatClockTime(todayAttendance?.clockOut) || '--:--';
        if (durationEl) {
            durationEl.textContent = todayAttendance?.clockIn && todayAttendance?.clockOut
                ? dateTime.calculateDuration(todayAttendance.clockIn, todayAttendance.clockOut)
                : '0j 0m';
        }
        if (statusBadge) {
            const statusText = todayAttendance?.clockIn && !todayAttendance?.clockOut ? 'Aktif' : (todayAttendance?.clockOut ? 'Selesai' : 'Belum Absen');
            statusBadge.textContent = statusText;
            statusBadge.className = `status-badge ${statusText === 'Aktif' ? 'active' : ''}`;
        }
    },

    updateProgressBar() {
        const progressFill = document.getElementById('work-progress');
        if (!progressFill) return;

        const shifts = storage.get('shifts', []);
        const shiftName = this.getCurrentShiftName();
        const activeShift = shifts.find(s => s.name === shiftName);
        if (!activeShift || shiftName === 'Libur') {
            progressFill.style.width = '0%';
            return;
        }

        const now = new Date();
        const [startH, startM] = String(activeShift.startTime || '08:00').split(':').map(Number);
        const [endH, endM] = String(activeShift.endTime || '17:00').split(':').map(Number);
        const start = startH + ((startM || 0) / 60);
        let end = endH + ((endM || 0) / 60);
        let current = now.getHours() + (now.getMinutes() / 60);
        if (end <= start) end += 24;
        if (current < start && end > 24) current += 24;
        const progress = Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100));
        progressFill.style.width = `${progress}%`;
    },

    renderWeeklyAttendance() {
        const chart = document.querySelector('.chart-card .bar-chart');
        if (!chart) return;

        const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
        const today = new Date();
        const monday = new Date(today);
        const day = today.getDay() || 7;
        monday.setDate(today.getDate() - day + 1);

        chart.innerHTML = labels.map((label, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            const dateStr = this.getLocalDate(date.toISOString());
            const record = this.attendanceData.find(a => this.getLocalDate(a.date) === dateStr);
            const isWeekend = index >= 5;
            const height = record?.clockIn ? 100 : 0;
            return `
                <div class="bar-item">
                    <div class="bar-fill ${isWeekend ? 'weekend' : ''}" style="height:${height}%"></div>
                    <span class="bar-label">${label}</span>
                </div>
            `;
        }).join('');
    },

    renderRecentActivity() {
        const list = document.querySelector('.activity-card .activity-list');
        if (!list) return;

        const activities = [];
        this.attendanceData.forEach(att => {
            if (att.clockIn) activities.push({ title: 'Masuk', time: this.combineDateTime(att.date, att.clockIn), icon: 'clock-in', className: 'fa-sign-in-alt' });
            if (att.clockOut) activities.push({ title: 'Pulang', time: this.combineDateTime(att.date, att.clockOut), icon: 'clock-out', className: 'fa-sign-out-alt' });
        });
        this.journals.forEach(j => activities.push({ title: 'Mengisi Jurnal', time: j.updatedAt || j.date, icon: 'journal', className: 'fa-book' }));
        this.leaves.forEach(l => activities.push({ title: 'Mengajukan Cuti', time: l.appliedAt || l.startDate, icon: 'leave', className: 'fa-umbrella-beach' }));
        this.izin.forEach(i => activities.push({ title: `Mengajukan ${i.typeLabel || 'Izin'}`, time: i.appliedAt || i.date, icon: 'leave', className: 'fa-notes-medical' }));
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));

        if (activities.length === 0) {
            list.innerHTML = '<div class="empty-state">Belum ada aktivitas.</div>';
            return;
        }

        list.innerHTML = activities.slice(0, 5).map(item => `
            <div class="activity-item">
                <div class="activity-icon ${item.icon}"><i class="fas ${item.className}"></i></div>
                <div class="activity-content">
                    <p class="activity-title">${this.escapeHtml(item.title)}</p>
                    <p class="activity-time">${this.escapeHtml(this.relativeTime(item.time))}</p>
                </div>
            </div>
        `).join('');
    },

    renderTeamPresence() {
        const card = document.querySelector('.team-card');
        if (!card) return;

        const currentUser = auth.getCurrentUser();
        const currentDivision = getEmployeeDivision(currentUser);
        const sameDivisionEmployees = this.employees.filter(emp => !currentDivision || getEmployeeDivision(emp) === currentDivision);
        const today = dateTime.getLocalDate();
        const presentIds = new Set((this.allAttendance.length ? this.allAttendance : this.attendanceData)
            .filter(a => this.getLocalDate(a.date) === today && a.clockIn)
            .map(a => String(a.userId)));
        const onlineIds = new Set((this.allAttendance.length ? this.allAttendance : this.attendanceData)
            .filter(a => this.getLocalDate(a.date) === today && a.clockIn && !a.clockOut)
            .map(a => String(a.userId)));
        const team = sameDivisionEmployees.length ? sameDivisionEmployees : this.employees;
        const online = team.filter(emp => onlineIds.has(String(emp.id)));
        const offlineCount = Math.max(0, team.length - online.length);
        const titleCount = card.querySelector('.team-count');
        if (titleCount) titleCount.textContent = `${team.length} orang`;

        const avatarStack = card.querySelector('.avatar-stack');
        if (avatarStack) {
            const shown = team.filter(emp => presentIds.has(String(emp.id))).slice(0, 5);
            avatarStack.innerHTML = shown.map(emp => `<img src="${getAvatarUrl(emp)}" alt="${this.escapeHtml(emp.name)}">`).join('') +
                (team.length > shown.length ? `<div class="avatar-more">+${team.length - shown.length}</div>` : '');
        }

        const presenceStats = card.querySelector('.presence-stats');
        if (presenceStats) {
            presenceStats.innerHTML = `
                <div class="presence-item"><span class="presence-dot online"></span><span>${online.length} Online</span></div>
                <div class="presence-item"><span class="presence-dot offline"></span><span>${offlineCount} Offline</span></div>
            `;
        }
    },

    combineDateTime(date, time) {
        if (!date) return new Date(0).toISOString();
        if (String(date).includes('T')) return date;
        return `${this.getLocalDate(date)}T${String(time || '00:00').replace('.', ':')}:00`;
    },

    relativeTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
        if (minutes < 1) return 'Baru saja';
        if (minutes < 60) return `${minutes} menit yang lalu`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} jam yang lalu`;
        return `${Math.floor(hours / 24)} hari yang lalu`;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};

window.initDashboard = async () => {
    await dashboard.init();
};

setInterval(() => {
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
        dashboard.updateProgressBar();
    }
}, 60000);
