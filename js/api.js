/**
 * Portal Karyawan - API Layer
 * Abstraction layer for backend communication
 * 
 * Mode:
 * - Jika API_BASE_URL kosong → fallback ke localStorage (untuk testing lokal)
 * - Jika API_BASE_URL diisi → semua request dikirim ke Google Apps Script
 */

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzrvlMvDrTzpp4OduHyE7PMdjaH_hfJt03hSd-yV3WfCKxGzjq_BULQZe3O58H_NNhQsQ/exec'; // Kosongkan untuk mode localStorage, isi dengan URL Web App GAS

const api = {
    cacheTtl: 15000,
    requestTimeoutMs: 20000,
    requestCachePrefix: 'api_cache_',
    pendingRequests: new Map(),
    pendingDataUpdateTimers: new Map(),
    cacheableActions: new Set([
        'batch',
        'getEmployeeProfile',
        'getAttendance',
        'getTodayAttendance',
        'getAllAttendance',
        'getJournals',
        'getAllJournals',
        'getLeaves',
        'getAllLeaves',
        'getIzin',
        'getAllIzin',
        'getEmployees',
        'getSettings',
        'getShifts',
        'getSchedule'
    ]),

    // ========== CORE REQUEST ==========

    async request(action, data = {}) {
        // Jika API_BASE_URL kosong, gunakan localStorage fallback
        if (!API_BASE_URL) {
            return this._localFallback(action, data);
        }

        const cacheKey = this._getRequestCacheKey(action, data);
        if (this.cacheableActions.has(action)) {
            const cached = this._getCachedResponse(cacheKey);
            if (cached) return cached;
        }

        const pendingKey = `${action}:${this._stableStringify(data)}`;
        if (this.pendingRequests.has(pendingKey)) {
            return this.pendingRequests.get(pendingKey);
        }

        const requestPromise = (async () => {
            const supportsAbort = typeof AbortController !== 'undefined';
            const controller = supportsAbort ? new AbortController() : null;
            const timeoutId = supportsAbort
                ? setTimeout(() => controller.abort(), this.requestTimeoutMs)
                : null;

            try {
                const response = await fetch(API_BASE_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action, ...data }),
                    ...(controller ? { signal: controller.signal } : {})
                });

                const text = await response.text();
                try {
                    const result = JSON.parse(text);
                    if (result?.success && this.cacheableActions.has(action)) {
                        this._setCachedResponse(cacheKey, result);
                    }
                    if (result?.success && !this.cacheableActions.has(action)) {
                        this.clearRequestCacheForMutation(action);
                        this.queueDataUpdatedForMutation(action);
                    }
                    return result;
                } catch (e) {
                    console.error('Failed to parse response:', text.substring(0, 200));
                    return { success: false, error: 'Respons server tidak valid. Coba ulangi beberapa saat lagi.' };
                }
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        })();

        this.pendingRequests.set(pendingKey, requestPromise);

        try {
            return await requestPromise;
        } catch (error) {
            console.error('API Error:', error);
            if (error.name === 'AbortError') {
                return { success: false, error: 'Koneksi ke server terlalu lama. Periksa internet lalu coba lagi.' };
            }
            return { success: false, error: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.' };
        } finally {
            this.pendingRequests.delete(pendingKey);
        }
    },

    _getRequestCacheKey(action, data) {
        return `${this.requestCachePrefix}${action}_${this._hashString(this._stableStringify(data))}`;
    },

    _getCachedResponse(key) {
        const cached = storage.get(key, null);
        if (!cached || !cached.timestamp || !cached.response) return null;
        if ((Date.now() - cached.timestamp) > this.cacheTtl) {
            storage.remove(key);
            return null;
        }
        return cached.response;
    },

    _setCachedResponse(key, response) {
        storage.set(key, {
            timestamp: Date.now(),
            response
        });
    },

    clearRequestCache() {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.requestCachePrefix)) storage.remove(key);
        }
    },

    clearRequestCacheForMutation(action) {
        const affectedActions = this.getAffectedCacheActions(action);
        this.clearRequestCacheForActions(affectedActions);
    },

    clearRequestCacheForActions(actions = []) {
        const affectedActions = Array.isArray(actions) ? actions : [actions];
        if (!affectedActions.length) return;

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(this.requestCachePrefix)) continue;
            if (affectedActions.some(cacheAction => key.startsWith(`${this.requestCachePrefix}${cacheAction}_`))) {
                storage.remove(key);
            }
        }
    },

    getAffectedCacheActions(action) {
        const groups = {
            saveAttendance: ['batch', 'getAttendance', 'getTodayAttendance', 'getAllAttendance'],
            saveJournal: ['batch', 'getJournals', 'getAllJournals'],
            deleteJournal: ['batch', 'getJournals', 'getAllJournals'],
            submitLeave: ['batch', 'getLeaves', 'getAllLeaves'],
            approveLeave: ['batch', 'getLeaves', 'getAllLeaves'],
            rejectLeave: ['batch', 'getLeaves', 'getAllLeaves'],
            submitIzin: ['batch', 'getIzin', 'getAllIzin'],
            approveIzin: ['batch', 'getIzin', 'getAllIzin'],
            rejectIzin: ['batch', 'getIzin', 'getAllIzin'],
            addEmployee: ['batch', 'getEmployees', 'getEmployeeProfile'],
            updateEmployee: ['batch', 'getEmployees', 'getEmployeeProfile'],
            deleteEmployee: ['batch', 'getEmployees', 'getEmployeeProfile', 'getAllAttendance', 'getAttendance', 'getAllJournals', 'getJournals', 'getAllLeaves', 'getLeaves', 'getAllIzin', 'getIzin'],
            saveSetting: ['batch', 'getSettings', 'getShifts', 'getSchedule'],
            addShift: ['batch', 'getShifts', 'getSettings', 'getEmployees'],
            updateShift: ['batch', 'getShifts', 'getSettings', 'getEmployees'],
            deleteShift: ['batch', 'getShifts', 'getSettings', 'getEmployees'],
            saveSchedule: ['batch', 'getSchedule', 'getSettings'],
            syncDailyShifts: ['batch', 'getEmployees', 'getSettings'],
            markNotificationRead: [],
            markAllNotificationsRead: [],
            markNotificationsForMenu: []
        };

        return groups[action] || ['batch'];
    },

    broadcastDataUpdated(type, detail = {}) {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent('dataUpdated', {
            detail: {
                type,
                ...detail,
                timestamp: Date.now()
            }
        }));
    },

    queueDataUpdatedForMutation(action) {
        const type = this.getDataUpdateTypeForAction(action);
        if (!type) return;

        const timerKey = `${type}:${action}`;
        if (this.pendingDataUpdateTimers.has(timerKey)) {
            clearTimeout(this.pendingDataUpdateTimers.get(timerKey));
        }

        const timer = setTimeout(() => {
            this.pendingDataUpdateTimers.delete(timerKey);
            this.broadcastDataUpdated(type, {
                action,
                affectedActions: this.getAffectedCacheActions(action)
            });
        }, 150);
        this.pendingDataUpdateTimers.set(timerKey, timer);
    },

    getDataUpdateTypeForAction(action) {
        const groups = {
            saveAttendance: 'attendance',
            saveJournal: 'journals',
            deleteJournal: 'journals',
            submitLeave: 'leaves',
            approveLeave: 'leaves',
            rejectLeave: 'leaves',
            submitIzin: 'izin',
            approveIzin: 'izin',
            rejectIzin: 'izin',
            addEmployee: 'employees',
            updateEmployee: 'employees',
            deleteEmployee: 'employees',
            addShift: 'shifts',
            updateShift: 'shifts',
            deleteShift: 'shifts',
            saveSchedule: 'schedule',
            syncDailyShifts: 'employees'
        };
        return groups[action] || '';
    },

    _stableStringify(value) {
        if (!value || typeof value !== 'object') return JSON.stringify(value || {});
        const sorted = {};
        Object.keys(value).sort().forEach(key => {
            sorted[key] = value[key];
        });
        return JSON.stringify(sorted);
    },

    _hashString(value) {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return String(hash);
    },

    _filterUserJournals(allJournals, userId) {
        if (!userId) return allJournals;
        const normalizedUserId = String(userId);
        return allJournals.filter(journal => {
            const journalUserId = String(journal.userId || journal.user_id || '');
            return journalUserId === normalizedUserId;
        });
    },

    getNextLocalEmployeeId(employees = []) {
        return this.getSmallestAvailableEmployeeId(employees);
    },

    getSmallestAvailableEmployeeId(employees = []) {
        const usedNumbers = new Set();
        employees.forEach(emp => {
            const rawId = String(emp.id || '').trim();
            const prefixed = rawId.match(/^KRY(\d+)$/i);
            let number = 0;
            if (prefixed) {
                number = parseInt(prefixed[1], 10) || 0;
            } else if (/^\d+$/.test(rawId)) {
                number = parseInt(rawId, 10) || 0;
            }
            if (number > 0) usedNumbers.add(number);
        });

        let nextNumber = 1;
        while (usedNumbers.has(nextNumber)) {
            nextNumber += 1;
        }

        return `KRY${String(nextNumber).padStart(3, '0')}`;
    },

    async batch(requests) {
        if (!API_BASE_URL) {
            const pairs = await Promise.all((requests || []).map(async req => {
                if (!req?.key || !req?.action || typeof this[req.action] !== 'function') {
                    return [req?.key || req?.action || '', { success: false, error: 'Invalid batch item' }];
                }
                const result = await this[req.action](req.userId ?? req.month, req.year);
                return [req.key, result];
            }));
            return { success: true, data: Object.fromEntries(pairs.filter(([key]) => key)) };
        }

        return this.request('batch', { requests });
    },

    prefetchForUser(user = {}) {
        if (!user || !user.role) return;

        const role = String(user.role || '').toLowerCase();
        const userId = user.id || user.userId || '';
        const requests = [];

        if (role === 'admin' || role === 'pemilik') {
            requests.push(
                { key: 'employees', action: 'getEmployees' },
                { key: 'attendance', action: 'getAllAttendance' },
                { key: 'journals', action: 'getAllJournals' },
                { key: 'leaves', action: 'getAllLeaves' },
                { key: 'izin', action: 'getAllIzin' },
                { key: 'settings', action: 'getSettings' },
                { key: 'shifts', action: 'getShifts' }
            );
        } else if (role === 'karyawan') {
            requests.push(
                { key: 'todayAttendance', action: 'getTodayAttendance', userId },
                { key: 'attendance', action: 'getAttendance', userId },
                { key: 'journals', action: 'getJournals', userId },
                { key: 'leaves', action: 'getLeaves', userId },
                { key: 'izin', action: 'getIzin', userId },
                { key: 'settings', action: 'getSettings' },
                { key: 'shifts', action: 'getShifts' }
            );
        }

        if (!requests.length) return;

        this.batch(requests).catch(error => {
            console.warn('API prefetch skipped:', error);
        });
    },

    // ========== AUTH ==========

    async login(email, password, selectedRole) {
        if (!API_BASE_URL) {
            return this._localLogin(email, password, selectedRole);
        }
        const result = await this.request('login', { email, password, selectedRole });
        if (result?.success && result.data) result.data = normalizeEmployeeRecord(result.data);
        return result;
    },

    async changePassword(userId, oldPassword, newPassword, userEmail, userRole) {
        if (!API_BASE_URL) {
            return this._localChangePassword(userId, oldPassword, newPassword);
        }
        return this.request('changePassword', { userId, oldPassword, newPassword, userEmail, userRole });
    },

    async getEmployeeProfile(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: {} };
        }
        const result = await this.request('getEmployeeProfile', { userId });
        if (result?.success && result.data) result.data = normalizeEmployeeRecord(result.data);
        return result;
    },

    // ========== ATTENDANCE ==========

    async getAttendance(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('attendance', []);
            return { success: true, data: all };
        }
        return this.request('getAttendance', { userId });
    },

    async getTodayAttendance(userId) {
        if (!API_BASE_URL) {
            const today = dateTime.getLocalDate();
            const all = storage.get('attendance', []);
            const todayRecord = all.find(a =>
                a.date === today &&
                String(a.userId || '') === String(userId || '')
            );
            return {
                success: true,
                data: todayRecord || {
                    userId, date: today, shift: 'Pagi', clockIn: null, clockOut: null,
                    breakStart: null, breakEnd: null, break2Start: null, break2End: null,
                    overtimeStart: null, status: 'waiting'
                }
            };
        }
        return this.request('getTodayAttendance', { userId });
    },

    async saveAttendance(data) {
        if (!API_BASE_URL) {
            const all = storage.get('attendance', []);
            const normalizedData = {
                ...data,
                attendanceLogs: typeof data.attendanceLogs === 'string'
                    ? JSON.parse(data.attendanceLogs || '[]')
                    : (data.attendanceLogs || [])
            };
            if (normalizedData.clockIn && !normalizedData.clockOut && !normalizedData.breakStart && !normalizedData.breakEnd && !normalizedData.break2Start && !normalizedData.break2End && !normalizedData.overtimeStart) {
                const shifts = storage.get('shifts', []);
                const appSettings = storage.get('app_settings', {});
                const tolerance = Number(appSettings.late_tolerance || 15) || 15;
                const shift = shifts.find(item => String(item.name) === String(normalizedData.shift));
                const shiftStart = String(shift?.startTime || '08:00').replace('.', ':').slice(0, 5);
                const clockIn = String(normalizedData.clockIn || '').replace('.', ':').slice(0, 5);
                const [inH, inM] = clockIn.split(':').map(Number);
                const [startH, startM] = shiftStart.split(':').map(Number);
                const inMinutes = (inH || 0) * 60 + (inM || 0);
                const startMinutes = (startH || 0) * 60 + (startM || 0);
                normalizedData.status = inMinutes > startMinutes + tolerance ? 'Terlambat' : 'ontime';
            }
            const idx = all.findIndex(a =>
                a.date === normalizedData.date &&
                String(a.userId || '') === String(normalizedData.userId || '')
            );
            if (idx >= 0) { all[idx] = normalizedData; } else { all.unshift(normalizedData); }
            storage.set('attendance', all);
            return { success: true, data: normalizedData };
        }
        return this.request('saveAttendance', data);
    },

    async getAllAttendance() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('attendance', []) };
        }
        return this.request('getAllAttendance');
    },

    // ========== JOURNALS ==========

    async getJournals(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('jurnals', []);
            return { success: true, data: this._filterUserJournals(all, userId) };
        }
        return this.request('getJournals', { userId });
    },

    async saveJournal(data) {
        if (!API_BASE_URL) {
            const all = storage.get('jurnals', []);
            const normalizedUserId = String(data.userId || data.user_id || '');
            const filtered = all.filter(j => {
                const journalUserId = String(j.userId || j.user_id || '');
                return !(j.date === data.date && journalUserId === normalizedUserId);
            });
            filtered.unshift(data);
            storage.set('jurnals', filtered);
            return { success: true, data: data };
        }
        return this.request('saveJournal', data);
    },

    async getAllJournals() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('jurnals', []) };
        }
        return this.request('getAllJournals');
    },

    async deleteJournal(data) {
        if (!API_BASE_URL) {
            const all = storage.get('jurnals', []);
            const normalizedUserId = String(data.userId || data.user_id || '');
            const filtered = all.filter(j => {
                const matchDate = j.date === data.date;
                const journalUserId = String(j.userId || j.user_id || '');
                const matchUser = normalizedUserId ? journalUserId === normalizedUserId : true;
                return !(matchDate && matchUser);
            });
            storage.set('jurnals', filtered);
            return { success: true, data: filtered };
        }
        return this.request('deleteJournal', data);
    },

    // ========== LEAVES (CUTI) ==========

    async getLeaves(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const normalizedUserId = String(userId || '');
            return {
                success: true,
                data: all.filter(item => !normalizedUserId || String(item.userId || '') === normalizedUserId)
            };
        }
        return this.request('getLeaves', { userId });
    },

    async submitLeave(data) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            data.id = this.getNextLocalEmployeeId(all);
            data.status = 'pending';
            data.appliedAt = new Date().toISOString();
            all.unshift(data);
            storage.set('leaves', all);
            return { success: true, data: data };
        }
        return this.request('submitLeave', data);
    },

    async approveLeave(id, actor = {}) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) {
                leave.status = 'approved';
                Object.assign(leave, actor, { confirmedAt: new Date().toISOString() });
                storage.set('leaves', all);
            }
            return { success: true, data: leave };
        }
        return this.request('approveLeave', { id, ...actor });
    },

    async rejectLeave(id, actor = {}) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) {
                leave.status = 'rejected';
                Object.assign(leave, actor, { confirmedAt: new Date().toISOString() });
                storage.set('leaves', all);
            }
            return { success: true, data: leave };
        }
        return this.request('rejectLeave', { id, ...actor });
    },

    async getAllLeaves() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('leaves', []) };
        }
        return this.request('getAllLeaves');
    },

    // ========== IZIN / PERMISSION ==========

    async getIzin(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const normalizedUserId = String(userId || '');
            return {
                success: true,
                data: all.filter(item => !normalizedUserId || String(item.userId || '') === normalizedUserId)
            };
        }
        return this.request('getIzin', { userId });
    },

    async submitIzin(data) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            data.id = this.getNextLocalEmployeeId(all);
            data.status = 'pending';
            data.appliedAt = new Date().toISOString();
            all.unshift(data);
            storage.set('izin', all);
            return { success: true, data: data };
        }
        return this.request('submitIzin', data);
    },

    async approveIzin(id, actor = {}) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const item = all.find(i => i.id === id);
            if (item) {
                item.status = 'approved';
                Object.assign(item, actor, { confirmedAt: new Date().toISOString() });
                storage.set('izin', all);
            }
            return { success: true, data: item };
        }
        return this.request('approveIzin', { id, ...actor });
    },

    async rejectIzin(id, actor = {}) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const item = all.find(i => i.id === id);
            if (item) {
                item.status = 'rejected';
                Object.assign(item, actor, { confirmedAt: new Date().toISOString() });
                storage.set('izin', all);
            }
            return { success: true, data: item };
        }
        return this.request('rejectIzin', { id, ...actor });
    },

    async getAllIzin() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('izin', []) };
        }
        return this.request('getAllIzin');
    },

    async getIzinAttachment(id) {
        if (!API_BASE_URL) {
            const item = storage.get('izin', []).find(i => String(i.id) === String(id));
            return item?.attachmentData
                ? { success: true, data: item }
                : { success: false, error: 'Lampiran PDF tidak ditemukan.' };
        }
        return this.request('getIzinAttachment', { id });
    },
    // ========== NOTIFICATIONS ==========

    async getNotifications(role, userId) {
        return this.request('getNotifications', { role, userId });
    },

    async markNotificationRead(id, role, userId) {
        return this.request('markNotificationRead', { id, role, userId });
    },

    async markAllNotificationsRead(role, userId) {
        return this.request('markAllNotificationsRead', { role, userId });
    },

    async markNotificationsForMenu(page, role, userId) {
        return this.request('markNotificationsForMenu', { page, role, userId });
    },
    // ========== EMPLOYEES ==========

    async getEmployees() {
        if (!API_BASE_URL) {
            return { success: true, data: normalizeEmployeeList(storage.get('admin_employees', [])) };
        }
        const result = await this.request('getEmployees');
        if (result?.success) result.data = normalizeEmployeeList(result.data || []);
        return result;
    },

    async addEmployee(data) {
        if (!API_BASE_URL) {
            const all = storage.get('admin_employees', []);
            if (all.some(e => String(e.email).toLowerCase() === String(data.email).toLowerCase())) {
                return { success: false, error: 'Email sudah terdaftar' };
            }
            data.id = Date.now();
            if (!data.avatar) {
                data.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=F59E0B&color=fff`;
            }
            data = normalizeEmployeeRecord(data);
            all.unshift(data);
            storage.set('admin_employees', all);
            return { success: true, data: data };
        }
        const result = await this.request('addEmployee', data);
        if (result?.success && result.data) result.data = normalizeEmployeeRecord(result.data);
        return result;
    },

    async updateEmployee(id, data) {
        if (!API_BASE_URL) {
            const all = storage.get('admin_employees', []);
            if (all.some(e => String(e.email).toLowerCase() === String(data.email).toLowerCase() && String(e.id) !== String(id))) {
                return { success: false, error: 'Email sudah terdaftar' };
            }
            const idx = all.findIndex(e => String(e.id) === String(id));
            if (idx >= 0) {
                Object.assign(all[idx], normalizeEmployeeRecord(data));
                storage.set('admin_employees', all);
            }
            return { success: true, data: normalizeEmployeeRecord(all[idx]) };
        }
        const result = await this.request('updateEmployee', { id, ...data });
        if (result?.success && result.data) result.data = normalizeEmployeeRecord(result.data);
        return result;
    },

    async deleteEmployee(id) {
        if (!API_BASE_URL) {
            let all = storage.get('admin_employees', []);
            all = all.filter(e => String(e.id) !== String(id));
            storage.set('admin_employees', all);
            this._localDeleteEmployeeRelatedData(id);
            return { success: true, data: { id } };
        }
        const result = await this.request('deleteEmployee', { id });
        if (result?.success) {
            this._localDeleteEmployeeRelatedData(id);
            const employees = storage.get('admin_employees', []);
            storage.set('admin_employees', employees.filter(e => String(e.id) !== String(id)));
        }
        return result;
    },

    _localDeleteEmployeeRelatedData(id) {
        const normalizedId = String(id);
        const filterByUser = rows => (rows || []).filter(row => String(row.userId || row.user_id || '') !== normalizedId);
        storage.set('attendance', filterByUser(storage.get('attendance', [])));
        storage.set('jurnals', filterByUser(storage.get('jurnals', [])));
        storage.set('leaves', filterByUser(storage.get('leaves', [])));
        storage.set('izin', filterByUser(storage.get('izin', [])));

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key === `attendance_${normalizedId}`) storage.remove(key);
        }

        const schedules = storage.get('shift_schedule', {});
        let changed = false;
        Object.keys(schedules || {}).forEach(monthKey => {
            if (schedules[monthKey] && Object.prototype.hasOwnProperty.call(schedules[monthKey], normalizedId)) {
                delete schedules[monthKey][normalizedId];
                changed = true;
            }
        });
        if (changed) storage.set('shift_schedule', schedules);
    },

    // ========== SETTINGS ==========

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

    async saveSetting(key, value) {
        this.clearRequestCacheForMutation('saveSetting');

        const appSettings = storage.get('app_settings', {});
        appSettings[key] = value;
        storage.set('app_settings', appSettings);

        if (!API_BASE_URL) {
            if (String(key || '').startsWith('shift_schedule_')) {
                const schedules = storage.get('shift_schedule', {}) || {};
                const monthKey = String(key).replace('shift_schedule_', '');
                try {
                    schedules[monthKey] = JSON.parse(value || '{}');
                } catch (e) {
                    schedules[monthKey] = {};
                }
                storage.set('shift_schedule', schedules);
            }
            return { success: true, data: { key, value } };
        }
        return this.request('saveSetting', { key, value });
    },

    // ========== SHIFTS ==========

    async getShifts() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('shifts', []) };
        }
        return this.request('getShifts');
    },

    async addShift(data) {
        if (!API_BASE_URL) {
            const all = storage.get('shifts', []);
            data.id = Date.now();
            all.push(data);
            storage.set('shifts', all);
            return { success: true, data: data };
        }
        return this.request('addShift', data);
    },

    async updateShift(id, data) {
        if (!API_BASE_URL) {
            const all = storage.get('shifts', []);
            const idx = all.findIndex(s => s.id === id || s.id === Number(id));
            if (idx >= 0) {
                const oldName = data.oldName || all[idx].name;
                const cleanData = { ...data };
                delete cleanData.oldName;
                Object.assign(all[idx], cleanData);
                storage.set('shifts', all);
                if (cleanData.name && oldName && String(oldName) !== String(cleanData.name)) {
                    this._localSyncShiftName(oldName, cleanData.name);
                }
            }
            return { success: true, data: all[idx] };
        }
        return this.request('updateShift', { id, ...data });
    },

    _localSyncShiftName(oldName, newName) {
        if (!oldName || String(oldName) === String(newName)) return;

        const employees = storage.get('admin_employees', []);
        let employeesChanged = false;
        employees.forEach(emp => {
            if (String(emp.shift) === String(oldName)) {
                emp.shift = newName;
                employeesChanged = true;
            }
        });
        if (employeesChanged) storage.set('admin_employees', employees);

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
        if (schedulesChanged) storage.set('shift_schedule', schedules);
    },

    async deleteShift(id) {
        if (!API_BASE_URL) {
            let all = storage.get('shifts', []);
            const removed = all.find(s => s.id === id || s.id === Number(id));
            all = all.filter(s => s.id !== id && s.id !== Number(id));
            storage.set('shifts', all);
            if (removed && removed.name) {
                this._localSyncShiftName(removed.name, '');
            }
            return { success: true, data: { id } };
        }
        return this.request('deleteShift', { id });
    },

    // ========== SCHEDULE ==========

    async getSchedule(month, year) {
        if (!API_BASE_URL) {
            const key = `schedule_${year}_${month}`;
            return { success: true, data: storage.get(key, {}) };
        }
        return this.request('getSchedule', { month, year });
    },

    async saveSchedule(data) {
        if (!API_BASE_URL) {
            const key = `schedule_${data.year}_${data.month}`;
            storage.set(key, data.schedule || {});
            return { success: true };
        }
        return this.request('saveSchedule', data);
    },

    // ========== LOCAL AUTH FALLBACK ==========

    _localLogin(email, password, selectedRole) {
        const normalizedSelectedRole = selectedRole === 'employee' ? 'karyawan' : selectedRole;
        const employees = storage.get('admin_employees', []);
        const user = employees.find(emp => emp.email.toLowerCase() === email.toLowerCase() && emp.password === password);

        if (user) {
            // Validasi bahwa selectedRole cocok dengan role user
            const userRole = user.role || (user.id === 'admin' ? 'admin' : 'karyawan');
            if (normalizedSelectedRole === userRole) {
                return { success: true, data: { ...user, mustChangePassword: Boolean(user.mustChangePassword) } };
            } else {
                return { success: false, error: `Anda tidak bisa login sebagai ${selectedRole}. Akun ini adalah ${userRole === 'admin' ? 'admin' : 'karyawan'}.` };
            }
        }

        // Default local admin account for testing when no backend is configured
        if (email.toLowerCase() === 'admin@admin.com' && password === '12345') {
            // Validasi role untuk admin default
            if (normalizedSelectedRole === 'admin') {
                return {
                    success: true,
                    data: {
                        id: 'admin',
                        email: 'admin@admin.com',
                        name: 'Administrator',
                        role: 'admin',
                        avatar: 'https://ui-avatars.com/api/?name=Admin&background=111827&color=fff'
                    }
                };
            } else {
                return { success: false, error: 'Anda tidak bisa login sebagai karyawan dengan akun admin.' };
            }
        }

        if (email.toLowerCase() === 'pemilik@magtas.com' && password === '12345') {
            if (normalizedSelectedRole === 'pemilik') {
                return {
                    success: true,
                    data: {
                        id: 'owner',
                        email: 'pemilik@magtas.com',
                        name: 'Pemilik',
                        role: 'pemilik',
                        avatar: 'https://ui-avatars.com/api/?name=Pemilik&background=0F766E&color=fff'
                    }
                };
            }
            return { success: false, error: 'Anda tidak bisa login sebagai admin dengan akun pemilik.' };
        }

        return { success: false, error: 'Email atau password salah!' };
    },

    _localChangePassword(userId, oldPassword, newPassword) {
        const employees = storage.get('admin_employees', []);
        const idx = employees.findIndex(emp => String(emp.id) === String(userId));
        if (idx >= 0) {
            if (String(employees[idx].password || '12345') !== String(oldPassword)) {
                return { success: false, error: 'Password lama salah' };
            }
            employees[idx].password = newPassword;
            employees[idx].mustChangePassword = false;
            storage.set('admin_employees', employees);
            return { success: true, data: { message: 'Password berhasil diubah' } };
        }
        return { success: true, data: { message: 'Password changed (local)' } };
    },

    _localFallback(action, data) {
        console.warn(`API Fallback: ${action} - using localStorage`);
        // This shouldn't be called normally since each method has its own fallback
        return { success: false, error: 'No fallback for action: ' + action };
    }
};

// Expose to global
window.api = api;

// Helper: always return a valid avatar URL
window.getAvatarUrl = function (emp) {
    if (emp && emp.avatar && emp.avatar.startsWith('http')) {
        return emp.avatar;
    }
    const name = (emp && emp.name) ? emp.name : 'User';
    const colors = ['3B82F6', '10B981', 'F59E0B', 'EF4444', '8B5CF6', 'EC4899', '14B8A6', '6B7280'];
    const colorIdx = name.charCodeAt(0) % colors.length;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIdx]}&color=fff`;
};
