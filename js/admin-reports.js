/**
 * Portal Karyawan - Admin Reports
 * Reports and exports for admin
 */

const adminReports = {
    attendanceData: [],
    jurnalData: [],
    leaveData: [],
    currentPhotoUrl: '',
    currentLeaveAttachmentUrl: '',
    attendanceRefreshTimer: null,
    filters: {
        attendance: { month: '', division: '', status: '' },
        jurnal: { month: '', employee: '', status: '' },
        leave: { month: '', type: '', status: '' }
    },

    canAccessAdminReports() {
        return Boolean(auth && typeof auth.canAccessAdminReports === 'function' && auth.canAccessAdminReports());
    },

    canConfirmLeaveRequests() {
        return Boolean(auth && typeof auth.isPemilik === 'function' && auth.isPemilik());
    },

    getConfirmationActor() {
        const user = auth?.getCurrentUser ? auth.getCurrentUser() : null;
        return {
            confirmedBy: user?.id || '',
            confirmedByName: user?.name || '',
            confirmedByRole: user?.role || ''
        };
    },

    async initAttendanceReports() {
        if (!this.canAccessAdminReports()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        this.bindAttendanceEvents();
        this.loadCachedAttendanceReports();
        this.populateDivisionFilters();
        this.populateEmployeeFilter();
        this.renderAttendanceReports();
        await this.refreshAttendanceReports();
        this.startAttendanceAutoRefresh();
    },

    async initJurnalReports() {
        if (!this.canAccessAdminReports()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        this.bindJurnalEvents();
        this.loadCachedReportData();
        this.populateEmployeeFilter();
        this.renderJurnalReports();
        this.refreshJurnalReports();
    },

    async initLeaveReports() {
        if (!this.canAccessAdminReports()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        this.bindLeaveEvents();
        this.loadCachedReportData();
        this.renderLeaveReports();
        this.refreshLeaveReports();
    },

    async loadData() {
        let employees = [];
        let jurnals = [];
        let leaves = [];
        let izinList = [];
        let attendances = [];
        const usesRemoteApi = typeof API_BASE_URL !== 'undefined' && Boolean(API_BASE_URL);

        try {
            const batchResult = await api.batch([
                { key: 'employees', action: 'getEmployees' },
                { key: 'journals', action: 'getAllJournals' },
                { key: 'leaves', action: 'getAllLeaves' },
                { key: 'izin', action: 'getAllIzin' },
                { key: 'attendance', action: 'getAllAttendance' }
            ]);
            const batch = batchResult?.data || {};
            const empResult = batch.employees;
            const jurnalResult = batch.journals;
            const leaveResult = batch.leaves;
            const izinResult = batch.izin;
            const attResult = batch.attendance;
            employees = empResult?.success ? (empResult.data || []) : [];
            jurnals = jurnalResult?.success ? (jurnalResult.data || []) : [];
            leaves = leaveResult?.success ? (leaveResult.data || []) : [];
            izinList = izinResult?.success ? (izinResult.data || []) : [];
            attendances = attResult?.success ? (attResult.data || []) : [];
        } catch (error) {
            console.error('Error loading report data:', error);
            if (!usesRemoteApi) {
                employees = storage.get('admin_employees', []);
                jurnals = storage.get('jurnals', []);
                leaves = storage.get('leaves', []);
                izinList = storage.get('izin', []);
                attendances = storage.get('attendance', []);
            }
        }

        leaves = this.mergeRowsByStableKey(leaves, storage.get('leaves', []));
        const cachedAttendances = storage.get('attendance', []);
        attendances = this.mergeAttendanceEvidenceRows(attendances, cachedAttendances);
        employees = this.filterValidEmployees(normalizeEmployeeList(employees));
        const employeeIds = new Set(employees.map(emp => String(emp.id)));
        attendances = this.filterRowsForEmployees(attendances, employeeIds);
        jurnals = this.filterRowsForEmployees(jurnals, employeeIds);
        leaves = this.filterRowsForEmployees(leaves, employeeIds);
        izinList = this.filterRowsForEmployees(izinList, employeeIds);
        leaves = this.filterValidLeaves(leaves);
        izinList = this.filterValidIzin(izinList);
        if (usesRemoteApi) {
            this.syncReportCache({ employees, jurnals, leaves, izinList, attendances });
        }

        this.applyReportRows({ employees, jurnals, leaves, izinList, attendances });
    },

    loadCachedReportData() {
        const employees = this.filterValidEmployees(normalizeEmployeeList(storage.get('admin_employees', [])));
        const employeeIds = new Set(employees.map(emp => String(emp.id)));
        const attendances = this.filterRowsForEmployees(storage.get('attendance', []), employeeIds);
        const jurnals = this.filterRowsForEmployees(storage.get('jurnals', []), employeeIds);
        const leaves = this.filterValidLeaves(this.filterRowsForEmployees(storage.get('leaves', []), employeeIds));
        const izinList = this.filterValidIzin(this.filterRowsForEmployees(storage.get('izin', []), employeeIds));

        this.applyReportRows({ employees, jurnals, leaves, izinList, attendances });
    },

    async refreshJurnalReports() {
        await this.loadData();
        this.populateEmployeeFilter();
        this.renderJurnalReports();
    },

    async refreshLeaveReports() {
        await this.loadData();
        this.renderLeaveReports();
    },

    applyReportRows({ employees = [], jurnals = [], leaves = [], izinList = [], attendances = [] }) {
        this.rawAttendance = attendances;
        this.rawEmployees = employees;
        this.attendanceData = this.buildAttendanceReportRows(employees, attendances, leaves, izinList);

        const currentUser = auth.getCurrentUser();

        this.jurnalData = jurnals.map(j => {
            const userId = j.userId || j.user_id || j.userIdRaw || j.user;
            let emp = employees.find(e => String(e.id) === String(userId));
            if (!emp && currentUser) {
                emp = { name: currentUser.name, division: getEmployeeDivision(currentUser) || '-' };
            }
            if (!emp) {
                emp = { name: 'Karyawan', division: '-' };
            }

            const dateValue = j.date || j.tanggal || j.dateStr || j.createdAt || j.created_at || j.updatedAt || j.updated_at || '';
            const photoValue = this.getJournalPhoto(j);
            const tasksValue = j.tasks || j.task || j.deskripsi || j.description || '-';
            const achievementsValue = j.achievements || j.achievement || j.pencapaian || '-';
            const obstaclesValue = j.obstacles || j.kendala || '-';
            const planValue = this.getJournalPlan(j) || '-';
            const updatedAtValue = j.updatedAt || j.updated_at || j.createdAt || j.created_at || dateValue;

            return {
                date: dateValue,
                userId: userId,
                name: emp.name,
                division: getEmployeeDivision(emp),
                tasks: tasksValue,
                achievements: achievementsValue,
                obstacles: obstaclesValue,
                plan: planValue,
                photo: photoValue,
                status: tasksValue && tasksValue !== '-' ? 'filled' : 'empty',
                updatedAt: updatedAtValue
            };
        });

        this.leaveData = [
            ...leaves.map(l => {
                const emp = employees.find(e => String(e.id) === String(l.userId));

                return {
                    id: l.id,
                    source: 'leave',
                    userId: l.userId,
                    name: emp ? emp.name : 'Karyawan',
                    division: emp ? getEmployeeDivision(emp) : '-',
                    type: l.typeLabel || 'Cuti',
                    dates: l.startDate === l.endDate
                        ? l.startDate
                        : `${l.startDate} - ${l.endDate}`,
                    startDate: l.startDate,
                    endDate: l.endDate,
                    duration: l.duration || 1,
                    reason: l.reason || '-',
                    status: l.status || 'pending',
                    appliedAt: l.appliedAt || l.applied_at || l.createdAt || l.created_at || l.updatedAt || l.updated_at || '',
                    confirmedBy: l.confirmedBy || l.approvedBy || '',
                    confirmedByName: l.confirmedByName || l.approvedByName || '',
                    confirmedByRole: l.confirmedByRole || l.approvedByRole || '',
                    confirmedAt: l.confirmedAt || l.approvedAt || ''
                };
            }),

            ...izinList.map(i => {
                const emp = employees.find(e => String(e.id) === String(i.userId));

                return {
                    id: i.id,
                    source: 'permission',
                    userId: i.userId,
                    name: emp ? emp.name : 'Karyawan',
                    division: emp ? getEmployeeDivision(emp) : '-',
                    type: i.typeLabel || 'Izin / Sakit',
                    dates: i.date,
                    date: i.date,
                    duration: i.duration || 1,
                    reason: i.reason || '-',
                    status: i.status || 'pending',
                    appliedAt: i.appliedAt || i.applied_at || i.createdAt || i.created_at || i.updatedAt || i.updated_at || '',
                    hasAttachment: i.hasAttachment || Boolean(i.attachmentData || i.attachmentName),
                    attachmentName: i.attachmentName || i.fileName || i.filename || '',
                    attachmentType: i.attachmentType || i.fileType || '',
                    attachmentData: i.attachmentData || i.attachment || i.lampiran || i.file || '',
                    confirmedBy: i.confirmedBy || i.approvedBy || '',
                    confirmedByName: i.confirmedByName || i.approvedByName || '',
                    confirmedByRole: i.confirmedByRole || i.approvedByRole || '',
                    confirmedAt: i.confirmedAt || i.approvedAt || ''
                };
            })
        ];
    },

    sortRowsNewestFirst(rows = [], getDateValue) {
        return [...rows].sort((a, b) => {
            const timeB = this.getSortableDateTime(getDateValue(b));
            const timeA = this.getSortableDateTime(getDateValue(a));
            if (timeB !== timeA) return timeB - timeA;
            return String(b?.name || '').localeCompare(String(a?.name || ''), 'id', { numeric: true, sensitivity: 'base' });
        });
    },

    getSortableDateTime(value) {
        if (!value) return 0;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.getTime();
        }

        const raw = String(value).trim();
        if (!raw) return 0;

        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) return parsed;

        const idDateMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (idDateMatch) {
            const [, day, month, year, hour = '0', minute = '0'] = idDateMatch;
            const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
            return Number.isNaN(date.getTime()) ? 0 : date.getTime();
        }

        return 0;
    },

    getLeaveSubmittedAt(row = {}) {
        return row.appliedAt || row.applied_at || row.createdAt || row.created_at || row.updatedAt || row.updated_at || row.date || row.startDate || row.endDate || '';
    },

    getLeaveMonthKey(row = {}) {
        const source = this.getLeaveSubmittedAt(row);
        const time = this.getSortableDateTime(source);
        if (!time) return '';

        const date = new Date(time);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    },

    hasValue(row, field) {
        return String(row?.[field] ?? '').trim() !== '';
    },

    mergeAttendanceEvidenceRows(remoteRows = [], cachedRows = []) {
        if (!Array.isArray(remoteRows)) return [];
        if (!Array.isArray(cachedRows) || !cachedRows.length) return remoteRows;

        const cachedByKey = new Map();
        cachedRows.forEach(row => {
            const key = this.getAttendanceEvidenceMergeKey(row);
            if (key) cachedByKey.set(key, row);
        });

        const fieldsToPreserve = [
            'verificationPhoto',
            'verificationLocation',
            'verificationTimestamp',
            'attendanceLogs'
        ].concat(this.getAttendanceVerificationFieldNames());

        return remoteRows.map(row => {
            const cached = cachedByKey.get(this.getAttendanceEvidenceMergeKey(row));
            if (!cached) return row;

            const merged = { ...row };
            fieldsToPreserve.forEach(field => {
                if (!this.hasValue(merged, field) && this.hasValue(cached, field)) {
                    merged[field] = cached[field];
                }
            });
            return merged;
        });
    },

    getAttendanceEvidenceMergeKey(row = {}) {
        const userId = String(row.userId || row.user_id || '').trim();
        const date = this.normalizeAttendanceEvidenceDate(row.date || row.tanggal || '');
        return userId && date ? `${userId}||${date}` : '';
    },

    normalizeAttendanceEvidenceDate(value) {
        if (!value) return '';
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString().slice(0, 10);
        }

        const raw = String(value).trim();
        const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
        if (isoMatch) return isoMatch[0];

        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
        }

        return raw;
    },

    syncReportCache({ employees, jurnals, leaves, izinList, attendances }) {
        storage.set('admin_employees', employees || []);
        storage.set('jurnals', jurnals || []);
        storage.set('leaves', leaves || []);
        storage.set('izin', izinList || []);
        storage.set('attendance', attendances || []);
    },

    loadCachedAttendanceReports() {
        const employees = this.filterValidEmployees(normalizeEmployeeList(storage.get('admin_employees', [])));
        const employeeIds = new Set(employees.map(emp => String(emp.id)));
        const attendances = this.filterRowsForEmployees(storage.get('attendance', []), employeeIds);
        const leaves = this.filterValidLeaves(this.filterRowsForEmployees(storage.get('leaves', []), employeeIds));
        const izinList = this.filterValidIzin(this.filterRowsForEmployees(storage.get('izin', []), employeeIds));

        this.rawAttendance = attendances;
        this.rawEmployees = employees;
        this.attendanceData = this.buildAttendanceReportRows(employees, attendances, leaves, izinList);
    },

    async refreshAttendanceReports() {
        await this.loadData();
        this.populateDivisionFilters();
        this.populateEmployeeFilter();
        this.renderAttendanceReports();
    },

    startAttendanceAutoRefresh() {
        if (this.attendanceRefreshTimer) {
            clearInterval(this.attendanceRefreshTimer);
        }

        this.attendanceRefreshTimer = setInterval(() => {
            if (router?.currentPage === 'attendance-reports') {
                this.refreshAttendanceReports().catch(error => {
                    console.error('Error refreshing attendance reports:', error);
                });
            }
        }, 30000);
    },

    buildAttendanceReportRows(employees = [], attendances = [], leaves = [], izinList = []) {
        return employees.map(emp => {
            const empAtt = attendances.filter(a => String(a.userId) === String(emp.id));
            let present = 0;
            let late = 0;

            empAtt.forEach(a => {
                if (a.clockIn) {
                    present++;
                    if (a.status && a.status.toLowerCase() === 'terlambat') {
                        late++;
                    }
                }
            });

            const empLeaves = leaves.filter(l => String(l.userId) === String(emp.id) && l.status === 'approved');
            const empIzin = izinList.filter(i => String(i.userId) === String(emp.id) && i.status === 'approved');

            let leaveDays = 0;
            empLeaves.forEach(l => leaveDays += parseInt(l.duration) || 1);
            empIzin.forEach(i => leaveDays += parseInt(i.duration) || 1);

            const absent = leaveDays;

            return {
                userId: emp.id,
                name: emp.name,
                division: getEmployeeDivision(emp),
                present,
                late,
                absent,
                total: present + absent
            };
        });
    },

    filterValidEmployees(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.filter(row => this.hasValue(row, 'id') && this.hasValue(row, 'name'));
    },

    filterRowsForEmployees(rows, employeeIds) {
        if (!Array.isArray(rows)) return [];
        return rows.filter(row => employeeIds.has(String(row?.userId || row?.user_id || '')));
    },

    mergeRowsByStableKey(primaryRows = [], fallbackRows = []) {
        const merged = new Map();
        const makeKey = row => {
            if (!row) return '';
            const id = row.id || row.ID;
            if (id !== undefined && id !== null && String(id).trim() !== '') {
                return `id:${String(id)}`;
            }
            return [
                row.userId || row.user_id || '',
                row.type || row.jenis || '',
                row.startDate || row.start_date || row.date || '',
                row.endDate || row.end_date || row.date || '',
                row.reason || row.alasan || ''
            ].map(value => String(value || '').trim()).join('|');
        };

        (Array.isArray(fallbackRows) ? fallbackRows : []).forEach(row => {
            const key = makeKey(row);
            if (key) merged.set(key, row);
        });
        (Array.isArray(primaryRows) ? primaryRows : []).forEach(row => {
            const key = makeKey(row);
            if (key) merged.set(key, row);
        });

        return Array.from(merged.values());
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

    filterValidIzin(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.filter(row =>
            this.hasValue(row, 'userId') &&
            this.hasValue(row, 'date')
        );
    },

    getJournalPhoto(journal) {
        if (!journal) return '';

        const photoFields = [
            'photo',
            'photoUrl',
            'photo_url',
            'foto',
            'lampiran',
            'image',
            'imageUrl',
            'image_url',
            'attachment',
            'attachmentUrl',
            'attachment_url',
            'file',
            'fileUrl',
            'file_url'
        ];

        for (const field of photoFields) {
            const value = journal[field];
            if (value && String(value).trim()) {
                return String(value).trim();
            }
        }

        return '';
    },

    getJournalPlan(journal) {
        if (!journal) return '';

        const planFields = [
            'plan',
            'rencana',
            'rencanaBesok',
            'rencana_besok',
            'tomorrowPlan',
            'nextPlan',
            'Rencana',
            'Rencana Besok',
            'rencana besok'
        ];

        for (const field of planFields) {
            const value = journal[field];
            if (value && String(value).trim() && String(value).trim() !== '-') {
                return String(value).trim();
            }
        }

        const dynamicField = Object.keys(journal).find(key => {
            const normalizedKey = String(key).toLowerCase().replace(/[\s_-]/g, '');
            return normalizedKey === 'plan' || normalizedKey === 'rencana' || normalizedKey === 'rencanabesok';
        });

        if (dynamicField) {
            const value = journal[dynamicField];
            if (value && String(value).trim() && String(value).trim() !== '-') {
                return String(value).trim();
            }
        }

        return '';
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    escapeAttr(value) {
        return this.escapeHtml(value);
    },

    formatReportDisplayDate(value) {
        if (!value || value === '-') return '-';

        const raw = String(value).trim();
        const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const parsed = isoMatch
            ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
            : new Date(raw);

        if (Number.isNaN(parsed.getTime())) return raw;

        return parsed.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    },

    populateEmployeeFilter() {
        const employees = storage.get('admin_employees', []);
        const select = document.getElementById('jurnal-employee-filter');
        if (select) {
            select.innerHTML = '<option value="">Semua Karyawan</option>' +
                employees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('');
        }
    },

    populateDivisionFilters() {
        const employees = storage.get('admin_employees', []);
        const divisions = [...new Set(normalizeEmployeeList(employees).map(getEmployeeDivision).filter(Boolean))].sort();
        const select = document.getElementById('report-division-filter');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Semua Divisi</option>' +
            divisions.map(division => `<option value="${this.escapeAttr(division)}">${this.escapeHtml(division)}</option>`).join('');
        if (currentValue) select.value = currentValue;
    },

    bindAttendanceEvents() {
        // Export button
        const exportBtn = document.getElementById('btn-export-attendance');
        if (exportBtn) {
            exportBtn.onclick = () => this.exportToExcel('attendance');
        }

        // Print button
        const printBtn = document.getElementById('btn-print-attendance');
        if (printBtn) {
            printBtn.onclick = () => this.printReport('attendance');
        }

        // Month filter
        const monthFilter = document.getElementById('attendance-month');
        if (monthFilter) {
            monthFilter.onchange = (e) => {
                this.filters.attendance.month = e.target.value;
                this.renderAttendanceReports();
            };
        }

        // Division filter
        const divisionFilter = document.getElementById('report-division-filter');
        if (divisionFilter) {
            divisionFilter.onchange = (e) => {
                this.filters.attendance.division = e.target.value;
                this.renderAttendanceReports();
            };
        }

        // Status filter
        const statusFilter = document.getElementById('report-status-filter');
        if (statusFilter) {
            statusFilter.onchange = (e) => {
                this.filters.attendance.status = e.target.value;
                this.renderAttendanceReports();
            };
        }
    },

    bindJurnalEvents() {
        const exportBtn = document.getElementById('btn-export-jurnal');
        const printBtn = document.getElementById('btn-print-jurnal');

        if (exportBtn) {
            exportBtn.onclick = () => this.exportToExcel('jurnal');
        }

        if (printBtn) {
            printBtn.onclick = () => this.printReport('jurnal');
        }

        // Month filter
        const monthFilter = document.getElementById('jurnal-month');
        if (monthFilter) {
            monthFilter.onchange = (e) => {
                this.filters.jurnal.month = e.target.value;
                this.renderJurnalReports();
            };
        }

        // Employee filter
        const empFilter = document.getElementById('jurnal-employee-filter');
        if (empFilter) {
            empFilter.onchange = (e) => {
                this.filters.jurnal.employee = e.target.value;
                this.renderJurnalReports();
            };
        }

        // Status filter
        const statusFilter = document.getElementById('jurnal-status-filter');
        if (statusFilter) {
            statusFilter.onchange = (e) => {
                this.filters.jurnal.status = e.target.value;
                this.renderJurnalReports();
            };
        }
    },

    bindLeaveEvents() {
        const exportBtn = document.getElementById('btn-export-leave');
        const printBtn = document.getElementById('btn-print-leave');

        if (exportBtn) {
            exportBtn.onclick = () => this.exportToExcel('leave');
        }

        if (printBtn) {
            printBtn.onclick = () => this.printReport('leave');
        }

        // Month filter
        const monthFilter = document.getElementById('leave-month');
        if (monthFilter) {
            monthFilter.onchange = (e) => {
                this.filters.leave.month = e.target.value;
                this.renderLeaveReports();
            };
        }

        // Type filter
        const typeFilter = document.getElementById('leave-type-filter');
        if (typeFilter) {
            typeFilter.onchange = (e) => {
                this.filters.leave.type = e.target.value;
                this.renderLeaveReports();
            };
        }

        // Status filter
        const statusFilter = document.getElementById('leave-status-filter');
        if (statusFilter) {
            statusFilter.onchange = (e) => {
                this.filters.leave.status = e.target.value;
                this.renderLeaveReports();
            };
        }
    },

    getFilteredAttendance() {
        return this.attendanceData.filter(row => {
            const matchesDivision = !this.filters.attendance.division || row.division === this.filters.attendance.division;
            const matchesStatus = !this.filters.attendance.status ||
                (this.filters.attendance.status === 'present' && row.present > 0) ||
                (this.filters.attendance.status === 'absent' && row.absent > 0) ||
                (this.filters.attendance.status === 'late' && row.late > 0);
            return matchesDivision && matchesStatus;
        });
    },

    getFilteredJurnal() {
        const filtered = this.jurnalData.filter(row => {
            const matchesEmp = !this.filters.jurnal.employee || row.name === this.filters.jurnal.employee;
            const matchesStatus = !this.filters.jurnal.status || row.status === this.filters.jurnal.status;
            const matchesMonth = !this.filters.jurnal.month || String(row.date || '').startsWith(this.filters.jurnal.month);
            return matchesEmp && matchesStatus && matchesMonth;
        });
        return this.sortRowsNewestFirst(filtered, row => row.updatedAt || row.date);
    },

    getFilteredLeave() {
        const filtered = this.leaveData.filter(row => {
            const matchesType = !this.filters.leave.type ||
                (this.filters.leave.type === 'cuti' && row.type.toLowerCase().includes('cuti')) ||
                (this.filters.leave.type === 'izin' && row.type.toLowerCase().includes('izin')) ||
                (this.filters.leave.type === 'sakit' && row.type.toLowerCase().includes('sakit'));
            const matchesStatus = !this.filters.leave.status || row.status === this.filters.leave.status;
            const matchesMonth = !this.filters.leave.month || this.getLeaveMonthKey(row) === this.filters.leave.month;
            return matchesType && matchesStatus && matchesMonth;
        });
        return this.sortRowsNewestFirst(filtered, row => this.getLeaveSubmittedAt(row));
    },

    renderAttendanceReports() {
        const tbody = document.getElementById('attendance-reports-body');
        if (!tbody) return;

        const data = this.getFilteredAttendance();

        if (data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="attendance-empty-cell">Belum ada data absensi karyawan.</td>
                </tr>
            `;

            const mobileContainer = document.getElementById('attendance-mobile-cards');
            if (mobileContainer) {
                mobileContainer.innerHTML = '<div class="mobile-empty-state">Belum ada data absensi karyawan.</div>';
            }
            return;
        }

        tbody.innerHTML = data.map(row => `
            <tr>
                <td class="attendance-name-cell">
                    <div class="employee-info">
                        <div class="employee-details">
                            <span class="employee-name">${row.name}</span>
                        </div>
                    </div>
                </td>
                <td class="attendance-dept-cell">${row.division}</td>
                <td class="attendance-number-cell attendance-present"><span class="attendance-number-value">${row.present}</span></td>
                <td class="attendance-number-cell attendance-late"><span class="attendance-number-value">${row.late}</span></td>
                <td class="attendance-number-cell attendance-absent"><span class="attendance-number-value">${row.absent}</span></td>
                <td class="attendance-number-cell attendance-total"><span class="attendance-number-value">${row.total}</span></td>
                <td class="attendance-action-cell">
                    <button class="btn-action view" onclick="adminReports.viewAttendanceDetail('${String(row.userId).replace(/'/g, "\\'")}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        // Render mobile cards
        const mobileContainer = document.getElementById('attendance-mobile-cards');
        if (mobileContainer) {
            mobileContainer.innerHTML = data.map(row => `
                <div class="mobile-card">
                    <div class="mobile-card-header">
                        <span class="mobile-card-title">${this.escapeHtml(row.name || '-')}</span>
                        <span style="font-size: var(--font-size-xs); color: var(--text-muted);">${this.escapeHtml(row.division || '-')}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Hadir</span>
                        <span class="mobile-card-value" style="color: var(--color-success);">${row.present}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Terlambat</span>
                        <span class="mobile-card-value" style="color: var(--color-warning);">${row.late}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Absen</span>
                        <span class="mobile-card-value" style="color: var(--color-danger);">${row.absent}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="mobile-card-label">Total</span>
                        <span class="mobile-card-value">${row.total}</span>
                    </div>
                    <div class="mobile-card-actions">
                        <button class="btn-action view" onclick="adminReports.viewAttendanceDetail('${String(row.userId).replace(/'/g, "\\'")}')">
                            <i class="fas fa-eye"></i><span>Lihat Detail</span>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    },

    renderJurnalReports() {
        const tbody = document.getElementById('jurnal-reports-body');
        if (!tbody) return;

        const data = this.getFilteredJurnal();

        if (data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="jurnal-empty-cell">Belum ada data jurnal.</td>
                </tr>
            `;
            const mobileContainer = document.getElementById('jurnal-mobile-cards');
            if (mobileContainer) {
                mobileContainer.innerHTML = '<div class="mobile-empty-state">Belum ada data jurnal.</div>';
            }
            return;
        }

        const canDeleteJurnal = Boolean(auth && typeof auth.isAdmin === 'function' && auth.isAdmin());
        tbody.innerHTML = data.map((row, index) => {
            const rawTasks = String(row.tasks || '-');
            const tasksPreview = rawTasks.length > 46 ? `${rawTasks.substring(0, 46)}...` : rawTasks;
            const photoCell = row.photo ?
                `<span class="jurnal-photo-wrap"><img src="${this.escapeAttr(row.photo)}" class="jurnal-thumbnail" onclick="adminReports.viewJurnalPhoto(${index})" onerror="adminReports.handlePhotoError(this)" title="Klik untuk memperbesar"></span>` :
                '<span class="jurnal-photo-wrap"><span class="no-photo-cell">-</span></span>';

            return `
            <tr>
                <td class="jurnal-date-cell">${this.escapeHtml(row.date || '-')}</td>
                <td class="jurnal-name-cell">${this.escapeHtml(row.name || '-')}</td>
                <td class="jurnal-dept-cell">${this.escapeHtml(row.division || '-')}</td>
                <td class="jurnal-task-cell" title="${this.escapeAttr(rawTasks)}">${this.escapeHtml(tasksPreview)}</td>
                <td class="jurnal-photo-cell">
                    ${photoCell}
                </td>
                <td class="jurnal-status-cell">
                    <span class="status-badge ${row.status}">
                        ${row.status === 'filled' ? 'Terisi' : 'Kosong'}
                    </span>
                </td>
                <td class="jurnal-action-cell">
                    <div class="jurnal-action-buttons">
                        <button class="btn-action view" onclick="adminReports.viewJurnalDetail(${index})">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${canDeleteJurnal ? `<button class="btn-action delete" onclick="adminReports.deleteJurnal(${index})" title="Hapus">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        const mobileContainer = document.getElementById('jurnal-mobile-cards');
        if (mobileContainer) {
            mobileContainer.innerHTML = data.map((row, index) => {
                const rawTasks = String(row.tasks || '-');
                const tasksPreview = rawTasks.length > 90 ? `${rawTasks.substring(0, 90)}...` : rawTasks;
                return `
                    <div class="mobile-card">
                        <div class="mobile-card-header">
                            <span class="mobile-card-title">${this.escapeHtml(row.name || '-')}</span>
                            <span class="status-badge ${row.status}">
                                ${row.status === 'filled' ? 'Terisi' : 'Kosong'}
                            </span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Tanggal</span>
                            <span class="mobile-card-value">${this.escapeHtml(row.date || '-')}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Divisi</span>
                            <span class="mobile-card-value">${this.escapeHtml(row.division || '-')}</span>
                        </div>
                        <div class="mobile-card-row mobile-card-row-stack">
                            <span class="mobile-card-label">Aktivitas</span>
                            <span class="mobile-card-value">${this.escapeHtml(tasksPreview)}</span>
                        </div>
                        <div class="mobile-card-actions">
                            <button class="btn-action view" onclick="adminReports.viewJurnalDetail(${index})">
                                <i class="fas fa-eye"></i><span>Lihat</span>
                            </button>
                            ${canDeleteJurnal ? `<button class="btn-action delete" onclick="adminReports.deleteJurnal(${index})" title="Hapus">
                                <i class="fas fa-trash"></i><span>Hapus</span>
                            </button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    },

    renderLeaveReports() {
        const tbody = document.getElementById('leave-reports-body');
        if (!tbody) return;

        const data = this.getFilteredLeave();

        const statusLabels = {
            pending: 'Menunggu',
            approved: 'Disetujui',
            rejected: 'Ditolak'
        };

        if (data.length === 0) {
            tbody.innerHTML = `
            <tr>
                <td colspan="8" class="leave-empty-cell">
                    Belum ada data cuti atau izin.
                </td>
            </tr>
        `;
            const mobileContainer = document.getElementById('leave-mobile-cards');
            if (mobileContainer) {
                mobileContainer.innerHTML = '<div class="mobile-empty-state">Belum ada data cuti atau izin.</div>';
            }
            return;
        }

        const canConfirm = this.canConfirmLeaveRequests();
        tbody.innerHTML = data.map((row, index) => {
            const actionButtons = canConfirm && row.status === 'pending'
                ? `
                <button class="btn-action edit" title="Konfirmasi"
                    onclick="adminReports.approveLeaveOrPermission(${index})">
                    <i class="fas fa-check"></i>
                </button>

                <button class="btn-action delete" title="Tolak"
                    onclick="adminReports.rejectLeaveOrPermission(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `
                : '';

            return `
            <tr>
                <td class="leave-name-cell">${this.escapeHtml(row.name || '-')}</td>
                <td class="leave-dept-cell">${this.escapeHtml(row.division || '-')}</td>
                <td class="leave-type-cell">${this.escapeHtml(row.type || '-')}</td>
                <td class="leave-date-cell">${this.escapeHtml(row.dates || row.date || '-')}</td>
                <td class="leave-duration-cell">${this.escapeHtml(row.duration || 0)} hari</td>
                <td class="leave-reason-cell" title="${this.escapeAttr(row.reason || '-')}">${this.escapeHtml(row.reason || '-')}</td>
                <td class="leave-status-cell">
                    <span class="status-badge ${row.status}">
                        ${statusLabels[row.status] || row.status}
                    </span>
                </td>
                <td class="leave-action-cell">
                    <div class="leave-report-actions">
                        <button class="btn-action view" title="Lihat Detail"
                            onclick="adminReports.viewLeaveDetail(${index})">
                            <i class="fas fa-eye"></i>
                        </button>

                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
        }).join('');

        const mobileContainer = document.getElementById('leave-mobile-cards');
        if (mobileContainer) {
            mobileContainer.innerHTML = data.map((row, index) => {
                const actionButtons = canConfirm && row.status === 'pending'
                    ? `
                        <button class="btn-action edit" title="Konfirmasi" onclick="adminReports.approveLeaveOrPermission(${index})">
                            <i class="fas fa-check"></i><span>Setujui</span>
                        </button>
                        <button class="btn-action delete" title="Tolak" onclick="adminReports.rejectLeaveOrPermission(${index})">
                            <i class="fas fa-times"></i><span>Tolak</span>
                        </button>
                    `
                    : '';

                return `
                    <div class="mobile-card">
                        <div class="mobile-card-header">
                            <span class="mobile-card-title">${this.escapeHtml(row.name || '-')}</span>
                            <span class="status-badge ${row.status}">
                                ${statusLabels[row.status] || row.status}
                            </span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Divisi</span>
                            <span class="mobile-card-value">${this.escapeHtml(row.division || '-')}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Jenis</span>
                            <span class="mobile-card-value">${this.escapeHtml(row.type || '-')}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Tanggal</span>
                            <span class="mobile-card-value">${this.escapeHtml(row.dates || row.date || '-')}</span>
                        </div>
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Durasi</span>
                            <span class="mobile-card-value">${this.escapeHtml(row.duration || 0)} hari</span>
                        </div>
                        <div class="mobile-card-actions">
                            <button class="btn-action view" title="Lihat Detail" onclick="adminReports.viewLeaveDetail(${index})">
                                <i class="fas fa-eye"></i><span>Detail</span>
                            </button>
                            ${actionButtons}
                        </div>
                    </div>
                `;
            }).join('');
        }
    },

    exportToExcel(type) {
        const exportConfig = this.getExportConfig(type);
        if (!exportConfig) return;

        const workbook = this.convertToExcelWorkbook(exportConfig);
        this.downloadFile(workbook, exportConfig.filename, 'application/vnd.ms-excel;charset=utf-8;');

        toast.success(`Data berhasil diexport ke ${exportConfig.filename}`);
    },

    getExportConfig(type) {
        const stamp = dateTime.getLocalDate ? dateTime.getLocalDate() : new Date().toISOString().slice(0, 10);

        if (type === 'attendance') {
            return {
                title: 'Rekap Absensi Karyawan',
                filename: `Rekap_Absensi_${stamp}.xls`,
                rows: this.getFilteredAttendance(),
                columns: [
                    { header: 'No', value: (_, index) => index + 1, align: 'center', width: 48 },
                    { header: 'Nama Karyawan', value: row => row.name || '-', align: 'left', width: 220 },
                    { header: 'Divisi', value: row => row.division || '-', align: 'left', width: 160 },
                    { header: 'Hadir', value: row => row.present || 0, align: 'center', width: 80 },
                    { header: 'Terlambat', value: row => row.late || 0, align: 'center', width: 90 },
                    { header: 'Absen/Izin', value: row => row.absent || 0, align: 'center', width: 95 },
                    { header: 'Total', value: row => row.total || 0, align: 'center', width: 130 }
                ]
            };
        }

        if (type === 'jurnal') {
            return {
                title: 'Rekap Jurnal Kerja',
                filename: `Rekap_Jurnal_${stamp}.xls`,
                rows: this.getFilteredJurnal(),
                columns: [
                    { header: 'No', value: (_, index) => index + 1, align: 'center', width: 48 },
                    { header: 'Tanggal', value: row => row.date || '-', align: 'center', width: 110 },
                    { header: 'Nama Karyawan', value: row => row.name || '-', align: 'left', width: 200 },
                    { header: 'Divisi', value: row => row.division || '-', align: 'left', width: 150 },
                    { header: 'Aktivitas Kerja', value: row => row.tasks || '-', align: 'left', width: 280 },
                    { header: 'Hasil Kerja', value: row => row.achievements || '-', align: 'left', width: 280 },
                    { header: 'Kendala atau Catatan', value: row => row.obstacles || '-', align: 'left', width: 260 },
                    { header: 'Rencana Berikutnya', value: row => row.plan || '-', align: 'left', width: 260 },
                    { header: 'Status', value: row => row.status === 'filled' ? 'Terisi' : 'Kosong', align: 'center', width: 90 }
                ]
            };
        }

        if (type === 'leave') {
            return {
                title: 'Rekap Cuti dan Izin',
                filename: `Rekap_Cuti_Izin_${stamp}.xls`,
                rows: this.getFilteredLeave(),
                columns: [
                    { header: 'No', value: (_, index) => index + 1, align: 'center', width: 48 },
                    { header: 'Nama Karyawan', value: row => row.name || '-', align: 'left', width: 200 },
                    { header: 'Divisi', value: row => row.division || '-', align: 'left', width: 150 },
                    { header: 'Jenis', value: row => row.type || '-', align: 'left', width: 140 },
                    { header: 'Tanggal', value: row => row.dates || row.date || '-', align: 'center', width: 180 },
                    { header: 'Durasi', value: row => `${row.duration || 0} hari`, align: 'center', width: 90 },
                    { header: 'Alasan', value: row => row.reason || '-', align: 'left', width: 300 },
                    { header: 'Status', value: row => this.getLeaveStatusLabel(row.status), align: 'center', width: 110 }
                ]
            };
        }

        return null;
    },

    convertToExcelWorkbook(config) {
        const colCount = config.columns.length;
        const colgroup = config.columns
            .map(column => `<col style="width:${Number(column.width || 120)}px">`)
            .join('');
        const headerCells = config.columns
            .map(column => `<th class="${this.getExcelAlignClass(column.align)}">${this.escapeHtml(column.header)}</th>`)
            .join('');
        const bodyRows = config.rows.length
            ? config.rows.map((row, index) => `
                <tr class="data-row">
                    ${config.columns.map(column => `<td class="${this.getExcelAlignClass(column.align)}">${this.escapeHtml(column.value(row, index))}</td>`).join('')}
                </tr>
            `).join('')
            : `<tr><td colspan="${colCount}" class="empty">Tidak ada data</td></tr>`;

        return `
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Calibri, Arial, sans-serif; color: #000000; }
                    table {
                        border-collapse: collapse;
                        width: 100%;
                        border: 1px solid #d9d9d9;
                    }
                    .title {
                        font-size: 16px;
                        font-weight: 700;
                        color: #000000;
                        background: #ffffff;
                        border: 1px solid #d9d9d9;
                        padding: 6px 8px;
                    }
                    .meta {
                        color: #404040;
                        font-size: 11px;
                        background: #ffffff;
                        border: 1px solid #d9d9d9;
                        padding: 5px 8px;
                    }
                    .spacer td {
                        height: 8px;
                        border: 1px solid #d9d9d9;
                        background: #ffffff;
                    }
                    th {
                        background: #ffffff;
                        color: #000000;
                        font-weight: 700;
                        text-align: center;
                        border: 1px solid #d9d9d9;
                        padding: 6px 8px;
                    }
                    td {
                        background: #ffffff;
                        border: 1px solid #d9d9d9;
                        padding: 5px 8px;
                        vertical-align: top;
                        mso-number-format: "\\@";
                    }
                    .align-left { text-align: left; }
                    .align-center { text-align: center; }
                    .align-right { text-align: right; }
                    .empty { text-align: center; color: #404040; }
                </style>
            </head>
            <body>
                <table>
                    <colgroup>${colgroup}</colgroup>
                    <tr><td colspan="${colCount}" class="title">${this.escapeHtml(config.title)}</td></tr>
                    <tr><td colspan="${colCount}" class="meta">Tanggal Export: ${this.escapeHtml(new Date().toLocaleString('id-ID'))}</td></tr>
                    <tr class="spacer">${Array.from({ length: colCount }, () => '<td></td>').join('')}</tr>
                    <tr>${headerCells}</tr>
                    ${bodyRows}
                </table>
            </body>
            </html>
        `;
    },

    getExcelAlignClass(align) {
        if (align === 'right') return 'align-right';
        if (align === 'center') return 'align-center';
        return 'align-left';
    },

    getLeaveStatusLabel(status) {
        const labels = {
            pending: 'Menunggu',
            approved: 'Disetujui',
            rejected: 'Ditolak'
        };
        return labels[String(status || '').toLowerCase()] || status || '-';
    },

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    printReport(type) {
        window.print();
    },

    viewDetail(name) {
        const employee = this.attendanceData.find(row => row.name === name);
        if (employee) {
            this.viewAttendanceDetail(employee.userId);
            return;
        }

        toast.error('Data absensi karyawan tidak ditemukan');
    },

    viewAttendanceDetail(userId) {
        const employee = this.attendanceData.find(row => String(row.userId) === String(userId));
        if (!employee) {
            toast.error('Data absensi karyawan tidak ditemukan');
            return;
        }

        const records = (this.rawAttendance || [])
            .filter(record => String(record.userId) === String(userId))
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        const monthFilter = this.filters.attendance.month;
        const filteredRecords = monthFilter
            ? records.filter(record => String(record.date || '').startsWith(monthFilter))
            : records;

        const rowsHtml = filteredRecords.length
            ? filteredRecords.map(record => this.renderAttendanceDetailRecord(record)).join('')
            : '<div class="attendance-detail-empty">Belum ada data absensi untuk periode ini.</div>';

        const content = `
            <div class="attendance-detail-content">
                <div class="detail-row">
                    <label>Nama:</label>
                    <p>${this.escapeHtml(employee.name)}</p>
                </div>
                <div class="detail-row">
                    <label>Divisi:</label>
                    <p>${this.escapeHtml(employee.division || '-')}</p>
                </div>
                <div class="attendance-detail-summary">
                    <span>Hadir: <strong>${employee.present}</strong></span>
                    <span>Terlambat: <strong>${employee.late}</strong></span>
                    <span>Absen/Izin: <strong>${employee.absent}</strong></span>
                </div>
                <div class="attendance-detail-list">
                    ${rowsHtml}
                </div>
            </div>
        `;

        const actions = [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }
        ];
        actions.modalClass = 'admin-detail-modal attendance-detail-modal';

        modal.show('Detail Absensi', content, actions);
    },

    renderAttendanceDetailRecord(record) {
        const statusText = this.getAttendanceStatusLabel(record.status, record.clockIn);
        const verificationLogs = this.getAttendanceVerificationLogs(record);
        const formatClock = (value) => dateTime.formatClockTime(value) || '-';

        return `
            <div class="attendance-detail-record">
                <div class="attendance-record-header">
                    <strong>${this.escapeHtml(record.date || '-')}</strong>
                    <span class="status-badge ${this.escapeAttr(String(record.status || 'waiting').toLowerCase())}">
                        ${this.escapeHtml(statusText)}
                    </span>
                </div>
                <div class="attendance-record-grid">
                    <div><label>Shift</label><p>${this.escapeHtml(record.shift || '-')}</p></div>
                    <div><label>Masuk</label><p>${this.escapeHtml(formatClock(record.clockIn))}</p></div>
                    <div><label>Istirahat</label><p>${this.escapeHtml(formatClock(record.breakStart))}</p></div>
                    <div><label>Selesai Istirahat</label><p>${this.escapeHtml(formatClock(record.breakEnd))}</p></div>
                    <div><label>Istirahat 2</label><p>${this.escapeHtml(formatClock(record.break2Start))}</p></div>
                    <div><label>Selesai Istirahat 2</label><p>${this.escapeHtml(formatClock(record.break2End))}</p></div>
                    <div><label>Lembur</label><p>${this.escapeHtml(formatClock(record.overtimeStart))}</p></div>
                    <div><label>Pulang</label><p>${this.escapeHtml(formatClock(record.clockOut))}</p></div>
                </div>
                ${this.renderAttendanceVerificationLogs(verificationLogs)}
            </div>
        `;
    },

    getAttendanceVerificationLogs(record) {
        const parsedLogs = this.parseAttendanceLogs(record.attendanceLogs);
        const dedicatedLogs = this.getDedicatedAttendanceVerificationLogs(record);
        const legacyLog = this.getLegacyAttendanceVerificationLog(record);
        const fallbackLogs = legacyLog ? [legacyLog] : [];

        if (parsedLogs.length || dedicatedLogs.length || fallbackLogs.length) {
            return this.mergeAttendanceVerificationLogs(parsedLogs, [...dedicatedLogs, ...fallbackLogs]);
        }

        return [];
    },

    getAttendanceVerificationConfig() {
        return [
            { action: 'clock-in', label: 'Clock In', time: 'clockIn', photo: 'clockInPhoto', location: 'clockInLocation', timestamp: 'clockInTimestamp' },
            { action: 'break', label: 'Istirahat 1', time: 'breakStart', photo: 'breakStartPhoto', location: 'breakStartLocation', timestamp: 'breakStartTimestamp' },
            { action: 'after-break', label: 'Selesai Istirahat 1', time: 'breakEnd', photo: 'breakEndPhoto', location: 'breakEndLocation', timestamp: 'breakEndTimestamp' },
            { action: 'break-2', label: 'Istirahat 2', time: 'break2Start', photo: 'break2StartPhoto', location: 'break2StartLocation', timestamp: 'break2StartTimestamp' },
            { action: 'after-break-2', label: 'Selesai Istirahat 2', time: 'break2End', photo: 'break2EndPhoto', location: 'break2EndLocation', timestamp: 'break2EndTimestamp' },
            { action: 'overtime', label: 'Lembur', time: 'overtimeStart', photo: 'overtimeStartPhoto', location: 'overtimeStartLocation', timestamp: 'overtimeStartTimestamp' },
            { action: 'clock-out', label: 'Clock Out', time: 'clockOut', photo: 'clockOutPhoto', location: 'clockOutLocation', timestamp: 'clockOutTimestamp' }
        ];
    },

    getAttendanceVerificationFieldNames() {
        return this.getAttendanceVerificationConfig()
            .flatMap(config => [config.photo, config.location, config.timestamp]);
    },

    getDedicatedAttendanceVerificationLogs(record) {
        return this.getAttendanceVerificationConfig()
            .map(config => ({
                action: config.action,
                label: config.label,
                time: record[config.time] || '',
                timestamp: record[config.timestamp] || '',
                location: record[config.location] || '',
                photo: record[config.photo] || ''
            }))
            .filter(log => log.time || log.timestamp || log.location || log.photo);
    },

    getLegacyAttendanceVerificationLog(record) {
        const photo = record.verificationPhoto || record.photo || record.verification?.photo || '';
        const location = record.verificationLocation || record.location || record.verification?.location || '';
        const timestamp = record.verificationTimestamp || record.verification?.timestamp || '';

        if (!photo && !location && !timestamp) return null;

        const completedConfig = [...this.getAttendanceVerificationConfig()]
            .reverse()
            .find(config => record[config.time]);
        const config = completedConfig || this.getAttendanceVerificationConfig()[0];

        return {
            action: config.action,
            label: config.label,
            time: record[config.time] || '',
            timestamp,
            location,
            photo
        };
    },

    mergeAttendanceVerificationLogs(parsedLogs, dedicatedLogs) {
        const byAction = new Map();
        const normalizeAction = (log) => String(log?.action || '').trim() || this.getActionFromLabel(log?.label);

        [...parsedLogs, ...dedicatedLogs].forEach(log => {
            if (!log) return;
            const action = normalizeAction(log);
            if (!action) return;

            const existing = byAction.get(action) || {};
            byAction.set(action, {
                ...existing,
                ...log,
                action,
                label: log.label || existing.label || this.getAttendanceVerificationLabel(action),
                time: log.time || existing.time || '',
                timestamp: log.timestamp || existing.timestamp || '',
                location: log.location || existing.location || '',
                photo: log.photo || existing.photo || ''
            });
        });

        const order = this.getAttendanceVerificationConfig().map(config => config.action);
        return Array.from(byAction.values()).sort((a, b) => {
            const indexA = order.indexOf(a.action);
            const indexB = order.indexOf(b.action);
            return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
        });
    },

    getActionFromLabel(label) {
        const normalized = String(label || '').toLowerCase().trim();
        const found = this.getAttendanceVerificationConfig().find(config =>
            normalized === config.label.toLowerCase() ||
            normalized === config.action.toLowerCase()
        );
        return found?.action || '';
    },

    getAttendanceVerificationLabel(action) {
        return this.getAttendanceVerificationConfig().find(config => config.action === action)?.label || action;
    },

    parseAttendanceLogs(value) {
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

    renderAttendanceVerificationLogs(logs) {
        if (!logs.length) {
            return '<div class="attendance-verification-list"><label>Bukti Verifikasi:</label><p class="no-photo">Belum ada foto atau lokasi verifikasi.</p></div>';
        }

        return `
            <div class="attendance-verification-list">
                <label>Bukti Verifikasi:</label>
                ${logs.map((log, index) => this.renderAttendanceVerificationLog(log, index)).join('')}
            </div>
        `;
    },

    renderAttendanceVerificationLog(log, index) {
        const location = this.getAttendanceLocation({ verificationLocation: log.location });
        const mapsUrl = location?.mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.mapsQuery)}` : '';
        const photo = log.photo || '';
        const timeText = dateTime.formatClockTime(log.time) || (log.timestamp ? dateTime.formatTime(new Date(log.timestamp)) : '-');

        return `
            <div class="attendance-verification-item">
                <div class="attendance-verification-meta">
                    <strong>${this.escapeHtml(log.label || log.action || `Verifikasi ${index + 1}`)}</strong>
                    <span>${this.escapeHtml(timeText || '-')}</span>
                    ${location ? `<p>${this.escapeHtml(location.display)}</p>` : '<p class="no-photo">Lokasi tidak tersedia</p>'}
                    ${location ? `<button type="button" class="btn-secondary btn-map" onclick="window.open('${this.escapeAttr(mapsUrl)}', '_blank')"><i class="fas fa-map-marker-alt"></i><span>Buka Maps</span></button>` : ''}
                </div>
                ${photo ? `<img src="${this.escapeAttr(photo)}" alt="Foto ${this.escapeAttr(log.label || 'verifikasi')}" class="attendance-verification-photo" onclick="adminReports.viewPhoto('${this.escapeAttr(photo)}')">` : '<p class="no-photo">Foto tidak tersedia</p>'}
            </div>
        `;
    },

    getAttendanceStatusLabel(status, clockIn) {
        const normalized = String(status || '').toLowerCase();
        if (!clockIn && (!status || normalized === 'waiting')) return 'Belum Absen';
        if (normalized === 'ontime') return 'Tepat Waktu';
        if (normalized === 'late' || normalized === 'terlambat') return 'Terlambat';
        if (normalized === 'absent') return 'Absen';
        return status || 'Hadir';
    },

    getAttendanceLocation(record) {
        const rawLocation = record.verificationLocation || record.location || record.verification?.location || '';
        const parsed = this.parseAttendanceLocation(rawLocation);
        if (!parsed) return null;

        const lat = Number(parsed.latitude);
        const lng = Number(parsed.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const accuracy = parsed.accuracy !== undefined && parsed.accuracy !== ''
            ? ` (akurasi ±${Math.round(Number(parsed.accuracy))}m)`
            : '';

        return {
            display: `${lat.toFixed(6)}, ${lng.toFixed(6)}${accuracy}`,
            mapsQuery: `${lat},${lng}`
        };
    },

    parseAttendanceLocation(rawLocation) {
        if (!rawLocation) return null;

        if (typeof rawLocation === 'object') {
            if (rawLocation.latitude !== undefined && rawLocation.longitude !== undefined) return rawLocation;
            if (rawLocation.location) return this.parseAttendanceLocation(rawLocation.location);
            if (rawLocation.lat !== undefined && rawLocation.lng !== undefined) {
                return { latitude: rawLocation.lat, longitude: rawLocation.lng, accuracy: rawLocation.accuracy };
            }
            if (rawLocation.coords?.latitude !== undefined && rawLocation.coords?.longitude !== undefined) {
                return rawLocation.coords;
            }
            return null;
        }

        const text = String(rawLocation).trim();
        if (!text || text === '[object Object]') return null;

        try {
            const parsed = JSON.parse(text);
            return this.parseAttendanceLocation(parsed);
        } catch (e) { }

        const latLngMatch = text.match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
        if (latLngMatch) {
            return { latitude: latLngMatch[1], longitude: latLngMatch[2] };
        }

        const latMatch = text.match(/(?:latitude|lat)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
        const lngMatch = text.match(/(?:longitude|lng|lon)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
        if (latMatch && lngMatch) {
            return { latitude: latMatch[1], longitude: lngMatch[1] };
        }

        return null;
    },

    viewJurnalDetail(index) {
        const jurnal = this.getFilteredJurnal()[index];
        if (!jurnal) {
            toast.error('Data jurnal tidak ditemukan');
            return;
        }
        this.currentPhotoUrl = jurnal.photo || '';

        const photoHtml = jurnal.photo ? `
            <div class="detail-photo-section">
                <label>Lampiran Foto</label>
                <div class="jurnal-photo-frame">
                    <img src="${this.escapeAttr(jurnal.photo)}" alt="Lampiran foto jurnal" class="jurnal-photo-preview" onclick="adminReports.viewCurrentPhoto()" onerror="adminReports.handlePhotoError(this)" title="Klik untuk memperbesar">
                </div>
                <button type="button" class="btn-secondary btn-view-photo" onclick="adminReports.viewCurrentPhoto()">
                    <i class="fas fa-search-plus"></i><span>Perbesar Foto</span>
                </button>
            </div>
        ` : '<div class="detail-photo-section"><label>Lampiran Foto</label><p class="no-photo">Tidak ada foto</p></div>';

        const content = `
            <div class="jurnal-detail-content">
                <div class="jurnal-detail-meta">
                    <div class="detail-row">
                        <label>Nama</label>
                        <p>${this.escapeHtml(jurnal.name)}</p>
                    </div>
                    <div class="detail-row">
                        <label>Divisi</label>
                        <p>${this.escapeHtml(jurnal.division)}</p>
                    </div>
                    <div class="detail-row">
                        <label>Tanggal</label>
                        <p>${this.escapeHtml(jurnal.date ? dateTime.formatDate(new Date(jurnal.date), 'long') : (jurnal.updatedAt ? dateTime.formatDate(new Date(jurnal.updatedAt), 'long') : '-'))}</p>
                    </div>
                </div>
                <div class="jurnal-detail-sections">
                    <div class="detail-section">
                        <label>Aktivitas Kerja</label>
                        <p>${this.escapeHtml(jurnal.tasks).replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="detail-section">
                        <label>Hasil Kerja</label>
                        <p>${this.escapeHtml(jurnal.achievements).replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="detail-section">
                        <label>Kendala atau Catatan</label>
                        <p>${this.escapeHtml(jurnal.obstacles).replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="detail-section">
                        <label>Rencana Berikutnya</label>
                        <p>${this.escapeHtml(jurnal.plan).replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
                ${photoHtml}
            </div>
        `;

        const actions = [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }
        ];
        actions.modalClass = 'admin-detail-modal jurnal-detail-modal';

        modal.show('Detail Jurnal', content, actions);
    },

    viewJurnalPhoto(index) {
        const jurnal = this.getFilteredJurnal()[index];
        if (!jurnal || !jurnal.photo) {
            toast.error('Foto jurnal tidak ditemukan');
            return;
        }

        this.viewPhoto(jurnal.photo);
    },

    viewCurrentPhoto() {
        if (!this.currentPhotoUrl) {
            toast.error('Foto jurnal tidak ditemukan');
            return;
        }

        this.viewPhoto(this.currentPhotoUrl);
    },

    viewCurrentLeaveAttachment() {
        if (!this.currentLeaveAttachmentUrl) {
            toast.error('Foto lampiran tidak ditemukan');
            return;
        }

        this.viewPhoto(this.currentLeaveAttachmentUrl);
    },

    handlePhotoError(img) {
        if (!img) return;

        const wrapper = img.parentElement;
        img.style.display = 'none';
        if (wrapper && !wrapper.querySelector('.photo-load-error')) {
            const message = document.createElement('p');
            message.className = 'photo-load-error';
            message.textContent = 'Foto tidak bisa dimuat';
            wrapper.appendChild(message);
        }
    },

    async deleteJurnal(filteredIndex) {
        if (!auth?.isAdmin || !auth.isAdmin()) {
            toast.error('Pemilik hanya dapat melihat rekap jurnal.');
            return;
        }

        const filtered = this.getFilteredJurnal();
        const jurnal = filtered[filteredIndex];
        if (!jurnal) {
            toast.error('Data jurnal tidak ditemukan');
            return;
        }

        if (!confirm('Apakah Anda yakin ingin menghapus rekap jurnal ini?')) {
            return;
        }

        const actualIndex = this.jurnalData.indexOf(jurnal);
        if (actualIndex < 0) {
            toast.error('Gagal menemukan data jurnal untuk dihapus');
            return;
        }

        const removed = this.jurnalData.splice(actualIndex, 1)[0];
        this.renderJurnalReports();

        const cached = storage.get('jurnals', []);
        const filteredCache = cached.filter(item => {
            const itemPhoto = item.photo || item.attachment || item.lampiran || item.image || null;
            const removedPhoto = removed.photo || removed.attachment || removed.lampiran || removed.image || null;
            return !(item.date === removed.date && String(item.userId || item.user_id || '') === String(removed.userId || '') && itemPhoto === removedPhoto && item.tasks === removed.tasks);
        });
        storage.set('jurnals', filteredCache);

        try {
            await api.deleteJournal({ date: removed.date, userId: removed.userId });
            toast.success('Rekap jurnal berhasil dihapus');
        } catch (error) {
            console.error('Error deleting journal:', error);
            toast.warning('Jurnal dihapus secara lokal, tetapi backend belum mendukung hapus');
        }
    },

    viewPhoto(photoUrl) {
        if (!photoUrl) return;

        const content = `
            <div class="photo-viewer-modal">
                <img src="${this.escapeAttr(photoUrl)}" alt="Foto jurnal" class="full-photo" onerror="adminReports.handlePhotoError(this)">
            </div>
        `;

        const actions = [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Buka di Tab Baru', class: 'btn-primary', onClick: () => this.openPhotoInNewTab(photoUrl) }
        ];
        actions.modalClass = 'admin-detail-modal photo-detail-modal';

        modal.show('Foto Lampiran', content, actions);
    },

    openPhotoInNewTab(photoUrl) {
        if (!photoUrl) return;

        const newTab = window.open('', '_blank');
        if (!newTab) {
            toast.warning('Popup diblokir browser. Izinkan popup untuk membuka foto di tab baru.');
            return;
        }

        newTab.document.open();
        newTab.document.write(`
            <!doctype html>
            <html lang="id">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Foto Jurnal Kerja</title>
                <style>
                    body {
                        margin: 0;
                        min-height: 100vh;
                        display: grid;
                        place-items: center;
                        background: #111827;
                        color: #f9fafb;
                        font-family: Arial, sans-serif;
                    }
                    img {
                        max-width: 96vw;
                        max-height: 96vh;
                        object-fit: contain;
                        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
                    }
                    p {
                        color: #fca5a5;
                    }
                </style>
            </head>
            <body>
                <img src="${this.escapeAttr(photoUrl)}" alt="Foto Jurnal Kerja" onerror="this.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Foto tidak bisa dimuat' }))">
            </body>
            </html>
        `);
        newTab.document.close();
    },

    viewLeaveDetail(index) {
        const data = this.getFilteredLeave();
        const item = data[index];

        if (!item) {
            toast.error('Data cuti/izin tidak ditemukan');
            return;
        }

        const detailTanggal = item.source === 'leave'
            ? `${this.escapeHtml(this.formatReportDisplayDate(item.startDate || '-'))} sampai ${this.escapeHtml(this.formatReportDisplayDate(item.endDate || '-'))}`
            : this.escapeHtml(this.formatReportDisplayDate(item.date || '-'));
        const statusText = item.status === 'pending'
            ? 'Menunggu'
            : item.status === 'approved'
                ? 'Disetujui'
                : 'Ditolak';
        const sourceText = item.source === 'leave' ? 'Cuti' : 'Izin / Sakit';
        this.currentLeaveAttachmentUrl = this.getLeaveAttachmentImage(item);
        const attachmentHtml = this.renderLeaveAttachment(item);
        const confirmationHtml = this.renderLeaveConfirmationInfo(item);

        const content = `
        <div class="leave-detail-content">
            <div class="leave-detail-hero">
                <div>
                    <span class="leave-detail-kicker">${sourceText}</span>
                    <h3>${this.escapeHtml(item.type || '-')}</h3>
                    <p>${this.escapeHtml(item.name || '-')} · ${this.escapeHtml(item.division || '-')}</p>
                </div>
                <span class="status-badge ${this.escapeAttr(item.status || 'pending')}">${statusText}</span>
            </div>

            <div class="leave-detail-grid">
                <div class="leave-detail-field">
                    <label>Nama</label>
                    <p>${this.escapeHtml(item.name || '-')}</p>
                </div>
                <div class="leave-detail-field">
                    <label>Divisi</label>
                    <p>${this.escapeHtml(item.division || '-')}</p>
                </div>
                <div class="leave-detail-field">
                    <label>Tanggal</label>
                    <p>${detailTanggal}</p>
                </div>
                <div class="leave-detail-field">
                    <label>Durasi</label>
                    <p>${this.escapeHtml(String(item.duration || '-'))} hari</p>
                </div>
            </div>

            <div class="leave-detail-section">
                <label>Alasan</label>
                <p>${this.escapeHtml(item.reason || '-')}</p>
            </div>

            ${attachmentHtml}
            ${confirmationHtml}
        </div>
    `;

        const actions = [];
        if (this.canConfirmLeaveRequests() && item.status === 'pending') {
            actions.push(
                { label: 'Tolak', class: 'btn-danger', onClick: async () => this.rejectLeaveOrPermission(index) },
                { label: 'Konfirmasi', class: 'btn-confirm', onClick: async () => this.approveLeaveOrPermission(index) }
            );
        } else {
            actions.push({ label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() });
        }

        actions.modalClass = 'admin-detail-modal leave-detail-modal';

        modal.show('Detail Cuti / Izin', content, actions);
    },

    renderLeaveConfirmationInfo(item) {
        if (!item || item.status === 'pending') return '';

        const actorName = item.confirmedByName || item.confirmedBy || 'Pemilik';
        const actorRole = auth?.getRoleLabel ? auth.getRoleLabel(item.confirmedByRole || 'pemilik') : 'Pemilik';
        const confirmedAt = item.confirmedAt ? this.formatReportDisplayDate(item.confirmedAt) : '-';

        return `
            <div class="leave-detail-section">
                <label>Dikonfirmasi oleh</label>
                <p>${this.escapeHtml(actorName)} (${this.escapeHtml(actorRole)})${confirmedAt !== '-' ? ` - ${this.escapeHtml(confirmedAt)}` : ''}</p>
            </div>
        `;
    },

    renderLeaveAttachment(item) {
        if (item.source !== 'permission') return '';

        const attachmentName = item.attachmentName || 'Lampiran';

        if (this.currentLeaveAttachmentUrl) {
            return `
                <div class="detail-photo-section">
                    <label>Lampiran Foto:</label>
                    <img src="${this.escapeAttr(this.currentLeaveAttachmentUrl)}" alt="${this.escapeAttr(attachmentName)}" class="jurnal-photo-preview" onclick="adminReports.viewCurrentLeaveAttachment()" onerror="adminReports.handlePhotoError(this)" title="Klik untuk memperbesar">
                    <button type="button" class="btn-secondary btn-view-photo" onclick="adminReports.viewCurrentLeaveAttachment()">
                        <i class="fas fa-search-plus"></i><span>Perbesar Foto</span>
                    </button>
                </div>
            `;
        }

        if (item.hasAttachment || attachmentName) {
            return `
                <div class="leave-detail-section">
                    <label>Lampiran</label>
                    <p><i class="fas fa-paperclip"></i> ${this.escapeHtml(attachmentName || 'Lampiran tersedia')}</p>
                </div>
            `;
        }

        return `
            <div class="leave-detail-section">
                <label>Lampiran</label>
                <p class="no-photo">Tidak ada lampiran</p>
            </div>
        `;
    },

    getLeaveAttachmentImage(item) {
        const attachmentData = item?.attachmentData || '';
        const isImage = String(item?.attachmentType || '').startsWith('image/')
            || String(attachmentData).startsWith('data:image/');

        return isImage && attachmentData ? attachmentData : '';
    },

    async approveLeaveOrPermission(index) {
        await this.updateLeaveOrPermissionStatus(index, 'approved');
    },

    async rejectLeaveOrPermission(index) {
        await this.updateLeaveOrPermissionStatus(index, 'rejected');
    },

    async updateLeaveOrPermissionStatus(index, nextStatus) {
        if (!this.canConfirmLeaveRequests()) {
            toast.error('Konfirmasi cuti dan izin hanya dapat dilakukan oleh pemilik.');
            return;
        }

        const data = this.getFilteredLeave();
        const item = data[index];

        if (!item) {
            toast.error('Data pengajuan tidak ditemukan');
            return;
        }

        modal.close();

        const previousStatus = item.status;
        item.status = nextStatus;
        this.renderLeaveReports();

        try {
            const actor = this.getConfirmationActor();
            const result = item.source === 'leave'
                ? (nextStatus === 'approved' ? await api.approveLeave(item.id, actor) : await api.rejectLeave(item.id, actor))
                : (nextStatus === 'approved' ? await api.approveIzin(item.id, actor) : await api.rejectIzin(item.id, actor));

            if (!result || !result.success) {
                item.status = previousStatus;
                this.renderLeaveReports();
                toast.error(result?.error || 'Gagal memperbarui pengajuan');
                return;
            }

            toast.success(nextStatus === 'approved' ? 'Pengajuan berhasil disetujui' : 'Pengajuan berhasil ditolak');
            await this.loadData();
            this.renderLeaveReports();
        } catch (error) {
            console.error('Error updating leave/permission status:', error);
            item.status = previousStatus;
            await this.loadData();
            this.renderLeaveReports();
            toast.error('Gagal memperbarui pengajuan');
        }
    }
};

// Global init functions
window.initAttendanceReports = () => {
    adminReports.initAttendanceReports();
};

window.initJurnalReports = () => {
    adminReports.initJurnalReports();
};

window.initLeaveReports = () => {
    adminReports.initLeaveReports();
};

// Expose
window.adminReports = adminReports;
