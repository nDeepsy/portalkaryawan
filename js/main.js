/**
 * Portal Karyawan - Main JavaScript
 * Utility functions and shared functionality
 */

// Storage Manager - localStorage untuk data persistent
const storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    clear() {
        localStorage.clear();
    }
};

const REMOTE_REPORT_CACHE_VERSION = '2026-05-24-radio-organization-v5';
const REMOTE_REPORT_CACHE_VERSION_KEY = 'remoteReportCacheVersion';
const REMOTE_REPORT_CACHE_KEYS = [
    'admin_employees',
    'attendance',
    'jurnals',
    'leaves',
    'izin'
];

function clearRemoteReportCacheIfNeeded() {
    const usesRemoteApi = typeof API_BASE_URL !== 'undefined' && Boolean(API_BASE_URL);
    if (!usesRemoteApi) return;

    if (storage.get(REMOTE_REPORT_CACHE_VERSION_KEY) === REMOTE_REPORT_CACHE_VERSION) return;

    REMOTE_REPORT_CACHE_KEYS.forEach(key => storage.remove(key));

    if (window.api && typeof window.api.clearRequestCache === 'function') {
        window.api.clearRequestCache();
    }

    storage.set(REMOTE_REPORT_CACHE_VERSION_KEY, REMOTE_REPORT_CACHE_VERSION);
}

function getEmployeeDivision(employee) {
    return employee?.division || employee?.department || '';
}

function normalizeEmployeeRecord(employee) {
    if (!employee || typeof employee !== 'object') return employee;
    const division = getEmployeeDivision(employee);
    const normalized = { ...employee, division };
    delete normalized.department;
    return normalized;
}

function normalizeEmployeeList(employees) {
    return Array.isArray(employees) ? employees.map(normalizeEmployeeRecord) : [];
}

// Session Manager - sessionStorage untuk session data (otomatis hilang saat tab ditutup)
const sessionStorage_manager = {
    get(key, defaultValue = null) {
        try {
            const item = sessionStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    },

    remove(key) {
        sessionStorage.removeItem(key);
    },

    clear() {
        sessionStorage.clear();
    }
};

// Toast Notification System
const toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
    },

    show(message, type = 'info', title = '', duration = 3000) {
        if (!this.container) this.init();

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const titles = {
            success: 'Berhasil',
            error: 'Error',
            warning: 'Peringatan',
            info: 'Info'
        };

        const toastEl = document.createElement('div');
        toastEl.className = `toast ${type}`;
        toastEl.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type]}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title || titles[type]}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.container.appendChild(toastEl);

        // Auto remove
        setTimeout(() => {
            toastEl.style.opacity = '0';
            toastEl.style.transform = 'translateX(100%)';
            setTimeout(() => toastEl.remove(), 300);
        }, duration);
    },

    success(message, title) {
        this.show(message, 'success', title);
    },

    error(message, title) {
        this.show(message, 'error', title);
    },

    warning(message, title) {
        this.show(message, 'warning', title);
    },

    info(message, title) {
        this.show(message, 'info', title);
    }
};

// Date & Time Utilities
const dateTime = {
    formatDate(date, format = 'full') {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        const dayName = days[d.getDay()];
        const day = d.getDate();
        const month = months[d.getMonth()];
        const year = d.getFullYear();

        if (format === 'full' || format === 'long' || format === 'short') {
            return this.formatNumericDate(d);
        } else if (format === 'day') {
            return dayName;
        }
        return this.formatNumericDate(d);
    },

    formatNumericDate(value) {
        if (!value) return '';

        let d;
        if (value instanceof Date) {
            d = value;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
            const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
            d = new Date(year, month - 1, day);
        } else {
            d = new Date(value);
        }

        if (Number.isNaN(d.getTime())) return String(value || '');

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },

    formatTime(date) {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return '';

        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    },

    formatClockTime(value) {
        if (!value) return '';

        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return this.formatTime(value);
        }

        const raw = String(value).trim();
        if (!raw || raw === '-' || raw === '--:--') return '';

        const parsedDate = new Date(raw);
        if (raw.includes('T') && !Number.isNaN(parsedDate.getTime())) {
            return this.formatTime(parsedDate);
        }

        const decimalMatch = raw.match(/^(\d{1,2})[.](\d{1,2})$/);
        if (decimalMatch) {
            const hour = Number(decimalMatch[1]);
            const minute = Number(decimalMatch[2].padEnd(2, '0'));
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            }
        }

        const timeMatch = raw.replace('.', ':').match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
        if (timeMatch) {
            const hour = Number(timeMatch[1]);
            const minute = Number(timeMatch[2].padStart(2, '0'));
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            }
        }

        return raw;
    },

    clockTimeToMinutes(value) {
        const formatted = this.formatClockTime(value);
        const match = formatted.match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;

        return (Number(match[1]) * 60) + Number(match[2]);
    },

    formatDateTime(date) {
        return `${this.formatDate(date)} ${this.formatTime(date)}`;
    },

    getCurrentTime() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    },

    getCurrentDate() {
        return this.formatDate(new Date());
    },

    getLocalDate() {
        // Returns YYYY-MM-DD for the local timezone, not UTC
        const today = new Date();
        return new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    getGreeting() {
        const hour = new Date().getHours();
        if (hour < 11) return 'Selamat Pagi';
        if (hour < 15) return 'Selamat Siang';
        if (hour < 18) return 'Selamat Sore';
        return 'Selamat Malam';
    },

    calculateDuration(start, end) {
        const toMinutes = (value) => {
            if (!value) return null;
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return (value.getHours() * 60) + value.getMinutes();
            }

            const match = String(value).trim().match(/(\d{1,2})[:.](\d{2})/);
            if (!match) return null;

            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

            return (hours * 60) + minutes;
        };

        const startMinutes = toMinutes(start);
        const endMinutes = toMinutes(end);
        if (startMinutes === null || endMinutes === null) return '0j 0m';

        let diff = endMinutes - startMinutes;
        if (diff < 0) diff += 24 * 60;

        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;

        return `${hours}j ${minutes}m`;
    }
};

// Form Utilities
const formUtils = {
    serialize(form) {
        const formData = new FormData(form);
        const data = {};
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    },

    validate(form) {
        const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
                input.addEventListener('input', () => input.classList.remove('error'), { once: true });
            }
        });

        return isValid;
    },

    clear(form) {
        form.reset();
        form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    }
};

// Animation Utilities
const animations = {
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        element.style.transition = `opacity ${duration}ms ease`;

        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    },

    fadeOut(element, duration = 300) {
        element.style.transition = `opacity ${duration}ms ease`;
        element.style.opacity = '0';

        setTimeout(() => {
            element.style.display = 'none';
        }, duration);
    },

    slideDown(element, duration = 300) {
        element.style.maxHeight = '0';
        element.style.overflow = 'hidden';
        element.style.transition = `max-height ${duration}ms ease`;

        requestAnimationFrame(() => {
            element.style.maxHeight = element.scrollHeight + 'px';
        });
    }
};

const modal = {
    overlayId: 'global-modal-overlay',

    show(title, content, actions = []) {
        this.close();

        const overlay = document.createElement('div');
        overlay.id = this.overlayId;
        const modalClass = actions.modalClass || '';
        const hasCloseAction = actions.some(action =>
            String(action?.label || '').trim().toLowerCase() === 'tutup'
        );
        overlay.className = `modal-overlay ${modalClass} ${hasCloseAction ? 'modal-has-close-action' : ''}`.trim();
        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button type="button" class="btn-close-modal" aria-label="Tutup" title="Tutup">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="modal-content">${content}</div>
                <div class="modal-actions"></div>
            </div>
        `;

        const closeButton = overlay.querySelector('.btn-close-modal');
        if (closeButton) {
            closeButton.addEventListener('click', () => this.close());
        }

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });

        const actionsContainer = overlay.querySelector('.modal-actions');
        actions.forEach(action => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = action.class || 'btn-secondary';
            button.textContent = action.label;
            button.addEventListener('click', () => {
                if (typeof action.onClick === 'function') {
                    action.onClick();
                }
            });
            actionsContainer.appendChild(button);
        });

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    },

    close() {
        const overlay = document.getElementById(this.overlayId);
        if (overlay) {
            overlay.remove();
        }
        document.body.style.overflow = '';
    }
};

const APP_COMPANY_NAME = 'PT Magtas Radio 107.3 FM';

// Initialize default data
function initializeData() {
    const usesRemoteApi = typeof API_BASE_URL !== 'undefined' && Boolean(API_BASE_URL);

    clearRemoteReportCacheIfNeeded();

    if (usesRemoteApi) return;

    // Shifts
    if (!storage.get('shifts')) {
        storage.set('shifts', [
            { id: 1, name: 'Pagi', startTime: '08:00', endTime: '17:00' },
            { id: 2, name: 'Siang', startTime: '14:00', endTime: '23:00' },
            { id: 3, name: 'Malam', startTime: '23:00', endTime: '08:00' }
        ]);
    }

    // Dummy attendance data
    if (!storage.get('attendance')) {
        storage.set('attendance', [
            { date: '2026-03-06', shift: 'Pagi', clockIn: '07:55', clockOut: '17:15', status: 'ontime' },
            { date: '2026-03-05', shift: 'Pagi', clockIn: '08:10', clockOut: '17:05', status: 'late' },
            { date: '2026-03-04', shift: 'Pagi', clockIn: '07:50', clockOut: '17:20', status: 'ontime' }
        ]);
    }

    // Dummy jurnal data
    if (!storage.get('jurnals')) {
        storage.set('jurnals', [
            {
                date: '2026-03-06',
                tasks: 'Mengerjakan fitur dashboard, meeting dengan tim development',
                achievements: 'Selesai membuat komponen chart',
                obstacles: 'Kendala pada integrasi API',
                plan: 'Melanjutkan integrasi API'
            },
            {
                date: '2026-03-05',
                tasks: 'Fix bug pada modul absensi, update UI',
                achievements: 'Bug fixed',
                obstacles: '',
                plan: 'Testing'
            }
        ]);
    }

    // Dummy leave data
    if (!storage.get('leaves')) {
        storage.set('leaves', [
            {
                id: 1,
                type: 'annual',
                typeLabel: 'Cuti Tahunan',
                startDate: '2026-03-15',
                endDate: '2026-03-17',
                duration: 3,
                reason: 'Liburan keluarga',
                status: 'pending',
                appliedAt: '2026-03-01'
            },
            {
                id: 2,
                type: 'sick',
                typeLabel: 'Cuti Sakit',
                startDate: '2026-02-20',
                endDate: '2026-02-20',
                duration: 1,
                reason: 'Demam dan flu',
                status: 'approved',
                appliedAt: '2026-02-19'
            },
            {
                id: 3,
                type: 'important',
                typeLabel: 'Cuti Penting',
                startDate: '2026-02-10',
                endDate: '2026-02-10',
                duration: 1,
                reason: 'Urusan keluarga',
                status: 'rejected',
                appliedAt: '2026-02-08'
            }
        ]);
    }

    // Dummy izin data
    if (!storage.get('izin')) {
        storage.set('izin', []);
    }

    // Dummy admin employees data
    if (!storage.get('admin_employees')) {
        storage.set('admin_employees', [
            { id: 1, name: 'Selvia Lovelin', email: 'selvia@radio.com', division: 'Pimpinan', position: 'Pemilik', shift: 'Pagi', status: 'active', joinDate: '2024-01-15', avatar: 'https://ui-avatars.com/api/?name=Selvia&background=3B82F6&color=fff' },
            { id: 2, name: 'Padilah Ansor', email: 'padilah@radio.com', division: 'Manajemen', position: 'Ketua', shift: 'Pagi', status: 'active', joinDate: '2024-02-01', avatar: 'https://ui-avatars.com/api/?name=Padilah&background=10B981&color=fff' },
            { id: 3, name: 'Dadang Ihsan', email: 'dadang@radio.com', division: 'Manajemen', position: 'Pengawas', shift: 'Pagi', status: 'active', joinDate: '2024-02-01', avatar: 'https://ui-avatars.com/api/?name=Dadang&background=F59E0B&color=fff' },
            { id: 4, name: 'Elsa Aurelia', email: 'elsa@radio.com', division: 'Keuangan', position: 'Bendahara', shift: 'Pagi', status: 'active', joinDate: '2024-03-10', avatar: 'https://ui-avatars.com/api/?name=Elsa&background=EF4444&color=fff' },
            { id: 5, name: 'Boby', email: 'boby@radio.com', division: 'Siaran', position: 'Penyiar', shift: 'Siang', status: 'active', joinDate: '2024-04-05', avatar: 'https://ui-avatars.com/api/?name=Boby&background=8B5CF6&color=fff' },
            { id: 6, name: 'Mira Septiani', email: 'mira@radio.com', division: 'Keanggotaan', position: 'Anggota', shift: 'Pagi', status: 'active', joinDate: '2024-04-12', avatar: 'https://ui-avatars.com/api/?name=Mira&background=6B7280&color=fff' }
        ]);
    }
}

// Update company name in UI
function updateCompanyUI() {
    const elements = {
        'login-company-name': APP_COMPANY_NAME,
        'footer-company': APP_COMPANY_NAME,
        'sidebar-brand': APP_COMPANY_NAME
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });

    const sidebarBrand = document.getElementById('sidebar-brand');
    if (sidebarBrand && APP_COMPANY_NAME.includes(' Radio ')) {
        const [brandName, radioName] = APP_COMPANY_NAME.split(' Radio ');
        sidebarBrand.textContent = '';

        const brandLine = document.createElement('span');
        brandLine.textContent = brandName;

        const radioLine = document.createElement('span');
        radioLine.textContent = `Radio ${radioName}`;

        sidebarBrand.append(brandLine, radioLine);
    }

    document.title = APP_COMPANY_NAME;
}

// DOM Ready
function onDOMReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeData();
    updateCompanyUI();

    document.addEventListener('authReady', () => {
        notificationCenter.init();
    });

    // Update time display
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
        setInterval(() => {
            const now = new Date();
            const time = timeEl.querySelector('.time');
            const date = timeEl.querySelector('.date');
            if (time) time.textContent = dateTime.formatTime(now);
            if (date) date.textContent = dateTime.formatDate(now);
        }, 1000);
    }
});
// Notification Center
const notificationCenter = {
    items: [],
    initialized: false,
    isLoading: false,
    refreshTimer: null,
    refreshIntervalMs: 2000,
    mutationVersion: 0,
    mutationInFlight: 0,
    unreadCount: 0,

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const bellButton = document.getElementById('btn-notifications');
        const markAllButton = document.getElementById('btn-mark-all-notifications-read');

        if (bellButton) {
            bellButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleDropdown();
            });
        }

        if (markAllButton) {
            markAllButton.addEventListener('click', async (event) => {
                event.stopPropagation();
                await this.markAllAsRead();
            });
        }

        document.addEventListener('click', (event) => {
            const wrapper = document.querySelector('.notification-center');

            if (wrapper && !wrapper.contains(event.target)) {
                this.closeDropdown();
            }
        });

        window.addEventListener('focus', () => this.refreshForCurrentUser({ silent: true }));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshForCurrentUser({ silent: true });
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        });

        this.refreshForCurrentUser({ silent: true });
        this.startAutoRefresh();
    },

    getSession() {
        if (!window.auth || !auth.getCurrentUser) return null;
        return auth.getCurrentUser();
    },

    async refreshForCurrentUser(options = {}) {
        const user = this.getSession();

        if (!user) {
            this.unreadCount = 0;
            this.renderBadge(0);
            this.renderItems([]);
            this.stopAutoRefresh();
            return;
        }

        await this.load(user.role, user.id, options);
    },

    async load(role, userId, options = {}) {
        if (this.isLoading) return;

        const list = document.getElementById('notification-list');
        const silent = Boolean(options.silent);
        const mutationVersionAtStart = this.mutationVersion;

        if (list && !silent && this.items.length === 0) {
            list.innerHTML = '<div class="notification-loading">Memuat notifikasi...</div>';
        }

        this.isLoading = true;
        try {
            const result = await api.getNotifications(role, userId);

            if (!result.success || !result.data) {
                if (mutationVersionAtStart !== this.mutationVersion || this.mutationInFlight > 0) return;
                this.items = [];
                this.unreadCount = 0;
                this.renderBadge(0);
                this.renderItems([]);
                return;
            }

            if (mutationVersionAtStart !== this.mutationVersion || this.mutationInFlight > 0) return;

            this.items = Array.isArray(result.data.items) ? result.data.items : [];
            this.unreadCount = Number(result.data.unreadCount || 0);
            this.renderBadge(this.unreadCount);
            this.renderItems(this.items);
        } catch (error) {
            console.error('Notification load error:', error);
            if (!silent) {
                this.items = [];
                this.renderBadge(0);
                this.renderItems([]);
            }
        } finally {
            this.isLoading = false;
        }
    },

    startAutoRefresh() {
        if (this.refreshTimer || document.hidden) return;

        this.refreshTimer = setInterval(() => {
            this.refreshForCurrentUser({ silent: true });
        }, this.refreshIntervalMs);
    },

    stopAutoRefresh() {
        if (!this.refreshTimer) return;

        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
    },

    renderBadge(count) {
        const badge = document.getElementById('notification-badge');

        if (!badge) return;

        const safeCount = Number(count || 0);

        if (safeCount > 0) {
            badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
            badge.hidden = false;
        } else {
            badge.textContent = '0';
            badge.hidden = true;
        }
    },

    renderItems(items) {
        const list = document.getElementById('notification-list');

        if (!list) return;

        if (!items || items.length === 0) {
            list.innerHTML = '<div class="notification-empty">Belum ada notifikasi.</div>';
            return;
        }

        list.innerHTML = items.map(item => {
            const unreadClass = item.isRead ? '' : ' unread';

            return `
                <button type="button" class="notification-item${unreadClass}" data-notification-id="${this.escapeHtml(String(item.id || ''))}">
                    <span class="notification-item-title">${this.escapeHtml(item.title || 'Notifikasi')}</span>
                    <span class="notification-item-message">${this.escapeHtml(item.message || '')}</span>
                    <span class="notification-item-time">${this.formatDateTime(item.createdAt)}</span>
                </button>
            `;
        }).join('');

        list.querySelectorAll('[data-notification-id]').forEach(button => {
            button.addEventListener('click', async () => {
                const id = button.getAttribute('data-notification-id');
                await this.markAsRead(id);
            });
        });
    },

    async toggleDropdown() {
        const dropdown = document.getElementById('notification-dropdown');

        if (!dropdown) return;

        dropdown.hidden = !dropdown.hidden;

        if (!dropdown.hidden) {
            await this.refreshForCurrentUser({ silent: this.items.length > 0 });
        }
    },

    closeDropdown() {
        const dropdown = document.getElementById('notification-dropdown');

        if (dropdown) {
            dropdown.hidden = true;
        }
    },

    async markAsRead(id) {
        const user = this.getSession();

        if (!user || !id) return;

        const selectedNotification = this.items.find(item => String(item.id) === String(id));
        const previousItems = [...this.items];
        const previousUnreadCount = this.unreadCount;

        const selectedTargetPage = this.getNotificationTargetPage(selectedNotification, user);
        const clearedItems = selectedNotification && selectedTargetPage
            ? this.items.filter(item => this.getNotificationTargetPage(item, user) === selectedTargetPage)
            : this.items.filter(item => String(item.id) === String(id));
        const clearedUnreadCount = clearedItems.filter(item => !item.isRead).length;

        this.mutationVersion += 1;
        this.mutationInFlight += 1;
        this.items = this.items.filter(item => !clearedItems.some(cleared => String(cleared.id) === String(item.id)));
        this.unreadCount = Math.max(0, this.unreadCount - clearedUnreadCount);
        this.renderBadge(this.unreadCount);
        this.renderItems(this.items);
        this.closeDropdown();

        if (selectedNotification) {
            this.navigateToNotification(selectedNotification, user);
        }

        try {
            const result = await api.markNotificationRead(id, user.role, user.id);

            if (!result.success) {
                this.items = previousItems;
                this.unreadCount = previousUnreadCount;
                this.renderBadge(this.unreadCount);
                this.renderItems(this.items);
                toast.warning(result.error || 'Notifikasi belum berhasil ditandai terbaca');
                return;
            }
        } catch (error) {
            console.error('Notification mark read error:', error);
            this.items = previousItems;
            this.unreadCount = previousUnreadCount;
            this.renderBadge(this.unreadCount);
            this.renderItems(this.items);
            toast.warning('Notifikasi belum berhasil ditandai terbaca');
            return;
        } finally {
            this.mutationInFlight = Math.max(0, this.mutationInFlight - 1);
        }

        await this.refreshForCurrentUser({ silent: true });
    },

    async markAllAsRead() {
        const user = this.getSession();

        if (!user) return;

        const previousItems = [...this.items];
        const previousUnreadCount = this.unreadCount;
        this.mutationVersion += 1;
        this.mutationInFlight += 1;
        this.items = [];
        this.unreadCount = 0;
        this.renderBadge(0);
        this.renderItems([]);

        try {
            const result = await api.markAllNotificationsRead(user.role, user.id);

            if (!result.success) {
                this.items = previousItems;
                this.unreadCount = previousUnreadCount;
                this.renderBadge(this.unreadCount);
                this.renderItems(this.items);
                toast.warning(result.error || 'Notifikasi belum berhasil ditandai terbaca');
                return;
            }
        } catch (error) {
            console.error('Notification mark all read error:', error);
            this.items = previousItems;
            this.unreadCount = previousUnreadCount;
            this.renderBadge(this.unreadCount);
            this.renderItems(this.items);
            toast.warning('Notifikasi belum berhasil ditandai terbaca');
            return;
        } finally {
            this.mutationInFlight = Math.max(0, this.mutationInFlight - 1);
        }

        await this.refreshForCurrentUser({ silent: true });
    },

    async clearForPage(page) {
        const user = this.getSession();

        if (!user || !page || !api.markNotificationsForMenu) return;

        const previousItems = [...this.items];
        const previousUnreadCount = this.unreadCount;
        const clearedItems = this.items.filter(item => this.getNotificationTargetPage(item, user) === page);
        const clearedUnreadCount = clearedItems.filter(item => !item.isRead).length;

        this.mutationVersion += 1;
        this.mutationInFlight += 1;

        if (clearedItems.length > 0) {
            this.items = this.items.filter(item => !clearedItems.some(cleared => String(cleared.id) === String(item.id)));
            this.unreadCount = Math.max(0, this.unreadCount - clearedUnreadCount);
            this.renderBadge(this.unreadCount);
            this.renderItems(this.items);
            this.closeDropdown();
        }

        try {
            const result = await api.markNotificationsForMenu(page, user.role, user.id);

            if (!result.success) {
                if (clearedItems.length > 0) {
                    this.items = previousItems;
                    this.unreadCount = previousUnreadCount;
                    this.renderBadge(this.unreadCount);
                    this.renderItems(this.items);
                }
                return;
            }
        } catch (error) {
            console.error('Notification page clear error:', error);
            if (clearedItems.length > 0) {
                this.items = previousItems;
                this.unreadCount = previousUnreadCount;
                this.renderBadge(this.unreadCount);
                this.renderItems(this.items);
            }
            return;
        } finally {
            this.mutationInFlight = Math.max(0, this.mutationInFlight - 1);
        }

        await this.refreshForCurrentUser({ silent: true });
    },

    getNotificationTargetPage(item, user) {
        if (!item || !user) return '';

        const type = String(item.type || '').toLowerCase();
        const role = String(user.role || '').toLowerCase();

        let targetPage = '';

        // Arah untuk ADMIN
        if (role === 'admin') {
            if (type === 'attendance') {
                targetPage = 'attendance-reports';
            } else if (type === 'journal') {
                targetPage = 'jurnal-reports';
            } else if (type === 'leave' || type === 'permission') {
                targetPage = 'leave-reports';
            } else if (type === 'security') {
                targetPage = 'employees';
            }
        }

        // Arah untuk KARYAWAN
        if (role === 'karyawan') {
            if (type === 'leave') {
                targetPage = 'cuti';
            } else if (type === 'permission') {
                targetPage = 'izin';
            } else if (type === 'journal') {
                targetPage = 'jurnal';
            } else if (type === 'attendance') {
                targetPage = 'absensi';
            }
        }

        return targetPage;
    },

    navigateToNotification(item, user) {
        if (!window.router) return;

        const targetPage = this.getNotificationTargetPage(item, user);
        if (targetPage) router.navigate(targetPage);
    },

    formatDateTime(value) {
        if (!value) return '';

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return this.escapeHtml(String(value));
        }

        return date.toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    },

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
// Export for other modules
window.storage = storage;
window.toast = toast;
window.dateTime = dateTime;
window.formUtils = formUtils;
window.animations = animations;
window.modal = modal;
window.notificationCenter = notificationCenter;
window.updateCompanyUI = updateCompanyUI;
window.onDOMReady = onDOMReady;
window.getEmployeeDivision = getEmployeeDivision;
window.normalizeEmployeeRecord = normalizeEmployeeRecord;
window.normalizeEmployeeList = normalizeEmployeeList;
