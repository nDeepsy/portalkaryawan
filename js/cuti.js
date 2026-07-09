/**
 * Portal Karyawan - Cuti/Leave
 * Leave request functionality
 */

const cuti = {
    initialized: false,
    leaves: [],
    leaveBalance: 12,
    annualLeaveDays: 12,
    selectedSummaryMonth: '',
    isSubmitting: false,
    settingsListenerBound: false,
    dataUpdateBound: false,

    async init() {
        if (!this.initialized) {
            this.initSettingsListener();
            this.loadCachedLeaves();
            this.initForm();
            this.initFilters();
            this.initSummaryMonthFilter();
            this.renderLeaveList();
            this.updateStats();
            this.initialized = true;
        }

        this.loadLeaves();
    },

    initSettingsListener() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        if (!this.settingsListenerBound) {
            window.addEventListener('settingsUpdated', (event) => this.handleSettingsUpdated(event));
            this.settingsListenerBound = true;
        }
        if (!this.dataUpdateBound) {
            window.addEventListener('dataUpdated', (event) => this.handleDataUpdated(event));
            this.dataUpdateBound = true;
        }
    },

    handleSettingsUpdated(event) {
        const section = event?.detail?.section || '';
        if (section !== 'system') return;

        const value = event?.detail?.values?.annual_leave_days ?? storage.get('app_settings', {})?.annual_leave_days ?? 12;
        this.applyAnnualLeaveSetting(value);
        this.updateStats();
        this.renderLeaveList();
    },

    async handleDataUpdated(event) {
        const detail = event?.detail || {};
        const relevantTypes = ['settings', 'leaves', 'employees'];
        if (!relevantTypes.includes(detail.type)) return;
        if (router?.currentPage !== 'cuti') return;

        this.loadCachedLeaves();
        this.updateStats();
        this.renderLeaveList();
        await this.loadLeaves();
    },

    loadCachedLeaves() {
        const cachedLeaves = storage.get('leaves', []);
        if (cachedLeaves && cachedLeaves.length) {
            this.leaves = cachedLeaves;
        }
        const cachedSettings = storage.get('app_settings', {});
        this.applyAnnualLeaveSetting(cachedSettings.annual_leave_days || 12);
    },

    async loadLeaves() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            const [leaveRequest, settingsRequest] = await Promise.allSettled([
                auth.isAdmin() ? api.getAllLeaves() : api.getLeaves(userId),
                api.getSettings ? api.getSettings() : Promise.resolve({ success: false })
            ]);
            const result = leaveRequest.status === 'fulfilled' ? leaveRequest.value : { data: [] };
            const settingsResult = settingsRequest.status === 'fulfilled' ? settingsRequest.value : null;
            this.leaves = result.data || [];
            storage.set('leaves', this.leaves);
            if (settingsResult?.success && settingsResult.data) {
                storage.set('app_settings', {
                    ...storage.get('app_settings', {}),
                    ...settingsResult.data
                });
                this.applyAnnualLeaveSetting(settingsResult.data.annual_leave_days ?? 12);
            }
        } catch (error) {
            console.error('Error loading leaves:', error);
            this.leaves = storage.get('leaves', []);
        }

        this.refreshLeaveBalance(userId);
        this.renderLeaveList();
        this.updateStats();
        this.updateBalanceDisplay();
    },

    getCurrentYear() {
        return new Date().getFullYear();
    },

    applyAnnualLeaveSetting(value) {
        const numeric = Number(value);
        const parsed = Number.isFinite(numeric) ? Math.min(365, Math.max(0, numeric)) : 12;
        this.annualLeaveDays = parsed;
        const userId = auth.getCurrentUser()?.id || 'demo-user';
        this.refreshLeaveBalance(userId);
        this.updateBalanceDisplay();
    },

    refreshLeaveBalance(userId) {
        this.leaveBalance = this.calculateLeaveBalance(this.getCurrentYear(), userId);
    },

    calculateLeaveBalance(year = this.getCurrentYear(), userId = auth.getCurrentUser()?.id || 'demo-user') {
        const usedDays = this.leaves.reduce((total, leave) => {
            if (!this.isAnnualLeaveCountedForBalance(leave, userId)) return total;
            return total + this.countLeaveDaysInYear(leave.startDate, leave.endDate, year, leave.duration);
        }, 0);

        return Math.max(0, this.annualLeaveDays - usedDays);
    },

    isAnnualLeaveCountedForBalance(leave, userId) {
        if (!leave) return false;
        const status = String(leave.status || '').toLowerCase();
        const type = String(leave.type || '').toLowerCase();
        return String(leave.userId || '') === String(userId || '') &&
            type === 'annual' &&
            status === 'approved';
    },

    countLeaveDaysInYear(startDate, endDate, year, fallbackDuration = 0) {
        if (!startDate || !endDate) return Number(fallbackDuration) || 0;

        const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
        const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            return Number(fallbackDuration) || 0;
        }

        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31);
        const overlapStart = start > yearStart ? start : yearStart;
        const overlapEnd = end < yearEnd ? end : yearEnd;
        if (overlapEnd < overlapStart) return 0;

        return Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
    },

    initForm() {
        const form = document.getElementById('cuti-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Auto-calculate duration when dates change
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const duration = document.getElementById('leave-duration');

        const calculateDuration = () => {
            if (startDate.value && endDate.value) {
                const start = new Date(startDate.value);
                const end = new Date(endDate.value);
                const diffTime = end - start;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                if (diffDays > 0) {
                    duration.value = `${diffDays} hari`;
                } else {
                    duration.value = '0 hari';
                }
            }
        };

        if (startDate) startDate.addEventListener('change', calculateDuration);
        if (endDate) endDate.addEventListener('change', calculateDuration);
    },

    async handleSubmit(e) {
        e.preventDefault();
        if (this.isSubmitting) return;

        const type = document.getElementById('leave-type');
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const reason = document.getElementById('leave-reason');
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalButtonHtml = submitButton?.innerHTML;

        if (!type.value || !startDate.value || !endDate.value || !reason.value) {
            toast.error('Semua field harus diisi!');
            return;
        }

        if (type.value === 'sick') {
            toast.error('Cuti sakit diajukan melalui menu Izin / Sakit.');
            return;
        }

        // Calculate duration
        const start = new Date(startDate.value);
        const end = new Date(endDate.value);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 0) {
            toast.error('Tanggal selesai harus setelah tanggal mulai!');
            return;
        }

        // The configured allowance applies only to annual leave.
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        if (type.value === 'annual') {
            this.refreshLeaveBalance(userId);
            if (diffDays > this.leaveBalance) {
                toast.error('Sisa cuti tahunan tidak mencukupi!');
                return;
            }
        }

        const typeLabels = {
            annual: 'Cuti Tahunan',
            sick: 'Cuti Sakit',
            important: 'Cuti Penting',
            maternity: 'Cuti Melahirkan',
            other: 'Lainnya'
        };

        const leaveData = {
            userId,
            employeeName: currentUser?.name || currentUser?.email || '',
            type: type.value,
            typeLabel: typeLabels[type.value],
            startDate: startDate.value,
            endDate: endDate.value,
            duration: diffDays,
            reason: reason.value
        };

        const tempId = Date.now();
        const tempLeave = {
            id: tempId,
            status: 'pending',
            appliedAt: new Date().toISOString(),
            ...leaveData
        };

        this.isSubmitting = true;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
        }

        this.leaves.unshift(tempLeave);
        api.clearRequestCacheForMutation('submitLeave');
        this.renderLeaveList();
        this.updateStats();

        if (type.value === 'annual') {
            this.refreshLeaveBalance(userId);
            this.updateBalanceDisplay();
        }

        e.target.reset();
        const durationInput = document.getElementById('leave-duration');
        if (durationInput) durationInput.value = '';

        try {
            const result = await api.submitLeave(leaveData);
            if (result.success && result.data) {
                const idx = this.leaves.findIndex(l => l.id === tempId);
                if (idx >= 0) {
                    this.leaves[idx] = result.data;
                }
                storage.set('leaves', this.leaves);
                api.clearRequestCacheForMutation('submitLeave');
                this.renderLeaveList();
                this.updateStats();
                if (window.notificationCenter) {
                    notificationCenter.refreshForCurrentUser({ silent: true });
                }
                toast.success('Pengajuan cuti berhasil dikirim!');
            } else {
                throw new Error(result.error || 'Gagal mengajukan cuti');
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            this.leaves = this.leaves.filter(l => String(l.id) !== String(tempId));
            storage.set('leaves', this.leaves);
            api.clearRequestCacheForMutation('submitLeave');
            this.refreshLeaveBalance(userId);
            this.updateBalanceDisplay();
            this.renderLeaveList();
            this.updateStats();
            toast.error(error.message || 'Terjadi kesalahan');
        } finally {
            this.isSubmitting = false;
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonHtml || '<i class="fas fa-paper-plane"></i> Ajukan Cuti';
            }
        }
    },

    initFilters() {
    },

    initSummaryMonthFilter() {
        const monthInput = document.getElementById('cuti-summary-month');
        if (!monthInput || monthInput.dataset.bound === 'true') return;

        this.selectedSummaryMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        monthInput.value = this.selectedSummaryMonth;
        monthInput.dataset.bound = 'true';
        monthInput.addEventListener('change', (event) => {
            this.selectedSummaryMonth = event.target.value || this.getCurrentSummaryMonth();
            this.updateStats();
            this.renderLeaveList();
        });
    },

    getCurrentSummaryMonth() {
        const todayValue = typeof dateTime !== 'undefined' && dateTime.getLocalDate
            ? dateTime.getLocalDate()
            : new Date().toISOString().slice(0, 10);
        const today = new Date(`${String(todayValue).slice(0, 10)}T00:00:00`);
        const safeDate = Number.isNaN(today.getTime()) ? new Date() : today;
        return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`;
    },

    updateBalanceDisplay() {
        const balanceEl = document.querySelector('.balance-value');
        if (balanceEl) {
            balanceEl.textContent = this.leaveBalance;
        }
    },

    updateStats() {
        const { pending, approved, rejected } = this.getLeaveStatsForSelectedMonth();

        const statValues = document.querySelectorAll('.leave-stats .stat-value');
        if (statValues.length >= 3) {
            statValues[0].textContent = pending;
            statValues[1].textContent = approved;
            statValues[2].textContent = rejected;
        }
    },

    getLeaveStatsForSelectedMonth() {
        const selectedMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        const items = this.leaves.filter(leave => this.isLeaveInSelectedMonth(leave, selectedMonth));

        return {
            pending: items.filter(l => l.status === 'pending').length,
            approved: items.filter(l => l.status === 'approved').length,
            rejected: items.filter(l => l.status === 'rejected').length
        };
    },

    isLeaveInSelectedMonth(leave, selectedMonth) {
        if (!leave || !selectedMonth) return false;

        const [yearText, monthText] = String(selectedMonth).split('-');
        const year = Number(yearText);
        const month = Number(monthText) - 1;
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        const start = new Date(`${String(leave.startDate || leave.date || leave.appliedAt || '').slice(0, 10)}T00:00:00`);
        const end = new Date(`${String(leave.endDate || leave.startDate || leave.date || leave.appliedAt || '').slice(0, 10)}T00:00:00`);

        if (Number.isNaN(monthStart.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return false;
        }

        return start <= monthEnd && end >= monthStart;
    },

    renderLeaveList() {
        const list = document.getElementById('leave-list');
        if (!list) return;

        // Riwayat mengikuti bulan yang dipilih pada Ringkasan Cuti.
        let filteredLeaves = this.leaves.filter(l =>
            this.isLeaveInSelectedMonth(l, this.selectedSummaryMonth || this.getCurrentSummaryMonth())
        );

        if (filteredLeaves.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>Belum ada pengajuan cuti pada bulan ini</p>
                </div>
            `;
            return;
        }

        // Sort by applied date descending
        const sortedLeaves = filteredLeaves.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

        list.innerHTML = sortedLeaves.map(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const startFormatted = dateTime.formatDate(start, 'short');
            const endFormatted = dateTime.formatDate(end, 'short');

            let dateDisplay = startFormatted;
            if (leave.startDate !== leave.endDate) {
                dateDisplay = `${startFormatted} - ${endFormatted}`;
            }

            const icons = {
                annual: 'fa-umbrella-beach',
                sick: 'fa-heartbeat',
                important: 'fa-home',
                maternity: 'fa-baby',
                other: 'fa-question-circle'
            };

            return `
                <div class="leave-item">
                    <div class="leave-icon">
                        <i class="fas ${icons[leave.type] || 'fa-calendar'}"></i>
                    </div>
                    <div class="leave-content">
                        <div class="leave-header">
                            <h4 class="leave-type">${leave.typeLabel}</h4>
                            <span class="leave-status ${leave.status}">${this.getStatusLabel(leave.status)}</span>
                        </div>
                        <div class="leave-details">
                            <span class="leave-date">
                                <i class="fas fa-calendar"></i>
                                ${dateDisplay} (${leave.duration} hari)
                            </span>
                        </div>
                        <p class="leave-reason">${leave.reason}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    isDateInLeaveRange(dateValue, leave) {
        if (!dateValue || !leave) return true;

        const selected = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
        const start = new Date(`${String(leave.startDate || leave.date || '').slice(0, 10)}T00:00:00`);
        const end = new Date(`${String(leave.endDate || leave.startDate || leave.date || '').slice(0, 10)}T00:00:00`);

        if (Number.isNaN(selected.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return false;
        }

        return selected >= start && selected <= end;
    },

    getStatusLabel(status) {
        const labels = {
            pending: 'Menunggu',
            approved: 'Disetujui',
            rejected: 'Ditolak'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveLeave(id) {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        try {
            await api.approveLeave(id);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) { leave.status = 'approved'; }
            this.renderLeaveList();
            this.updateStats();
            toast.success('Pengajuan cuti disetujui!');
        } catch (error) {
            console.error('Error approving leave:', error);
        }
    },

    async rejectLeave(id) {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        try {
            await api.rejectLeave(id);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) {
                leave.status = 'rejected';

                // Return balance for annual leave
                if (leave.type === 'annual') {
                    this.refreshLeaveBalance(leave.userId);
                    this.updateBalanceDisplay();
                }
            }
            this.renderLeaveList();
            this.updateStats();
            toast.info('Pengajuan cuti ditolak!');
        } catch (error) {
            console.error('Error rejecting leave:', error);
        }
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
