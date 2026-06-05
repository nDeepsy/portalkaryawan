/**
 * Portal Karyawan - Jurnal Kerja
 * Daily work journal functionality
 */

const jurnal = {
    initialized: false,
    currentDate: new Date(),
    jurnals: [],
    filter: '',
    sort: 'newest',
    currentPhoto: null,
    historyWindowDays: 30,
    isSubmitting: false,
    attendanceRecords: [],
    activeUserId: '',
    editingDate: '',
    selectedSummaryMonth: '',

    async init() {
        const currentUserId = this.getCurrentUserId();
        if (this.activeUserId !== currentUserId) {
            this.activeUserId = currentUserId;
            this.resetForCurrentUser();
        }

        if (!this.initialized) {
            this.loadCachedJurnals();
            this.loadCachedAttendanceRecords(currentUserId);
            this.initForm();
            this.initFilters();
            this.initSummaryMonthFilter();
            this.initPhotoUpload();
            this.renderJurnalList();
            this.updateUI();
            this.updateSummary();
            this.initialized = true;
        }

        return this.loadJournals();
    },

    resetForCurrentUser() {
        this.jurnals = [];
        this.attendanceRecords = [];
        this.currentPhoto = null;
        this.isSubmitting = false;
        this.clearFormFields();
        this.hidePhotoPreview();
        this.renderJurnalList();
        this.updateSummary();
    },

    loadCachedJurnals() {
        const cached = storage.get('jurnals', []);
        if (cached && cached.length) {
            const currentUserId = this.getCurrentUserId();
            this.jurnals = currentUserId
                ? cached.filter(j => this.getJournalUserId(j) === currentUserId)
                : [];
            this.dedupeJournals();
        }
    },

    dedupeJournals() {
        const uniqueMap = new Map();
        this.jurnals
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
            .forEach(journal => {
                const date = this.getJournalDate(journal);
                if (!date) return;

                journal.date = date;
                const key = `${date}||${this.getJournalUserId(journal)}`;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, journal);
                }
            });
        this.jurnals = Array.from(uniqueMap.values());
    },

    async loadJournals() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        const requestUserId = String(userId);
        try {
            const [result] = await Promise.all([
                api.getJournals(userId),
                this.loadAttendanceRecords(userId)
            ]);
            if (this.activeUserId && this.activeUserId !== requestUserId) return;

            this.jurnals = result.data || [];
            if (currentUser?.id) {
                this.jurnals = this.jurnals.filter(j => this.getJournalUserId(j) === String(currentUser.id));
            } else {
                this.jurnals = [];
            }
            this.dedupeJournals();
            this.persistCurrentUserJournals();
        } catch (error) {
            console.error('Error loading journals:', error);
            await this.loadAttendanceRecords(userId);
            if (this.activeUserId && this.activeUserId !== requestUserId) return;

            const currentUserId = this.getCurrentUserId();
            const cached = storage.get('jurnals', []);
            this.jurnals = currentUserId
                ? cached.filter(j => this.getJournalUserId(j) === currentUserId)
                : [];
            this.dedupeJournals();
        }

        await this.loadScheduleSettings();
        await this.loadCurrentUserProfileDates();
        this.renderJurnalList();
        this.updateUI();
        this.updateSummary();
    },

    async loadAttendanceRecords(userId = this.getCurrentUserId()) {
        const normalizedUserId = String(userId || '');
        const cachedRows = this.getCachedAttendanceRecords(normalizedUserId);
        if (cachedRows.length) {
            this.attendanceRecords = this.mergeAttendanceRecords(cachedRows, this.attendanceRecords);
            this.renderJurnalList();
            this.updateUI();
            this.updateSummary();
        }

        try {
            const result = await api.getAttendance(normalizedUserId);
            if (this.activeUserId && this.activeUserId !== normalizedUserId) return;

            const rows = result?.data || [];
            const remoteRows = rows.filter(row =>
                String(row.userId || row.user_id || '') === normalizedUserId
            );
            this.attendanceRecords = this.mergeAttendanceRecords(this.attendanceRecords, remoteRows);
        } catch (error) {
            console.warn('Tidak bisa memuat data absensi untuk jurnal:', error);
            if (this.activeUserId && this.activeUserId !== normalizedUserId) return;

            this.attendanceRecords = this.mergeAttendanceRecords(this.attendanceRecords, cachedRows);
        }
    },

    loadCachedAttendanceRecords(userId = this.getCurrentUserId()) {
        this.attendanceRecords = this.getCachedAttendanceRecords(userId);
    },

    getCachedAttendanceRecords(userId = this.getCurrentUserId()) {
        const normalizedUserId = String(userId || '');
        const cached = storage.get('attendance', []);
        return (Array.isArray(cached) ? cached : []).filter(row =>
            String(row.userId || row.user_id || '') === normalizedUserId
        );
    },

    mergeAttendanceRecords(existingRows = [], incomingRows = []) {
        const mergedByKey = new Map();
        [...existingRows, ...incomingRows].forEach(row => {
            if (!row) return;
            const userId = String(row.userId || row.user_id || '');
            const date = this.getAttendanceDate(row);
            if (!userId || !date) return;

            const key = `${userId}||${date}`;
            const existing = mergedByKey.get(key);
            if (!existing) {
                mergedByKey.set(key, row);
                return;
            }

            const existingClockOut = String(existing.clockOut || existing.clock_out || '').trim();
            const incomingClockOut = String(row.clockOut || row.clock_out || '').trim();
            mergedByKey.set(key, existingClockOut && !incomingClockOut ? existing : { ...existing, ...row });
        });

        return Array.from(mergedByKey.values());
    },

    persistCurrentUserJournals() {
        const currentUserId = this.getCurrentUserId();
        const cached = storage.get('jurnals', []);
        const otherUsers = cached.filter(j =>
            this.getJournalUserId(j) !== currentUserId
        );
        storage.set('jurnals', [...this.jurnals, ...otherUsers]);
    },

    async loadScheduleSettings() {
        try {
            const result = await api.getSettings();
            if (result?.success && result.data) {
                storage.set('app_settings', result.data);
                this.cacheSchedules(result.data);
            }
        } catch (error) {
            console.warn('Tidak bisa memuat pengaturan jadwal jurnal:', error);
        }
    },

    cacheSchedules(settingsData) {
        const loadedSchedules = {};
        Object.keys(settingsData || {}).forEach(key => {
            if (!key.startsWith('shift_schedule_')) return;
            try {
                loadedSchedules[key.replace('shift_schedule_', '')] = JSON.parse(settingsData[key]);
            } catch (e) { }
        });
        if (Object.keys(loadedSchedules).length) storage.set('shift_schedule', loadedSchedules);
    },

    initForm() {
        const form = document.getElementById('jurnal-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    },

    initFilters() {
    },

    initSummaryMonthFilter() {
        const monthInput = document.getElementById('jurnal-summary-month');
        if (!monthInput) return;
        monthInput.dataset = monthInput.dataset || {};
        if (monthInput.dataset.bound === 'true') return;

        this.selectedSummaryMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        monthInput.value = this.selectedSummaryMonth;
        monthInput.dataset.bound = 'true';
        monthInput.addEventListener('change', (event) => {
            this.selectedSummaryMonth = event.target.value || this.getCurrentSummaryMonth();
            this.updateSummary();
            this.renderJurnalList();
        });
    },

    getCurrentSummaryMonth() {
        const today = this.parseLocalDate(dateTime.getLocalDate()) || new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    },

    getCurrentUserId() {
        const currentUser = auth.getCurrentUser();
        return currentUser?.id ? String(currentUser.id) : '';
    },

    getJournalUserId(journal) {
        return String(
            journal?.userId ??
            journal?.user_id ??
            journal?.employeeId ??
            journal?.employee_id ??
            journal?.karyawanId ??
            journal?.karyawan_id ??
            ''
        );
    },

    isCurrentUserJournal(journal) {
        const currentUserId = this.getCurrentUserId();
        if (!currentUserId) return false;
        return this.getJournalUserId(journal) === currentUserId;
    },

    getStoredEmployee() {
        const currentUser = auth.getCurrentUser();
        if (!currentUser) return null;

        const employees = storage.get('admin_employees', []);
        return employees.find(emp =>
            String(emp.id) === String(currentUser.id) ||
            String(emp.email || '').toLowerCase() === String(currentUser.email || '').toLowerCase()
        ) || null;
    },

    parseLocalDate(value) {
        if (!value) return null;
        if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());

        const normalizedValue = String(value).trim();
        const dateOnly = normalizedValue.split('T')[0].trim();

        const isoParts = dateOnly.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (isoParts) {
            return new Date(Number(isoParts[1]), Number(isoParts[2]) - 1, Number(isoParts[3]));
        }

        const slashParts = dateOnly.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (slashParts) {
            const first = Number(slashParts[1]);
            const second = Number(slashParts[2]);
            const year = Number(slashParts[3].length === 2 ? `20${slashParts[3]}` : slashParts[3]);
            const day = first > 12 ? first : (second > 12 ? second : first);
            const month = first > 12 ? second : (second > 12 ? first : second);
            return new Date(year, month - 1, day);
        }

        const monthMap = {
            jan: 0, januari: 0,
            feb: 1, februari: 1,
            mar: 2, maret: 2,
            apr: 3, april: 3,
            mei: 4, may: 4,
            jun: 5, juni: 5,
            jul: 6, juli: 6,
            agu: 7, agustus: 7, aug: 7, august: 7,
            sep: 8, september: 8,
            okt: 9, oktober: 9, oct: 9, october: 9,
            nov: 10, november: 10,
            des: 11, desember: 11, dec: 11, december: 11
        };
        const textParts = dateOnly.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
        if (textParts && monthMap[textParts[2]] !== undefined) {
            return new Date(Number(textParts[3]), monthMap[textParts[2]], Number(textParts[1]));
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    },

    formatLocalDate(date) {
        return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    getJournalDate(journal) {
        if (!journal) return '';

        const rawDate = journal.date || journal.tanggal || journal.dateStr || journal.createdAt || journal.created_at || journal.updatedAt || journal.updated_at || '';
        const parsed = this.parseLocalDate(rawDate);
        return parsed ? this.formatLocalDate(parsed) : '';
    },

    getJournalForDate(date) {
        return this.jurnals.find(j => {
            const journalDate = this.getJournalDate(j);
            return journalDate === date && this.isCurrentUserJournal(j);
        }) || null;
    },

    getEmployeeStartDate() {
        const currentUser = auth.getCurrentUser();
        const storedEmployee = this.getStoredEmployee();
        const sources = [currentUser, storedEmployee];
        const fields = ['startDate', 'joinDate', 'join_date', 'hireDate', 'createdAt', 'created_at'];

        for (const source of sources) {
            if (!source) continue;
            for (const field of fields) {
                const date = this.parseLocalDate(source[field]);
                if (date) return date;
            }
        }

        return null;
    },

    getAttendanceDate(record) {
        if (!record) return '';
        const parsed = this.parseLocalDate(record.date || record.tanggal || record.createdAt || record.created_at);
        return parsed ? this.formatLocalDate(parsed) : '';
    },

    getAttendanceForDate(date) {
        const currentUserId = this.getCurrentUserId();
        return this.attendanceRecords.find(record => {
            const recordUserId = String(record.userId || record.user_id || '');
            return this.getAttendanceDate(record) === date && (!currentUserId || recordUserId === currentUserId);
        }) || null;
    },

    hasClockedOutForDate(date) {
        const attendance = this.getAttendanceForDate(date);
        return Boolean(String(attendance?.clockOut || attendance?.clock_out || '').trim());
    },

    canAccessJournalForDate(date) {
        const today = dateTime.getLocalDate();
        return this.isJournalWorkday(date) && date <= today && this.hasClockedOutForDate(date);
    },

    getJournalPlan(journal) {
        if (!journal) return '';

        const fields = [
            'plan',
            'rencana',
            'rencanaBesok',
            'rencana_besok',
            'tomorrowPlan',
            'nextPlan',
            'Rencana',
            'Rencana Besok'
        ];

        for (const field of fields) {
            const value = journal[field];
            if (value && String(value).trim() && String(value).trim() !== '-') {
                return String(value).trim();
            }
        }

        return '';
    },

    async loadCurrentUserProfileDates() {
        const currentUser = auth.getCurrentUser();
        if (!currentUser || this.getEmployeeStartDate()) return;

        try {
            const result = await api.getEmployeeProfile(currentUser.id);
            const joinDate = result?.data?.joinDate || result?.data?.join_date || result?.data?.startDate || '';
            if (result?.success && joinDate) {
                currentUser.joinDate = joinDate;
                sessionStorage_manager.set('session', currentUser);
                if (auth.saveKeepAliveSession) auth.saveKeepAliveSession(currentUser);
            }
        } catch (error) {
            console.warn('Tidak bisa memuat tanggal bergabung karyawan:', error);
        }
    },

    getJournalStartDate() {
        const employeeStartDate = this.getEmployeeStartDate();
        const today = this.parseLocalDate(dateTime.getLocalDate());
        if (employeeStartDate) {
            return employeeStartDate > today ? today : employeeStartDate;
        }

        const dateStrings = this.jurnals
            .map(j => j.date)
            .filter(Boolean)
            .sort((a, b) => new Date(a) - new Date(b));

        if (dateStrings.length) {
            return this.parseLocalDate(dateStrings[0]);
        }

        return today;
    },

    generateHistoryDates() {
        const startDate = this.getJournalStartDate();
        const today = this.parseLocalDate(dateTime.getLocalDate());
        const todayStr = this.formatLocalDate(today);
        const dates = [];
        const date = new Date(startDate);
        date.setHours(0, 0, 0, 0);
        while (date <= today) {
            const dateStr = this.formatLocalDate(date);
            if (this.canAccessJournalForDate(dateStr)) {
                dates.push(this.formatLocalDate(date));
            }
            date.setDate(date.getDate() + 1);
        }
        if (!dates.includes(todayStr) && this.canAccessJournalForDate(todayStr)) {
            dates.push(todayStr);
        }

        const uniqueDates = Array.from(new Set(dates)).sort((a, b) => new Date(a) - new Date(b));
        if (uniqueDates.length > this.historyWindowDays) {
            return uniqueDates.slice(uniqueDates.length - this.historyWindowDays);
        }
        return uniqueDates;
    },

    getConfiguredWorkdays() {
        const defaults = {
            minggu: false,
            senin: true,
            selasa: true,
            rabu: true,
            kamis: true,
            jumat: true,
            sabtu: false
        };
        const settings = storage.get('app_settings', {});
        try {
            if (settings.working_days) {
                const parsed = typeof settings.working_days === 'string'
                    ? JSON.parse(settings.working_days)
                    : settings.working_days;
                return { ...defaults, ...parsed };
            }
        } catch (e) { }
        return defaults;
    },

    isJournalWorkday(dateValue) {
        const date = this.parseLocalDate(dateValue);
        if (!date) return false;

        const currentUser = auth.getCurrentUser();
        const userId = String(currentUser?.id || '');
        const schedules = storage.get('shift_schedule', {});
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const day = String(date.getDate());
        const assignedShift = schedules?.[monthKey]?.[userId]?.[day]
            ?? schedules?.[monthKey]?.[userId]?.[date.getDate()];

        if (String(assignedShift || '').toLowerCase() === 'libur') return false;
        if (assignedShift) return true;
        if (String(currentUser?.shift || '').toLowerCase() === 'libur') return false;

        const dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
        const workdays = this.getConfiguredWorkdays();
        return workdays[dayKeys[date.getDay()]] !== false;
    },

    getJournalHistoryItems() {
        const dates = this.generateHistoryDates();
        return dates.map(date => {
            const journal = this.getJournalForDate(date);
            return { date, journal, status: journal ? 'filled' : 'missing' };
        });
    },

    initPhotoUpload() {
        const fileInput = document.getElementById('jurnal-photo');
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');
        const imagePreview = document.getElementById('jurnal-image-preview');
        const removeBtn = document.getElementById('jurnal-btn-remove-file');

        if (!fileInput || !uploadArea) return;

        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handlePhoto(e.dataTransfer.files[0]);
            }
        });

        // File selected
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                this.handlePhoto(e.target.files[0]);
            }
        });

        // Remove photo
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removePhoto();
            });
        }
    },

    handlePhoto(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

        if (file.size > maxSize) {
            toast.error('Foto terlalu besar. Maksimum 5MB');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            toast.error('Format file tidak didukung. Gunakan JPG atau PNG');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.resizePhoto(e.target.result)
                .then(photo => {
                    this.currentPhoto = photo;
                    this.showPhotoPreview();
                })
                .catch(() => {
                    this.currentPhoto = e.target.result;
                    this.showPhotoPreview();
                });
        };
        reader.readAsDataURL(file);
    },

    resizePhoto(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas tidak tersedia'));
                    return;
                }

                let maxSize = 900;
                let output = dataUrl;

                while (maxSize >= 480) {
                    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                    canvas.width = Math.max(1, Math.round(img.width * scale));
                    canvas.height = Math.max(1, Math.round(img.height * scale));
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    let quality = 0.78;
                    output = canvas.toDataURL('image/jpeg', quality);
                    while (output.length > 45000 && quality > 0.35) {
                        quality -= 0.08;
                        output = canvas.toDataURL('image/jpeg', quality);
                    }

                    if (output.length <= 45000) break;
                    maxSize -= 140;
                }

                resolve(output);
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    },

    showPhotoPreview() {
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');
        const imagePreview = document.getElementById('jurnal-image-preview');

        if (uploadArea) uploadArea.style.display = 'none';
        if (filePreview) filePreview.style.display = 'block';
        if (imagePreview) imagePreview.src = this.currentPhoto;
    },

    removePhoto() {
        this.currentPhoto = null;
        const fileInput = document.getElementById('jurnal-photo');
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');

        if (fileInput) fileInput.value = '';
        if (uploadArea) uploadArea.style.display = 'block';
        if (filePreview) filePreview.style.display = 'none';
    },

    async handleSubmit(e) {
        e.preventDefault();
        if (this.isSubmitting) return;

        const dateStr = this.formatLocalDate(this.currentDate);
        if (!this.isJournalWorkday(dateStr)) {
            toast.warning('Jurnal tidak diperlukan pada hari libur.');
            this.updateUI();
            return;
        }
        if (!this.canAccessJournalForDate(dateStr)) {
            toast.warning('Jurnal dapat diisi setelah absen pulang.');
            this.updateUI();
            return;
        }

        const tasks = document.getElementById('jurnal-tasks').value.trim();
        const achievements = document.getElementById('jurnal-achievements').value.trim();
        const obstacles = document.getElementById('jurnal-obstacles').value.trim();
        const plan = document.getElementById('jurnal-plan').value.trim();

        const currentUser = auth.getCurrentUser();
        const form = document.getElementById('jurnal-form');
        const submitBtn = form?.querySelector('button[type="submit"]');
        const originalButtonHtml = submitBtn?.innerHTML || '';

        const jurnalData = {
            date: dateStr,
            userId: currentUser?.id || 'demo-user',
            tasks,
            achievements,
            obstacles,
            plan,
            rencana: plan,
            rencanaBesok: plan,
            'Rencana': plan,
            'Rencana Besok': plan,
            photo: this.currentPhoto,
            attachment: this.currentPhoto,
            updatedAt: new Date().toISOString()
        };

        this.isSubmitting = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Menyimpan...</span>';
        }

        const normalizedUserId = String(jurnalData.userId);
        const existingIndex = this.jurnals.findIndex(j => j.date === dateStr && String(j.userId || j.user_id || '') === normalizedUserId);
        if (existingIndex >= 0) {
            this.jurnals[existingIndex] = jurnalData;
        } else {
            this.jurnals.unshift(jurnalData);
        }
        this.dedupeJournals();
        this.renderJurnalList();
        this.updateSummary();
        this.updateStatusBadge('filled');

        try {
            const result = await api.saveJournal(jurnalData);
            if (result.success && result.data) {
                const normalizedUserId = String(jurnalData.userId);
                const idx = this.jurnals.findIndex(j => j.date === dateStr && String(j.userId || j.user_id || '') === normalizedUserId);
                if (idx >= 0) {
                    this.jurnals[idx] = result.data;
                }
                this.persistCurrentUserJournals();
            }
            toast.success('Jurnal berhasil disimpan!');
            this.resetFormAfterSuccessfulSubmit();
        } catch (error) {
            console.error('Error saving journal:', error);
            toast.error('Gagal menyimpan jurnal');
        } finally {
            this.isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalButtonHtml;
            }
        }

        this.currentPhoto = null;
        this.hidePhotoPreview();
    },

    resetFormAfterSuccessfulSubmit() {
        this.currentPhoto = null;
        this.editingDate = '';
        this.clearFormFields();
        this.hidePhotoPreview();
        this.updateStatusBadge('empty');
    },

    updateUI() {
        // Load jurnal for current date if exists
        const dateStr = this.formatLocalDate(this.currentDate);
        const jurnal = this.getJournalForDate(dateStr);
        const today = dateTime.getLocalDate();
        const isWorkday = this.isJournalWorkday(dateStr);
        const canAccessJournal = this.canAccessJournalForDate(dateStr);
        const isEditingExistingJournal = Boolean(jurnal && this.editingDate === dateStr);
        this.updateFormTitle(dateStr, isWorkday, canAccessJournal);

        const tasksEl = document.getElementById('jurnal-tasks');
        const achievementsEl = document.getElementById('jurnal-achievements');
        const obstaclesEl = document.getElementById('jurnal-obstacles');
        const planEl = document.getElementById('jurnal-plan');

        if (!canAccessJournal) {
            this.currentPhoto = null;
            this.hidePhotoPreview();
            this.clearFormFields();

            if (!isWorkday) {
                this.updateStatusBadge('holiday');
            } else if (dateStr > today) {
                this.updateStatusBadge('pending');
            } else {
                this.updateStatusBadge('waiting-clock-out');
            }
        } else if (jurnal) {
            if (tasksEl) tasksEl.value = jurnal.tasks || '';
            if (achievementsEl) achievementsEl.value = jurnal.achievements || '';
            if (obstaclesEl) obstaclesEl.value = jurnal.obstacles || '';
            if (planEl) planEl.value = this.getJournalPlan(jurnal);

            // Load existing photo
            const journalPhoto = jurnal.photo || jurnal.attachment || jurnal.lampiran || null;
            if (journalPhoto) {
                this.currentPhoto = journalPhoto;
                this.updatePhotoPreview(journalPhoto);
            } else {
                this.currentPhoto = null;
                this.hidePhotoPreview();
            }

            this.updateStatusBadge(isWorkday ? 'filled' : 'holiday');
        } else {
            // Reset photo
            this.currentPhoto = null;
            this.hidePhotoPreview();
            if (tasksEl) tasksEl.value = '';
            if (achievementsEl) achievementsEl.value = '';
            if (obstaclesEl) obstaclesEl.value = '';
            if (planEl) planEl.value = '';

            // Check if date is today or future
            if (!isWorkday) {
                this.updateStatusBadge('holiday');
            } else if (dateStr === today) {
                this.updateStatusBadge('empty');
            } else if (dateStr > today) {
                this.updateStatusBadge('pending');
            } else {
                this.updateStatusBadge('empty');
            }
        }

        // Disable form for future dates and scheduled days off
        const form = document.getElementById('jurnal-form');
        if (form) {
            const isFuture = dateStr > today;
            const submitBtn = form.querySelector('button[type="submit"]');
            const disabled = isFuture || !isWorkday || !canAccessJournal || Boolean(jurnal && !isEditingExistingJournal);

            Array.from(form.querySelectorAll('textarea')).forEach(textarea => {
                textarea.disabled = disabled;
            });
            Array.from(form.querySelectorAll('input')).forEach(input => {
                input.disabled = disabled;
            });

            const uploadArea = document.getElementById('jurnal-upload-area');
            if (uploadArea) {
                uploadArea.style.pointerEvents = disabled ? 'none' : '';
                uploadArea.style.opacity = disabled ? '0.5' : '1';
            }

            if (submitBtn) {
                submitBtn.disabled = disabled;
                submitBtn.style.opacity = disabled ? '0.5' : '1';
            }
        }
    },

    updateStatusBadge(status) {
        const badge = document.getElementById('jurnal-status');
        if (!badge) return;

        badge.className = 'entry-status';

        switch (status) {
            case 'filled':
                badge.classList.add('filled');
                badge.textContent = 'Tersimpan';
                break;
            case 'empty':
                badge.classList.add('empty');
                badge.textContent = 'Belum Diisi';
                break;
            case 'pending':
                badge.classList.add('pending');
                badge.textContent = 'Menunggu';
                break;
            case 'holiday':
                badge.classList.add('holiday');
                badge.textContent = 'Hari Libur';
                break;
            case 'waiting-clock-out':
                badge.classList.add('waiting-clock-out');
                badge.textContent = 'Menunggu Pulang';
                break;
        }
    },

    renderJurnalList() {
        const list = document.getElementById('jurnal-list');
        if (!list) return;

        const historyItems = this.getJournalHistoryItems();
        const selectedMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        const [selectedYearText, selectedMonthText] = selectedMonth.split('-');
        const currentMonth = Math.max(0, Number(selectedMonthText || 1) - 1);
        const currentYear = Number(selectedYearText) || (this.parseLocalDate(dateTime.getLocalDate()) || new Date()).getFullYear();
        let filteredItems = historyItems.filter(item => {
            const date = this.parseLocalDate(item.date);
            return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        filteredItems.sort((a, b) => {
            const dateA = this.parseLocalDate(a.date);
            const dateB = this.parseLocalDate(b.date);
            return this.sort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        if (filteredItems.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>Belum ada jurnal pada bulan ini</p>
                </div>
            `;
            return;
        }

        list.innerHTML = filteredItems.map(item => {
            const date = this.parseLocalDate(item.date);
            const dayName = dateTime.formatDate(date, 'day');
            const formattedDate = dateTime.formatNumericDate ? dateTime.formatNumericDate(date) : dateTime.formatDate(date, 'short');
            const journal = item.journal;
            const preview = journal?.tasks ? journal.tasks.substring(0, 60) + '...' : 'Tanggal ini belum diisi.';
            const hasPhoto = (journal?.photo || journal?.attachment || journal?.lampiran) ? '<span class="photo-badge"><i class="fas fa-image"></i></span>' : '';
            const statusTag = item.status === 'filled'
                ? '<span class="status-tag filled">Tersimpan</span>'
                : '<span class="status-tag missing">Belum Diisi</span>';
            const actionButtons = journal ? `
                <button class="btn-icon-sm" title="Lihat Detail" onclick="jurnal.viewDetail('${item.date}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon-sm" title="Edit" onclick="jurnal.editJurnal('${item.date}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon-sm delete" title="Hapus Riwayat" onclick="jurnal.deleteJournal('${item.date}')">
                    <i class="fas fa-trash"></i>
                </button>
            ` : `
                <button class="btn-icon-sm" title="Isi Jurnal" onclick="jurnal.editJurnal('${item.date}')">
                    <i class="fas fa-plus"></i>
                </button>
            `;

            return `
                <div class="jurnal-item ${item.status === 'missing' ? 'missing' : ''}">
                    <div class="jurnal-item-header">
                        <div class="jurnal-date">
                            <span class="date-full">${formattedDate}</span>
                        </div>
                        <div class="jurnal-meta">
                            <span class="jurnal-day">${dayName}</span>
                            <span class="jurnal-time">${journal ? dateTime.formatTime(journal.updatedAt) : '-'} ${hasPhoto}</span>
                        </div>
                    </div>
                    <div class="jurnal-content">
                        <p class="jurnal-preview">${preview}</p>
                    </div>
                    <div class="jurnal-status-actions">
                        ${statusTag}
                        <div class="jurnal-actions">
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    updateSummary() {
        const selectedMonth = this.selectedSummaryMonth || this.getCurrentSummaryMonth();
        const [selectedYearText, selectedMonthText] = selectedMonth.split('-');
        const currentMonth = Math.max(0, Number(selectedMonthText || 1) - 1);
        const currentYear = Number(selectedYearText) || (this.parseLocalDate(dateTime.getLocalDate()) || new Date()).getFullYear();
        const monthItems = this.getJournalHistoryItems().filter(item => {
            const date = this.parseLocalDate(item.date);
            return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        const filledDates = new Set(
            this.jurnals
                .filter(journal => {
                    const journalDate = this.parseLocalDate(this.getJournalDate(journal));
                    return journalDate &&
                        journalDate.getMonth() === currentMonth &&
                        journalDate.getFullYear() === currentYear &&
                        this.isCurrentUserJournal(journal);
                })
                .map(journal => this.getJournalDate(journal))
        );
        const filledCount = filledDates.size;
        const missingCount = Math.max(0, monthItems.length - filledCount);
        const streak = this.calculateJournalStreak();

        // Update UI
        const summaryItems = document.querySelectorAll('#page-jurnal .summary-value');
        if (summaryItems.length >= 3) {
            summaryItems[0].textContent = filledCount;
            summaryItems[1].textContent = missingCount;
            summaryItems[2].textContent = streak;
        }
    },

    clearFormFields() {
        ['jurnal-tasks', 'jurnal-achievements', 'jurnal-obstacles', 'jurnal-plan'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
    },

    updatePhotoPreview(photo) {
        this.currentPhoto = photo;
        this.showPhotoPreview();
    },

    hidePhotoPreview() {
        const fileInput = document.getElementById('jurnal-photo');
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');
        const imagePreview = document.getElementById('jurnal-image-preview');

        if (fileInput) fileInput.value = '';
        if (uploadArea) uploadArea.style.display = 'block';
        if (filePreview) filePreview.style.display = 'none';
        if (imagePreview) imagePreview.src = '';
    },

    updateFormTitle(dateStr, isWorkday = true, canAccessJournal = true) {
        const title = document.querySelector('.jurnal-form-card .card-header h3');
        if (!title) return;

        const parsedDate = this.parseLocalDate(dateStr);
        const formattedDate = parsedDate ? dateTime.formatDate(parsedDate, 'full') : dateStr;
        if (!isWorkday) {
            title.textContent = `Jurnal Tidak Diperlukan - ${formattedDate}`;
        } else if (!canAccessJournal) {
            title.textContent = `Jurnal Tersedia Setelah Absen Pulang - ${formattedDate}`;
        } else {
            title.textContent = `Isi Jurnal ${formattedDate}`;
        }
    },

    calculateJournalStreak() {
        const filledDates = new Set(
            this.jurnals
                .filter(j => this.isCurrentUserJournal(j))
                .map(j => this.getJournalDate(j))
                .filter(Boolean)
        );
        let streak = 0;
        const cursor = this.parseLocalDate(dateTime.getLocalDate());

        while (cursor) {
            const dayOfWeek = cursor.getDay();
            const dateStr = this.formatLocalDate(cursor);

            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                if (!filledDates.has(dateStr)) {
                    break;
                }
                streak += 1;
            }

            cursor.setDate(cursor.getDate() - 1);
        }

        return streak;
    },

    deleteJournal(date) {
        const currentUser = auth.getCurrentUser();
        if (!currentUser) {
            toast.error('Pengguna tidak ditemukan');
            return;
        }

        if (!confirm('Apakah Anda yakin ingin menghapus riwayat jurnal ini?')) {
            return;
        }

        const normalizedUserId = String(currentUser.id);
        const idx = this.jurnals.findIndex(j => j.date === date && String(j.userId || j.user_id || '') === normalizedUserId);
        if (idx < 0) {
            toast.error('Riwayat jurnal tidak ditemukan');
            return;
        }

        this.jurnals.splice(idx, 1);
        storage.set('jurnals', this.jurnals);
        this.renderJurnalList();
        this.updateSummary();
        this.updateUI();

        api.deleteJournal({ date, userId: currentUser.id })
            .then(() => toast.success('Riwayat jurnal berhasil dihapus'))
            .catch((error) => {
                console.error('Error deleting journal:', error);
                toast.warning('Riwayat jurnal dihapus secara lokal, tetapi backend belum mendukung hapus');
            });
    },

    viewDetail(date) {
        const currentUserId = this.getCurrentUserId();
        const jurnal = this.getJournalForDate(date);
        if (!jurnal) return;

        // Create modal content
        const photoHtml = jurnal.photo ? `
            <div class="detail-photo">
                <label>Foto Lampiran:</label>
                <img src="${jurnal.photo}" alt="Foto jurnal" onclick="window.open('${jurnal.photo}', '_blank')">
            </div>
        ` : '';

        const modalContent = `
            <div class="jurnal-detail-modal">
                <h3>Detail Jurnal - ${dateTime.formatDate(this.parseLocalDate(date), 'long')}</h3>
                <div class="detail-section">
                    <label>Aktivitas Kerja:</label>
                    <p>${jurnal.tasks?.replace(/\n/g, '<br>') || '-'}</p>
                </div>
                <div class="detail-section">
                    <label>Hasil Kerja:</label>
                    <p>${jurnal.achievements?.replace(/\n/g, '<br>') || '-'}</p>
                </div>
                <div class="detail-section">
                    <label>Kendala atau Catatan:</label>
                    <p>${jurnal.obstacles?.replace(/\n/g, '<br>') || '-'}</p>
                </div>
                <div class="detail-section">
                    <label>Rencana Berikutnya:</label>
                    <p>${this.getJournalPlan(jurnal).replace(/\n/g, '<br>') || '-'}</p>
                </div>
                ${photoHtml}
            </div>
        `;

        modal.show('Detail Jurnal', modalContent, [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Edit', class: 'btn-primary', onClick: () => { modal.close(); this.editJurnal(date); } }
        ]);
    },

    editJurnal(date) {
        const parsedDate = this.parseLocalDate(date);
        if (!parsedDate) {
            toast.error('Tanggal jurnal tidak valid');
            return;
        }

        this.currentDate = parsedDate;
        this.editingDate = this.formatLocalDate(parsedDate);
        this.updateUI();
        this.scrollToForm();
    },

    scrollToForm() {
        const formCard = document.querySelector('.jurnal-form-card');
        const firstField = document.getElementById('jurnal-tasks');
        const scrollContainer = document.getElementById('page-content');
        if (!formCard) return;

        formCard.classList.add('is-focused');

        if (scrollContainer && typeof scrollContainer.scrollTo === 'function') {
            scrollContainer.scrollTo({
                top: Math.max(0, formCard.offsetTop - 16),
                behavior: 'smooth'
            });
        } else {
            formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        window.setTimeout(() => {
            if (firstField && !firstField.disabled) firstField.focus({ preventScroll: true });
            formCard.classList.remove('is-focused');
        }, 450);
    }
};

// Global init function
window.initJurnal = () => {
    jurnal.init();
};

// Expose jurnal object for onclick handlers
window.jurnal = jurnal;
