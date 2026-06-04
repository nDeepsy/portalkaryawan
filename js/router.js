/**
 * Portal Karyawan - Router
 * Simple SPA Router for vanilla JS
 */

const router = {
    currentPage: 'dashboard',
    routes: ['dashboard', 'absensi', 'face-recognition', 'izin', 'jurnal', 'cuti', 
             'admin-dashboard', 'employees', 'attendance-reports', 'jurnal-reports', 
             'leave-reports', 'shift-schedule', 'settings'],
    adminPages: ['admin-dashboard', 'employees', 'attendance-reports', 'jurnal-reports', 'leave-reports', 'shift-schedule', 'settings'],
    pemilikPages: ['admin-dashboard', 'employees', 'attendance-reports', 'jurnal-reports', 'leave-reports'],
    employeePages: ['dashboard', 'absensi', 'face-recognition', 'izin', 'jurnal', 'cuti'],
    
    init() {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }

        // Handle navigation clicks
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) {
                    this.navigate(page);
                }
            });
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.showPage(e.state.page, false);
            }
        });
        
        // Halaman awal setelah login/session dipilih oleh auth.showApp():
        // admin -> Dashboard Admin, karyawan -> Dashboard.
    },
    
    navigate(page) {
        if (!this.routes.includes(page)) return;

        const allowedPage = this.resolvePageForRole(page);
        this.showPage(allowedPage, true);
        storage.set('currentPage', allowedPage);
    },
    
    showPage(page, pushState = true) {
        page = this.resolvePageForRole(page);
        this.currentPage = page;
        
        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            absensi: 'Absensi',
            izin: 'Izin / Sakit',
            jurnal: 'Jurnal Kerja',
            cuti: 'Pengajuan Cuti',
            'admin-dashboard': 'Dashboard Admin',
            employees: 'Data Karyawan',
            'attendance-reports': 'Rekap Absensi',
            'jurnal-reports': 'Rekap Jurnal',
            'leave-reports': 'Rekap Cuti & Izin',
            'shift-schedule': 'Jadwal Shift',
            settings: 'Settings'
        };
        
        const appName = typeof APP_COMPANY_NAME !== 'undefined' ? APP_COMPANY_NAME : 'PT Magtas Radio 107.3 FM';
        document.title = `${titles[page]} - ${appName}`;
        
        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
        
        // Show/hide pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        const targetPage = document.getElementById(`page-${page}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // Update page title in header
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            pageTitle.textContent = titles[page];
        }
        
        // Push state for browser history
        if (pushState) {
            history.pushState({ page }, titles[page], `#${page}`);
        }
        
        // Trigger page-specific init functions
        this.triggerPageInit(page);
        
        this.resetPageScroll(page);

        if (window.notificationCenter && typeof window.notificationCenter.clearForPage === 'function') {
            window.notificationCenter.clearForPage(page);
        }

        if (window.api && typeof api.prefetchForUser === 'function' && typeof auth !== 'undefined' && auth.getCurrentUser) {
            api.prefetchForUser(auth.getCurrentUser());
        }
    },

    resolvePageForRole(page) {
        const isLoggedIn = typeof auth !== 'undefined' && typeof auth.isLoggedIn === 'function' && auth.isLoggedIn();
        if (!isLoggedIn) return page;

        const isAdmin = typeof auth !== 'undefined' && typeof auth.isAdmin === 'function' && auth.isAdmin();
        const isPemilik = typeof auth !== 'undefined' && typeof auth.isPemilik === 'function' && auth.isPemilik();

        if (isPemilik) {
            if (this.pemilikPages.includes(page)) return page;
            return 'admin-dashboard';
        }

        if (isAdmin && this.employeePages.includes(page)) return 'admin-dashboard';
        if (!isAdmin && this.adminPages.includes(page)) return 'dashboard';
        return page;
    },

    resetPageScroll(page) {
        const scrollToTop = () => {
            const pageContent = document.getElementById('page-content') || document.querySelector('.page-content');
            const mainContent = document.querySelector('.main-content');
            const activePage = document.getElementById(`page-${page}`);

            if (pageContent) pageContent.scrollTop = 0;
            if (mainContent) mainContent.scrollTop = 0;
            if (activePage) activePage.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;

            if (window.scrollTo) {
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }
        };

        scrollToTop();
        requestAnimationFrame(scrollToTop);
        setTimeout(scrollToTop, 80);
        setTimeout(scrollToTop, 250);
    },
    
    triggerPageInit(page) {
        // Call init function for each page if exists
        switch(page) {
            case 'dashboard':
                if (window.initDashboard) window.initDashboard();
                break;
            case 'absensi':
                if (window.initAbsensi) window.initAbsensi();
                break;
            case 'face-recognition':
                if (window.initFaceRecognition) {
                    const pendingAction = storage.get('pending_attendance_action', '');
                    if (pendingAction) {
                        window.initFaceRecognition(pendingAction);
                    } else {
                        router.navigate('absensi');
                    }
                }
                break;
            case 'izin':
                if (window.initIzin) window.initIzin();
                break;
            case 'jurnal':
                if (window.initJurnal) window.initJurnal();
                break;
            case 'cuti':
                if (window.initCuti) window.initCuti();
                break;
            case 'admin-dashboard':
                if (window.initAdminDashboard) window.initAdminDashboard();
                break;
            case 'employees':
                if (window.initEmployees) window.initEmployees();
                break;
            case 'attendance-reports':
                if (window.initAttendanceReports) window.initAttendanceReports();
                break;
            case 'jurnal-reports':
                if (window.initJurnalReports) window.initJurnalReports();
                break;
            case 'leave-reports':
                if (window.initLeaveReports) window.initLeaveReports();
                break;
            case 'shift-schedule':
                if (window.initShiftSchedule) window.initShiftSchedule();
                break;
            case 'settings':
                if (window.initSettings) window.initSettings();
                break;
        }
        
        // Update mobile bottom nav
        if (window.mobile) {
            window.mobile.updateBottomNav(page);
        }
    }
};

// Initialize router on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    router.init();
});

// Expose to global
window.router = router;
