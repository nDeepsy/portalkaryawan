/**
 * Portal Karyawan - Izin/Sakit
 * Leave permission functionality
 */

const izin = {
    initialized: false,
    izinData: [],
    currentFile: null,
    verifiedData: null,
    selectedSummaryMonth: '',
    currentPreviewUrl: null,
    isSubmitting: false,

    async init() {
        if (!this.initialized) {
            this.loadCachedIzin();
            this.initForm();
            this.initFilters();
            this.initSummaryMonthFilter();
            this.renderIzinList();
            this.updateStats();
            this.initialized = true;
        }

        this.loadIzinData();

        const dateInput = document.getElementById('izin-date');
        if (dateInput) {
            dateInput.valueAsDate = new Date();
        }
    },

    loadCachedIzin() {
        const cached = storage.get('izin', []);
        if (cached && cached.length) {
            this.izinData = cached;
        }
    },

    async loadIzinData() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            const result = auth.isAdmin() ? await api.getAllIzin() : await api.getIzin(userId);
            this.izinData = result.data || [];
            storage.set('izin', this.izinData);
            this.renderIzinList();
            this.updateStats();
        } catch (error) {
            console.error('Error loading izin:', error);
            this.izinData = storage.get('izin', []);
            this.renderIzinList();
            this.updateStats();
        }
    },

    initForm() {
        const form = document.getElementById('izin-form');
        const verifyBtn = document.getElementById('btn-verify-izin');
        const fileInput = document.getElementById('izin-document');
        const fileUpload = document.getElementById('file-upload');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitIzin();
            });
        }

        if (verifyBtn) {
            verifyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.submitIzin();
            });
        }

        // File upload handling
        if (fileUpload && fileInput) {
            fileUpload.addEventListener('click', () => fileInput.click());

            fileUpload.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUpload.classList.add('dragover');
            });

            fileUpload.addEventListener('dragleave', () => {
                fileUpload.classList.remove('dragover');
            });

            fileUpload.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUpload.classList.remove('dragover');
                if (e.dataTransfer.files.length) {
                    this.handleFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleFile(e.target.files[0]);
                }
            });
        }

        // Remove file button
        const removeBtn = document.querySelector('.btn-remove-file');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile();
            });
        }

        this.initFilters();
    },

    initFilters() {
    },

    handleFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

        if (file.size > maxSize) {
            toast.error('File terlalu besar. Maksimum 5MB');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            toast.error('Format file tidak didukung. Gunakan PDF, JPG, atau PNG');
            return;
        }

        this.currentFile = file;

        // Update UI
        const uploadArea = document.querySelector('.upload-area');
        const filePreview = document.getElementById('file-preview');
        const filename = filePreview?.querySelector('.filename');
        const imagePreview = document.getElementById('izin-image-preview');
        const fileIcon = document.getElementById('izin-file-icon');

        if (this.currentPreviewUrl) {
            URL.revokeObjectURL(this.currentPreviewUrl);
            this.currentPreviewUrl = null;
        }

        if (uploadArea) uploadArea.style.display = 'none';
        if (filePreview) filePreview.style.display = 'flex';
        if (filename) filename.textContent = file.name;
        if (imagePreview && file.type.startsWith('image/')) {
            this.currentPreviewUrl = URL.createObjectURL(file);
            imagePreview.src = this.currentPreviewUrl;
            imagePreview.style.display = 'block';
            if (fileIcon) fileIcon.style.display = 'none';
        } else {
            if (imagePreview) {
                imagePreview.removeAttribute('src');
                imagePreview.style.display = 'none';
            }
            if (fileIcon) fileIcon.style.display = '';
        }
    },

    initSummaryMonthFilter() {
        const monthInput = document.getElementById('izin-summary-month');
        if (!monthInput || monthInput.dataset.bound === 'true') return;

        this.selectedSummaryMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        monthInput.value = this.selectedSummaryMonth;
        monthInput.dataset.bound = 'true';
        monthInput.addEventListener('change', (event) => {
            this.selectedSummaryMonth = event.target.value || this.getCurrentSummaryMonth();
            this.updateStats();
            this.renderIzinList();
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

    removeFile() {
        this.currentFile = null;
        if (this.currentPreviewUrl) {
            URL.revokeObjectURL(this.currentPreviewUrl);
            this.currentPreviewUrl = null;
        }

        const uploadArea = document.querySelector('.upload-area');
        const filePreview = document.getElementById('file-preview');
        const fileInput = document.getElementById('izin-document');
        const imagePreview = document.getElementById('izin-image-preview');
        const fileIcon = document.getElementById('izin-file-icon');

        if (uploadArea) uploadArea.style.display = 'block';
        if (filePreview) filePreview.style.display = 'none';
        if (fileInput) fileInput.value = '';
        if (imagePreview) {
            imagePreview.removeAttribute('src');
            imagePreview.style.display = 'none';
        }
        if (fileIcon) fileIcon.style.display = '';
    },

    async submitIzin() {
        if (this.isSubmitting) return;

        // Validate form first
        const type = document.getElementById('izin-type')?.value;
        const date = document.getElementById('izin-date')?.value;
        const duration = document.getElementById('izin-duration')?.value;
        const reason = document.getElementById('izin-reason')?.value;

        if (!type || !date || !duration || !reason) {
            toast.error('Harap isi semua field yang wajib diisi!');
            return;
        }

        const typeLabels = {
            'sick': 'Sakit',
            'permission': 'Izin Penting',
            'emergency': 'Keadaan Darurat'
        };

        const currentUser = auth.getCurrentUser();
        const tempId = Date.now();
        const selectedFile = this.currentFile;
        const submitButton = document.getElementById('btn-verify-izin') || document.querySelector('#izin-form button[type="submit"]');
        const originalButtonHtml = submitButton?.innerHTML;

        const izinEntry = {
            id: tempId,
            userId: currentUser?.id || 'demo-user',
            employeeName: currentUser?.name || currentUser?.email || '',
            type,
            typeLabel: typeLabels[type] || type,
            date,
            duration: parseInt(duration),
            reason,
            hasAttachment: !!selectedFile,
            attachmentName: selectedFile?.name || '',
            attachmentType: selectedFile?.type || '',
            attachmentData: '',
            verificationPhoto: '',
            verificationLocation: '',
            verificationTimestamp: '',
            status: 'pending',
            appliedAt: new Date().toISOString()
        };

        this.isSubmitting = true;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
        }

        this.izinData.unshift(izinEntry);
        api.clearRequestCacheForMutation('submitIzin');
        this.renderIzinList();
        this.updateStats();

        const form = document.getElementById('izin-form');
        if (form) form.reset();
        this.removeFile();

        try {
            const attachment = await this.getAttachmentPayloadFromFile(selectedFile);

            if (selectedFile?.type?.startsWith('image/') && !attachment.data) {
                throw new Error('Foto lampiran gagal diproses. Coba pilih foto lain.');
            }

            const payload = {
                ...izinEntry,
                hasAttachment: !!selectedFile,
                attachmentName: attachment.name,
                attachmentType: attachment.type,
                attachmentData: attachment.data
            };

            const result = await api.submitIzin(payload);

            if (!result?.success) {
                throw new Error(result?.error || 'Gagal mengirim pengajuan izin');
            }

            if (result.data) {
                const idx = this.izinData.findIndex(i => String(i.id) === String(tempId));
                if (idx >= 0) {
                    this.izinData[idx] = result.data;
                    storage.set('izin', this.izinData);
                    this.renderIzinList();
                    this.updateStats();
                }
            }

            api.clearRequestCacheForMutation('submitIzin');
            if (window.notificationCenter) {
                notificationCenter.refreshForCurrentUser({ silent: true });
            }
            toast.success('Pengajuan izin berhasil dikirim!');
        } catch (error) {
            console.error('Error submitting izin:', error);
            this.izinData = this.izinData.filter(i => String(i.id) !== String(tempId));
            storage.set('izin', this.izinData);
            api.clearRequestCacheForMutation('submitIzin');
            this.renderIzinList();
            this.updateStats();
            toast.error(error.message || 'Gagal mengirim pengajuan izin');
        } finally {
            this.isSubmitting = false;
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonHtml || '<i class="fas fa-paper-plane"></i> Kirim Pengajuan';
            }
        }
    },

    async getAttachmentPayload() {
        return this.getAttachmentPayloadFromFile(this.currentFile);
    },

    async getAttachmentPayloadFromFile(file) {
        if (!file) {
            return { name: '', type: '', data: '' };
        }

        const payload = {
            name: file.name,
            type: file.type,
            data: ''
        };

        if (!file.type.startsWith('image/')) {
            return payload;
        }

        payload.data = await this.compressImageFile(file);
        return payload;
    },

    compressImageFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxSide = 700;
                    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                    canvas.width = Math.max(1, Math.round(img.width * scale));
                    canvas.height = Math.max(1, Math.round(img.height * scale));

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    let quality = 0.72;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    while (dataUrl.length > 45000 && quality > 0.35) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }

                    resolve(dataUrl);
                };
                img.onerror = () => resolve('');
                img.src = reader.result;
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
        });
    },

    async submitWithVerification() {
        return this.submitIzin();
    },

    updateStats() {
        const { pending, approved, rejected } = this.getIzinStatsForSelectedMonth();

        const pendingEl = document.getElementById('izin-pending-count');
        const approvedEl = document.getElementById('izin-approved-count');
        const rejectedEl = document.getElementById('izin-rejected-count');

        if (pendingEl) pendingEl.textContent = pending;
        if (approvedEl) approvedEl.textContent = approved;
        if (rejectedEl) rejectedEl.textContent = rejected;
    },

    getIzinStatsForSelectedMonth() {
        const selectedMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        const items = this.izinData.filter(item => this.isDateInSelectedMonth(item.date || item.appliedAt, selectedMonth));

        return {
            pending: items.filter(i => i.status === 'pending').length,
            approved: items.filter(i => i.status === 'approved').length,
            rejected: items.filter(i => i.status === 'rejected').length
        };
    },

    isDateInSelectedMonth(value, selectedMonth) {
        if (!value || !selectedMonth) return false;
        const [yearText, monthText] = String(selectedMonth).split('-');
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return !Number.isNaN(date.getTime()) &&
            date.getFullYear() === Number(yearText) &&
            date.getMonth() === Number(monthText) - 1;
    },

    renderIzinList() {
        const list = document.getElementById('izin-list');
        if (!list) return;

        // Riwayat mengikuti bulan yang dipilih pada Ringkasan Izin.
        let filteredData = this.izinData.filter(i =>
            this.isDateInSelectedMonth(i.date || i.appliedAt, this.selectedSummaryMonth || this.getCurrentSummaryMonth())
        );

        if (filteredData.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>Belum ada pengajuan izin pada bulan ini</p>
                </div>
            `;
            return;
        }

        // Sort by date descending
        const sortedData = filteredData.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

        list.innerHTML = sortedData.map(izin => {
            const date = new Date(izin.date);
            const dateFormatted = dateTime.formatDate(date, 'short');

            const icons = {
                'sick': 'fa-heartbeat',
                'permission': 'fa-hand-paper',
                'emergency': 'fa-exclamation-triangle'
            };

            return `
                <div class="izin-item">
                    <div class="izin-icon ${izin.type}">
                        <i class="fas ${icons[izin.type] || 'fa-file'}"></i>
                    </div>
                    <div class="izin-content">
                        <div class="izin-header-row">
                            <h4 class="izin-type">${izin.typeLabel}</h4>
                            <span class="izin-status ${izin.status}">${this.getStatusLabel(izin.status)}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date">
                                <i class="fas fa-calendar"></i>
                                ${dateFormatted} (${izin.duration} hari)
                            </span>
                        </div>
                        <p class="izin-reason">${izin.reason}</p>
                        ${izin.hasAttachment ? `
                            <span class="izin-attachment">
                                <i class="fas fa-paperclip"></i>
                                Lampiran tersedia
                            </span>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    getStatusLabel(status) {
        const labels = {
            'pending': 'Menunggu',
            'approved': 'Disetujui',
            'rejected': 'Ditolak'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.approveIzin(id);
            const izin = this.izinData.find(i => i.id === id);
            if (izin) { izin.status = 'approved'; }
            this.renderIzinList();
            this.updateStats();
            toast.success('Pengajuan izin disetujui');
        } catch (error) {
            console.error('Error approving izin:', error);
        }
    },

    async rejectIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.rejectIzin(id);
            const izin = this.izinData.find(i => i.id === id);
            if (izin) { izin.status = 'rejected'; }
            this.renderIzinList();
            this.updateStats();
            toast.info('Pengajuan izin ditolak');
        } catch (error) {
            console.error('Error rejecting izin:', error);
        }
    }
};

// Global init function
window.initIzin = () => {
    izin.init();
};

// Expose
window.izin = izin;
