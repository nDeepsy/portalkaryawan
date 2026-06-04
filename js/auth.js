/**
 * Portal Karyawan - Authentication
 * Handle login/logout and session management
 */

const auth = {
    currentUser: null,
    keepAliveInterval: null,
    keepAliveTtl: 1000 * 60 * 30, // 30 menit

    init() {
        // Coba ambil session dari sessionStorage dulu
        let session = sessionStorage_manager.get('session');
        if (!session) {
            // Jika tidak ada, coba pulihkan dari backup lokal sementara
            session = this.loadKeepAliveSession();
            if (session) {
                sessionStorage_manager.set('session', session);
            }
        }
        if (session) {
            session.role = this.normalizeUserRole(session.role, session.id);
            this.currentUser = session;
            this.showApp({ restorePage: true });
        }

        document.dispatchEvent(new Event('authReady'));

        // Session persists on refresh. Browser/tab close akan menghapus sessionStorage secara otomatis.

        // Login form handler
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Toggle password visibility
        const togglePassword = document.getElementById('toggle-password');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => this.togglePasswordVisibility());
        }

        // Logout button
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        const mobileAccountToggle = document.getElementById('mobile-account-toggle');
        const mobileAccountDropdown = document.getElementById('mobile-account-dropdown');
        if (mobileAccountToggle && mobileAccountDropdown) {
            mobileAccountToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileAccountDropdown.hidden = !mobileAccountDropdown.hidden;
            });
            document.addEventListener('click', (e) => {
                if (!mobileAccountDropdown.hidden && !mobileAccountDropdown.contains(e.target) && !mobileAccountToggle.contains(e.target)) {
                    mobileAccountDropdown.hidden = true;
                }
            });
        }

        const mobileProfileButton = document.getElementById('mobile-profile-button');
        if (mobileProfileButton) {
            mobileProfileButton.addEventListener('click', () => {
                if (mobileAccountDropdown) mobileAccountDropdown.hidden = true;
                this.openProfileModal();
            });
        }

        const mobileLogoutButton = document.getElementById('mobile-logout-button');
        if (mobileLogoutButton) {
            mobileLogoutButton.addEventListener('click', () => {
                if (mobileAccountDropdown) mobileAccountDropdown.hidden = true;
                this.handleLogout();
            });
        }

        // Profile click - open profile modal
        const userProfile = document.querySelector('.user-profile');
        if (userProfile) {
            // Make the user info area clickable (not the logout button)
            const userInfoArea = userProfile.querySelector('.user-info');
            const userAvatarArea = userProfile.querySelector('.user-avatar');
            if (userInfoArea) {
                userInfoArea.style.cursor = 'pointer';
                userInfoArea.addEventListener('click', () => this.openProfileModal());
            }
            if (userAvatarArea) {
                userAvatarArea.style.cursor = 'pointer';
                userAvatarArea.addEventListener('click', () => this.openProfileModal());
            }
        }
    },

    async handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const role = document.querySelector('input[name="role"]:checked').value;

        // Validate
        if (!email || !password) {
            toast.error('Email dan password harus diisi!');
            return;
        }

        // Show loading
        const submitBtn = e.target.querySelector('.btn-login');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const result = await api.login(email, password, role);

            let user;
            if (result.success && result.data) {
                // Backend mode - user from API (Employees or Users sheet)
                user = {
                    id: result.data.id,
                    email: result.data.email,
                    name: result.data.name,
                    role: this.normalizeUserRole(result.data.role || role, result.data.id),
                    division: getEmployeeDivision(result.data),
                    position: result.data.position || '',
                    shift: result.data.shift || '',
                    joinDate: result.data.joinDate || result.data.join_date || result.data.startDate || '',
                    avatar: result.data.avatar || '',
                    loginTime: new Date().toISOString()
                };
            } else if (result.success && !result.data && !API_BASE_URL) {
                // Local-only fallback (no backend configured) - for testing only
                const displayName = email.split('@')[0] || 'User';
                user = {
                    id: 'user_' + Date.now(),
                    email: email,
                    name: role === 'admin' ? 'Admin (Local)' : displayName,
                    role: role,
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=F59E0B&color=fff`,
                    loginTime: new Date().toISOString()
                };
            } else {
                toast.error(result.error || 'Email atau password salah!');
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                return;
            }

            this.currentUser = user;
            sessionStorage_manager.set('session', user);
            this.saveKeepAliveSession(user);
            this.startKeepAlive();

            // Update UI
            this.updateUserUI();

            // Show app
            this.showApp({ restorePage: false });

            if (window.notificationCenter) {
                window.notificationCenter.init();
                window.notificationCenter.refreshForCurrentUser();
            }

            toast.success(`Selamat datang, ${user.name}!`);
        } catch (error) {
            console.error('Login error:', error);
            toast.error('Terjadi kesalahan saat login');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    },

    handleLogout() {
        if (confirm('Apakah Anda yakin ingin logout?')) {
            this.clearSession();
            toast.info('Anda telah logout');
        }
    },

    saveKeepAliveSession(user) {
        storage.set('keepAliveSession', {
            user,
            expires: Date.now() + this.keepAliveTtl
        });
    },

    loadKeepAliveSession() {
        const backup = storage.get('keepAliveSession');
        if (backup && backup.expires && backup.expires > Date.now()) {
            return backup.user;
        }
        storage.remove('keepAliveSession');
        return null;
    },

    clearKeepAliveSession() {
        storage.remove('keepAliveSession');
    },

    startKeepAlive() {
        if (this.keepAliveInterval) return;
        this.keepAliveInterval = setInterval(() => {
            if (this.currentUser) {
                this.saveKeepAliveSession(this.currentUser);
            }
        }, 1000 * 60 * 5); // update setiap 5 menit
    },

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    },

    clearSession() {
        this.currentUser = null;
        sessionStorage_manager.clear();
        this.clearKeepAliveSession();
        storage.remove('currentPage');
        this.stopKeepAlive();
        this.showLogin();
    },

    showApp(options = {}) {
        const { restorePage = false } = options;
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app-container');

        if (loginContainer && appContainer) {
            loginContainer.style.display = 'none';
            appContainer.classList.remove('hidden');
            appContainer.classList.toggle('role-admin', this.isAdmin());
            appContainer.classList.toggle('role-owner', this.isPemilik());
            appContainer.classList.toggle('role-employee', this.isKaryawan());

            // Update user UI first
            this.updateUserUI();
            this.startKeepAlive();
            this.applyRoleVisibility();

            // Show appropriate menu based on role
            const employeeMenu = document.getElementById('employee-menu');
            const adminMenu = document.getElementById('admin-menu-nav');
            const bottomNav = document.getElementById('bottom-nav');
            const adminBottomNav = document.getElementById('admin-bottom-nav');
            let targetPage = null;
            const hashPage = window.location.hash ? window.location.hash.substring(1) : '';
            const storedPage = storage.get('currentPage');
            const adminPages = ['admin-dashboard', 'employees', 'attendance-reports', 'jurnal-reports', 'leave-reports', 'shift-schedule', 'settings'];
            const pemilikPages = ['admin-dashboard', 'employees', 'attendance-reports', 'jurnal-reports', 'leave-reports'];
            const employeePages = ['dashboard', 'absensi', 'face-recognition', 'izin', 'jurnal', 'cuti'];

            if (this.isAdmin() || this.isPemilik()) {
                // Show admin-style menu, hide employee menu
                if (employeeMenu) employeeMenu.classList.add('hidden');
                if (adminMenu) adminMenu.classList.remove('hidden');
                if (bottomNav) bottomNav.style.display = 'none';
                if (adminBottomNav) adminBottomNav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';

                const allowedPages = this.isPemilik() ? pemilikPages : adminPages;
                const restoredPage = allowedPages.includes(hashPage) ? hashPage : (allowedPages.includes(storedPage) ? storedPage : '');
                targetPage = restorePage && restoredPage ? restoredPage : 'admin-dashboard';
            } else {
                // Show employee menu, hide admin menu
                if (employeeMenu) employeeMenu.classList.remove('hidden');
                if (adminMenu) adminMenu.classList.add('hidden');
                if (bottomNav) bottomNav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
                if (adminBottomNav) adminBottomNav.style.display = 'none';

                const restoredPage = employeePages.includes(hashPage) ? hashPage : (employeePages.includes(storedPage) ? storedPage : '');
                targetPage = restorePage && restoredPage ? restoredPage : 'dashboard';
            }

            // Navigate to the appropriate page for the current session
            storage.set('currentPage', targetPage);
            if (restorePage) {
                router.showPage(targetPage, false);
            } else {
                router.navigate(targetPage);
            }

            // Initialize mobile
            if (window.mobile) {
                window.mobile.handleResize();
            }
        }
    },

    showLogin() {
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app-container');

        if (loginContainer && appContainer) {
            appContainer.classList.add('hidden');
            appContainer.classList.remove('role-admin', 'role-owner', 'role-employee');
            loginContainer.style.display = 'flex';

            // Reset form
            const loginForm = document.getElementById('login-form');
            if (loginForm) loginForm.reset();
        }
        this.stopKeepAlive();
    },

    updateUserUI() {
        if (!this.currentUser) return;

        // Update user info in sidebar
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const userAvatarEl = document.getElementById('user-avatar');
        const mobileUserAvatarEl = document.getElementById('mobile-user-avatar');
        const welcomeNameEl = document.getElementById('welcome-name');

        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        if (userRoleEl) userRoleEl.textContent = this.getRoleLabel();
        if (userAvatarEl) userAvatarEl.src = getAvatarUrl(this.currentUser);
        if (mobileUserAvatarEl) mobileUserAvatarEl.src = getAvatarUrl(this.currentUser);
        if (welcomeNameEl) welcomeNameEl.textContent = this.currentUser.name.split(' ')[0];
    },

    async openProfileModal() {
        const modal = document.getElementById('modal-profile');
        if (!modal) return;

        const user = this.currentUser;
        if (!user) return;

        // Set basic info
        document.getElementById('profile-avatar').src = getAvatarUrl(user);
        document.getElementById('profile-name').textContent = user.name || '-';
        document.getElementById('profile-email').textContent = user.email || '-';
        const role = this.normalizeUserRole(user.role, user.id);
        const isKaryawan = role === 'karyawan';
        document.getElementById('profile-role').textContent = this.getRoleLabel(role);

        // Employee-specific fields
        const empFields = document.getElementById('profile-employee-fields');
        if (isKaryawan) {
            document.getElementById('profile-division').textContent = getEmployeeDivision(user) || '-';
            document.getElementById('profile-position').textContent = user.position || '-';
            document.getElementById('profile-shift').textContent = user.shift || '-';
            if (empFields) empFields.style.display = 'block';
        } else {
            if (empFields) empFields.style.display = 'none';
        }

        // Clear password form
        document.getElementById('old-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

        modal.style.display = 'flex';

        if (isKaryawan) {
            // Refresh profile from backend after the modal is visible.
            try {
                const result = await api.getEmployeeProfile(user.id);
                if (result.success && result.data) {
                    const profile = result.data;
                    document.getElementById('profile-division').textContent = getEmployeeDivision(profile) || '-';
                    document.getElementById('profile-position').textContent = profile.position || '-';
                    document.getElementById('profile-shift').textContent = profile.shift || '-';
                }
            } catch (e) {
                console.warn('Gagal memuat ulang profil dari backend:', e);
            }
        }
    },

    async handleChangePassword() {
        const oldPwd = document.getElementById('old-password').value;
        const newPwd = document.getElementById('new-password').value;
        const confirmPwd = document.getElementById('confirm-password').value;

        if (!oldPwd || !newPwd || !confirmPwd) {
            toast.error('Semua field password harus diisi!');
            return;
        }
        if (newPwd !== confirmPwd) {
            toast.error('Password baru dan konfirmasi tidak cocok!');
            return;
        }
        if (newPwd.length < 4) {
            toast.error('Password minimal 4 karakter!');
            return;
        }

        try {
            const result = await api.changePassword(this.currentUser.id, oldPwd, newPwd);
            if (result.success) {
                toast.success('Password berhasil diubah!');
                document.getElementById('old-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } else {
                toast.error(result.error || 'Gagal mengubah password');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error('Terjadi kesalahan');
        }
    },

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('login-password');
        const toggleBtn = document.getElementById('toggle-password');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            passwordInput.type = 'password';
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    },

    isLoggedIn() {
        return this.currentUser !== null;
    },

    isAdmin() {
        return this.currentUser && this.normalizeUserRole(this.currentUser.role, this.currentUser.id) === 'admin';
    },

    isPemilik() {
        return this.currentUser && this.normalizeUserRole(this.currentUser.role, this.currentUser.id) === 'pemilik';
    },

    isKaryawan() {
        return this.currentUser && this.normalizeUserRole(this.currentUser.role, this.currentUser.id) === 'karyawan';
    },

    canManageEmployees() {
        return this.isAdmin();
    },

    canAccessAdminReports() {
        return this.isAdmin() || this.isPemilik();
    },

    applyRoleVisibility() {
        const hideAdminOnly = this.isPemilik();
        document.querySelectorAll('[data-admin-only="true"]').forEach(element => {
            element.hidden = hideAdminOnly;
            element.style.display = hideAdminOnly ? 'none' : '';
        });
    },

    getRoleLabel(role = '') {
        const normalized = role ? this.normalizeUserRole(role) : (this.currentUser ? this.normalizeUserRole(this.currentUser.role, this.currentUser.id) : '');
        if (normalized === 'admin') return 'Administrator';
        if (normalized === 'pemilik') return 'Pemilik';
        return 'Karyawan';
    },

    getCurrentUser() {
        return this.currentUser;
    },

    normalizeUserRole(role, userId = '') {
        const normalized = String(role || '').toLowerCase().trim();
        if (normalized === 'admin' || normalized === 'administrator') return 'admin';
        if (normalized === 'pemilik' || normalized === 'owner') return 'pemilik';
        if (normalized === 'employee' || normalized === 'karyawan') return 'karyawan';
        return String(userId || '').toLowerCase() === 'admin' ? 'admin' : 'karyawan';
    }
};

// Initialize auth on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    auth.init();
});

// Expose to global
window.auth = auth;
