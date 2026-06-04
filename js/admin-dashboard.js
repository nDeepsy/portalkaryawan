/**
 * Portal Karyawan - Admin Dashboard
 * Admin dashboard with real database-backed statistics
 */

const adminDashboard = {
    employees: [],
    attendance: [],
    leaves: [],
    izin: [],
    journals: [],
    loadingPromise: null,
    lastLoadedAt: 0,
    refreshTtl: 30000,
    selectedPeriod: 'today',
    periodFilterBound: false,

    async init() {
        if (!auth.canAccessAdminReports()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        this.bindPeriodFilter();
        this.loadCachedData();
        this.updateStats();
        this.renderCharts();
        this.renderRecentActivity();
        this.renderOnlineUsers();

        if (this.loadingPromise) {
            await this.loadingPromise;
            return;
        }

        if (Date.now() - this.lastLoadedAt < this.refreshTtl) return;

        this.loadingPromise = this.loadData().finally(() => {
            this.loadingPromise = null;
            this.lastLoadedAt = Date.now();
        });
        await this.loadingPromise;
        this.updateStats();
        this.renderCharts();
        this.renderRecentActivity();
        this.renderOnlineUsers();
    },

    bindPeriodFilter() {
        const select = document.getElementById('admin-dashboard-period');
        if (!select || this.periodFilterBound) return;

        const savedPeriod = storage.get('adminDashboardPeriod', 'today');
        this.selectedPeriod = ['today', 'week', 'month'].includes(savedPeriod) ? savedPeriod : 'today';
        select.value = this.selectedPeriod;

        select.addEventListener('change', (event) => {
            this.selectedPeriod = event.target.value || 'today';
            storage.set('adminDashboardPeriod', this.selectedPeriod);
            this.updateStats();
            this.renderCharts();
            this.renderRecentActivity();
            this.renderOnlineUsers();
        });

        this.periodFilterBound = true;
    },

    loadCachedData() {
        this.employees = storage.get('admin_employees', []) || [];
        this.attendance = storage.get('attendance', []) || [];
        this.leaves = storage.get('leaves', []) || [];
        this.izin = storage.get('izin', []) || [];
        this.journals = storage.get('jurnals', []) || [];
    },

    async loadData() {
        try {
            const batchResult = await api.batch([
                { key: 'employees', action: 'getEmployees' },
                { key: 'attendance', action: 'getAllAttendance' },
                { key: 'leaves', action: 'getAllLeaves' },
                { key: 'izin', action: 'getAllIzin' },
                { key: 'journals', action: 'getAllJournals' }
            ]);
            const batch = batchResult?.data || {};
            const empResult = batch.employees;
            const attResult = batch.attendance;
            const leaveResult = batch.leaves;
            const izinResult = batch.izin;
            const journalResult = batch.journals;
            this.employees = empResult?.data || [];
            this.attendance = attResult?.data || [];
            this.leaves = this.filterValidLeaves(leaveResult?.data || []);
            this.izin = izinResult?.data || [];
            this.journals = journalResult?.data || [];
            storage.set('admin_employees', this.employees);
            storage.set('attendance', this.attendance);
            storage.set('leaves', this.leaves);
            storage.set('izin', this.izin);
            storage.set('jurnals', this.journals);
        } catch (error) {
            console.error('Error loading admin data:', error);
            this.loadCachedData();
        }
    },

    hasValue(row, field) {
        return String(row?.[field] ?? '').trim() !== '';
    },

    filterValidLeaves(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.filter(row =>
            this.hasValue(row, 'userId') &&
            this.hasValue(row, 'type') &&
            this.hasValue(row, 'startDate') &&
            this.hasValue(row, 'endDate') &&
            this.hasValue(row, 'duration') &&
            this.hasValue(row, 'reason') &&
            this.hasValue(row, 'appliedAt')
        );
    },

    getLocalDate(value) {
        if (!value) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
        return new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    getPeriodRange(period = this.selectedPeriod) {
        const today = new Date(dateTime.getLocalDate() + 'T00:00:00');
        const start = new Date(today);
        const end = new Date(today);

        if (period === 'week') {
            const day = today.getDay() || 7;
            start.setDate(today.getDate() - day + 1);
            end.setDate(start.getDate() + 6);
        } else if (period === 'month') {
            start.setDate(1);
            end.setMonth(start.getMonth() + 1, 0);
        }

        return {
            start: this.dateToYMD(start),
            end: this.dateToYMD(end),
            label: period === 'week' ? 'Minggu Ini' : (period === 'month' ? 'Bulan Ini' : 'Hari Ini')
        };
    },

    dateToYMD(date) {
        return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    isDateInRange(value, range = this.getPeriodRange()) {
        const date = this.getLocalDate(value);
        return Boolean(date && date >= range.start && date <= range.end);
    },

    getEmployee(userId) {
        return this.employees.find(emp => String(emp.id) === String(userId));
    },

    isLate(status) {
        const normalized = String(status || '').toLowerCase();
        return normalized === 'late' || normalized === 'terlambat';
    },

    isOnLeaveInRange(empId, range = this.getPeriodRange()) {
        const leave = this.leaves.some(l =>
            String(l.userId) === String(empId) &&
            String(l.status || '').toLowerCase() === 'approved' &&
            String(l.startDate || '') <= range.end &&
            String(l.endDate || '') >= range.start
        );
        const izin = this.izin.some(i =>
            String(i.userId) === String(empId) &&
            String(i.status || '').toLowerCase() === 'approved' &&
            this.isDateInRange(i.date, range)
        );
        return leave || izin;
    },

    updateStats() {
        const totalEmployees = this.employees.length;
        const range = this.getPeriodRange();
        const attendanceInRange = this.attendance.filter(a => this.isDateInRange(a.date, range));
        const presentUserIds = new Set(attendanceInRange.filter(a => a.clockIn).map(a => String(a.userId)));
        const lateCount = attendanceInRange.filter(a => a.clockIn && this.isLate(a.status)).length;
        const onLeave = this.employees.filter(emp => this.isOnLeaveInRange(emp.id, range)).length;
        const absentCount = this.employees.filter(emp =>
            !presentUserIds.has(String(emp.id)) && !this.isOnLeaveInRange(emp.id, range)
        ).length;
        const pendingLeaves = this.leaves.filter(l =>
            String(l.status || '').toLowerCase() === 'pending' && this.isDateInRange(l.appliedAt || l.startDate, range)
        ).length;
        const pendingIzin = this.izin.filter(i =>
            String(i.status || '').toLowerCase() === 'pending' && this.isDateInRange(i.appliedAt || i.date, range)
        ).length;

        const els = {
            'total-employees': totalEmployees,
            'present-today': presentUserIds.size,
            'absent-today': absentCount,
            'late-today': lateCount,
            'on-leave': onLeave,
            'pending-requests': pendingLeaves + pendingIzin
        };

        Object.entries(els).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });

        const presentLabel = document.getElementById('present-period-label');
        if (presentLabel) presentLabel.textContent = 'Hadir';
        this.updatePeriodLabels(range);
    },

    updatePeriodLabels(range = this.getPeriodRange()) {
        const attendanceTitle = document.getElementById('attendance-chart-title');
        const deptTitle = document.getElementById('dept-chart-title');
        const activityTitle = document.getElementById('recent-activity-title');
        const onlineTitle = document.getElementById('online-users-title');

        if (attendanceTitle) attendanceTitle.textContent = 'Statistik Kehadiran';
        if (deptTitle) deptTitle.textContent = 'Kehadiran Divisi';
        if (activityTitle) activityTitle.textContent = 'Aktivitas Terbaru';
        if (onlineTitle) onlineTitle.textContent = 'Karyawan Online';
    },

    renderCharts() {
        this.renderMonthlyAttendanceChart();
        this.renderDivisionChart();
    },

    renderMonthlyAttendanceChart() {
        const container = document.getElementById('admin-attendance-chart');
        if (!container) return;

        const range = this.getPeriodRange();
        const periodAttendance = this.attendance.filter(a => this.isDateInRange(a.date, range));

        const present = periodAttendance.filter(a => a.clockIn && !this.isLate(a.status)).length;
        const late = periodAttendance.filter(a => a.clockIn && this.isLate(a.status)).length;
        const absent = periodAttendance.filter(a => {
            const status = String(a.status || '').toLowerCase();
            return status === 'absent' || status === 'tidak hadir' || (!a.clockIn && status && status !== 'waiting');
        }).length;
        const max = Math.max(1, present, late, absent);

        container.innerHTML = `
            <div class="admin-real-chart">
                ${this.renderChartBar('Hadir', present, max, 'var(--color-success)')}
                ${this.renderChartBar('Terlambat', late, max, 'var(--color-warning)')}
                ${this.renderChartBar('Tidak Hadir', absent, max, 'var(--color-danger)')}
            </div>
        `;
    },

    renderDivisionChart() {
        const container = document.getElementById('admin-dept-chart');
        if (!container) return;

        const range = this.getPeriodRange();
        const periodAttendance = this.attendance.filter(a => this.isDateInRange(a.date, range) && a.clockIn);
        const divisionMap = new Map();

        this.employees.forEach(emp => {
            const key = getEmployeeDivision(emp) || '-';
            if (!divisionMap.has(key)) divisionMap.set(key, { total: 0, present: 0 });
            divisionMap.get(key).total += 1;
        });

        periodAttendance.forEach(att => {
            const emp = this.getEmployee(att.userId);
            const key = getEmployeeDivision(emp) || '-';
            if (!divisionMap.has(key)) divisionMap.set(key, { total: 0, present: 0 });
            divisionMap.get(key).present += 1;
        });

        const rows = Array.from(divisionMap.entries()).sort((a, b) => b[1].total - a[1].total);
        if (rows.length === 0) {
            container.innerHTML = '<div class="chart-placeholder"><p>Belum ada data divisi.</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="dept-real-list">
                ${rows.map(([dept, stat]) => {
                    const percent = stat.total ? Math.round((stat.present / stat.total) * 100) : 0;
                    return `
                        <div class="dept-real-item">
                            <div class="dept-real-head">
                                <strong>${this.escapeHtml(dept)}</strong>
                                <div class="dept-real-bar"><span style="width:${percent}%"></span></div>
                                <span>${stat.present}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    renderChartBar(label, value, max, color) {
        const percent = Math.round((value / max) * 100);
        return `
            <div class="admin-real-bar-row">
                <span>${label}</span>
                <div class="admin-real-bar"><span style="width:${percent}%; background:${color};"></span></div>
                <strong>${value}</strong>
            </div>
        `;
    },

    renderRecentActivity() {
        const container = document.getElementById('admin-recent-activity');
        if (!container) return;

        const range = this.getPeriodRange();
        const activities = [];
        this.attendance.forEach(att => {
            if (!this.isDateInRange(att.date, range)) return;
            const emp = this.getEmployee(att.userId);
            if (att.clockIn) activities.push(this.createActivity(emp, 'Clock In', att.date, att.clockIn, 'attendance'));
            if (att.clockOut) activities.push(this.createActivity(emp, 'Clock Out', att.date, att.clockOut, 'attendance'));
        });
        this.journals.forEach(j => {
            const date = j.updatedAt || j.date;
            if (this.isDateInRange(date, range)) activities.push(this.createActivity(this.getEmployee(j.userId || j.user_id), 'Mengisi Jurnal', date, '', 'journal'));
        });
        this.leaves.forEach(l => {
            const date = l.appliedAt || l.startDate;
            if (this.isDateInRange(date, range)) activities.push(this.createActivity(this.getEmployee(l.userId), 'Mengajukan Cuti', date, '', 'leave'));
        });
        this.izin.forEach(i => {
            const date = i.appliedAt || i.date;
            if (this.isDateInRange(date, range)) activities.push(this.createActivity(this.getEmployee(i.userId), `Mengajukan ${i.typeLabel || 'Izin'}`, date, '', 'permission'));
        });

        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const topActivities = activities.slice(0, 8);

        if (topActivities.length === 0) {
            container.innerHTML = '<div class="empty-state">Belum ada aktivitas.</div>';
            return;
        }

        container.innerHTML = topActivities.map(act => `
            <div class="activity-item">
                <div class="activity-avatar">
                    <img src="${getAvatarUrl(act.employee || { name: act.user })}" alt="${this.escapeHtml(act.user)}">
                </div>
                <div class="activity-content">
                    <p class="activity-text"><strong>${this.escapeHtml(act.user)}</strong> ${this.escapeHtml(act.action)}</p>
                    <span class="activity-time">${this.escapeHtml(this.relativeTime(act.timestamp))}</span>
                </div>
            </div>
        `).join('');
    },

    createActivity(emp, action, date, time, type) {
        const timestamp = this.combineDateTime(date, time);
        return {
            employee: emp,
            user: emp?.name || 'Karyawan',
            action,
            timestamp,
            type
        };
    },

    combineDateTime(date, time) {
        if (!date) return new Date(0).toISOString();
        if (String(date).includes('T')) return date;
        return `${this.getLocalDate(date)}T${String(time || '00:00').replace('.', ':')}:00`;
    },

    renderOnlineUsers() {
        const container = document.getElementById('admin-online-users');
        if (!container) return;

        const range = this.getPeriodRange();
        const onlineUserIds = new Set(this.attendance
            .filter(a => this.isDateInRange(a.date, range) && a.clockIn && !a.clockOut)
            .map(a => String(a.userId)));
        const onlineUsers = this.employees.filter(e => onlineUserIds.has(String(e.id)));

        const countEl = document.getElementById('online-count');
        if (countEl) countEl.textContent = onlineUsers.length;

        if (onlineUsers.length === 0) {
            container.innerHTML = '<div class="empty-state">Belum ada karyawan online.</div>';
            return;
        }

        container.innerHTML = onlineUsers.slice(0, 8).map(user => `
            <div class="online-user-item">
                <div class="user-status-dot"></div>
                <div class="activity-avatar">
                    <img src="${getAvatarUrl(user)}" alt="${this.escapeHtml(user.name)}">
                </div>
                <div class="activity-content">
                    <p class="activity-text"><strong>${this.escapeHtml(user.name)}</strong></p>
                    <span class="activity-time">${this.escapeHtml(getEmployeeDivision(user) || '-')} - ${this.escapeHtml(user.position || '-')}</span>
                </div>
            </div>
        `).join('');
    },

    relativeTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const diffMs = Date.now() - date.getTime();
        const minutes = Math.max(0, Math.floor(diffMs / 60000));
        if (minutes < 1) return 'Baru saja';
        if (minutes < 60) return `${minutes} menit yang lalu`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} jam yang lalu`;
        const days = Math.floor(hours / 24);
        return `${days} hari yang lalu`;
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

window.initAdminDashboard = () => {
    adminDashboard.init();
};

window.adminDashboard = adminDashboard;
