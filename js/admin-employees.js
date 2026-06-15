/**
 * Portal Karyawan - Admin Employees
 * Employee management for admin
 */

const adminEmployees = {
    employees: [],
    shifts: [],
    radioDivisions: ['Pimpinan', 'Manajemen', 'Administrasi', 'Keuangan', 'Siaran', 'Keanggotaan'],
    radioPositions: ['Manager', 'Ketua', 'Pengawas', 'Sekretaris', 'Bendahara', 'Penyiar', 'Anggota'],
    divisionPositionMap: {
        Pimpinan: ['Manager', 'Ketua', 'Pengawas'],
        Manajemen: ['Manager', 'Ketua', 'Pengawas'],
        Administrasi: ['Sekretaris'],
        Keuangan: ['Bendahara'],
        Siaran: ['Penyiar'],
        Keanggotaan: ['Anggota']
    },
    currentPage: 1,
    perPage: 10,
    eventsBound: false,
    dataUpdateBound: false,
    employeeModalMode: 'add',
    filters: {
        search: '',
        division: '',
        status: ''
    },

    async init() {
        if (!auth.canAccessAdminReports()) {
            toast.error('Anda tidak memiliki akses!');
            router.navigate('dashboard');
            return;
        }

        this.loadCachedEmployees();
        this.bindEvents();
        this.bindDataUpdateEvents();
        this.renderTable();
        this.renderMobileCards();
        this.updatePaginationInfo();
        this.applyRoleControls();
        this.refreshEmployees();
    },

    bindDataUpdateEvents() {
        if (this.dataUpdateBound) return;
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        window.addEventListener('dataUpdated', (event) => this.handleDataUpdated(event));
        this.dataUpdateBound = true;
    },

    async handleDataUpdated(event) {
        const detail = event?.detail || {};
        const relevantTypes = ['settings', 'employees', 'shifts'];
        if (!relevantTypes.includes(detail.type)) return;
        if (router?.currentPage !== 'employees') return;
        if (!auth.canAccessAdminReports()) return;

        this.loadCachedEmployees();
        this.renderTable();
        this.renderMobileCards();
        this.updatePaginationInfo();
        this.applyRoleControls();
        await this.refreshEmployees();
    },

    canManageEmployees() {
        return Boolean(auth && typeof auth.canManageEmployees === 'function' && auth.canManageEmployees());
    },

    ensureCanManageEmployees() {
        if (this.canManageEmployees()) return true;
        toast.error('Pemilik hanya dapat melihat data karyawan.');
        return false;
    },

    applyRoleControls() {
        const addBtn = document.getElementById('btn-add-employee');
        if (addBtn) {
            addBtn.hidden = !this.canManageEmployees();
            addBtn.style.display = this.canManageEmployees() ? '' : 'none';
        }
    },

    loadCachedEmployees() {
        this.employees = normalizeEmployeeList(storage.get('admin_employees', []));
        this.shifts = storage.get('shifts', []);
        this.populateShiftOptions();
        this.populateOrganizationOptions();
    },

    async refreshEmployees() {
        await this.loadEmployees();
        this.renderTable();
        this.renderMobileCards();
        this.updatePaginationInfo();
        this.applyRoleControls();
    },

    async loadEmployees() {
        try {
            const [result, shiftsResult] = await Promise.all([
                api.getEmployees(),
                api.getShifts()
            ]);
            this.employees = normalizeEmployeeList(result.data || []);
            this.shifts = shiftsResult.data || storage.get('shifts', []);
            storage.set('admin_employees', this.employees);
            storage.set('shifts', this.shifts);
            this.populateShiftOptions();
            this.populateOrganizationOptions();
        } catch (error) {
            console.error('Error loading employees:', error);
            this.employees = normalizeEmployeeList(storage.get('admin_employees', []));
            this.shifts = storage.get('shifts', []);
            this.populateShiftOptions();
            this.populateOrganizationOptions();
        }
    },

    populateOrganizationOptions() {
        this.populateSelectOptions('emp-division', this.getDivisionOptions(), 'Pilih Divisi');
        this.populateSelectOptions('emp-position', this.getPositionOptions(), 'Pilih Jabatan');
        this.populateSelectOptions('division-filter', this.getDivisionOptions(), 'Semua Divisi');
        this.bindOrganizationSelects();
    },

    bindOrganizationSelects() {
        const divisionSelect = document.getElementById('emp-division');
        if (!divisionSelect || divisionSelect.dataset.orgBound === 'true') return;

        divisionSelect.dataset.orgBound = 'true';
        divisionSelect.addEventListener('change', () => {
            const currentPosition = document.getElementById('emp-position')?.value || '';
            this.populatePositionOptionsForDivision(divisionSelect.value, currentPosition);
        });
    },

    getDivisionOptions() {
        return this.mergeOptions(this.radioDivisions, this.employees.map(getEmployeeDivision));
    },

    getPositionOptions() {
        return this.mergeOptions(
            this.radioPositions,
            this.employees.map(emp => emp.position).filter(position => !this.isReservedEmployeePosition(position))
        );
    },

    getPositionOptionsForDivision(division) {
        const mapped = this.divisionPositionMap[division] || [];
        return mapped.length ? this.mergeOptions(mapped, this.radioPositions) : this.getPositionOptions();
    },

    mergeOptions(baseOptions, extraOptions) {
        const seen = new Set();
        return [...baseOptions, ...extraOptions]
            .map(value => String(value || '').trim())
            .filter(value => {
                if (!value || seen.has(value)) return false;
                seen.add(value);
                return true;
            });
    },

    isReservedEmployeePosition(position) {
        const value = String(position || '').trim();
        return value.toLowerCase() === 'pemilik';
    },

    populateSelectOptions(id, options, placeholder) {
        const select = document.getElementById(id);
        if (!select) return;

        const previousValue = select.value;
        select.innerHTML = `<option value="">${placeholder}</option>` + options.map(value => (
            `<option value="${this.escapeAttr(value)}">${this.escapeHtml(value)}</option>`
        )).join('');

        if (previousValue) select.value = previousValue;
    },

    populatePositionOptionsForDivision(division, preferredValue = '') {
        this.populateSelectOptions('emp-position', this.getPositionOptionsForDivision(division), 'Pilih Jabatan');
        if (preferredValue) this.ensureSelectValue('emp-position', preferredValue);
    },

    populateShiftOptions() {
        const select = document.getElementById('emp-shift');
        if (!select) return;

        if (!this.shifts.length) {
            this.shifts = storage.get('shifts', []);
        }

        if (!this.shifts.length) {
            select.innerHTML = `
                <option value="">Pilih Shift</option>
                <option value="Pagi">Pagi (08:00-17:00)</option>
                <option value="Siang">Siang (14:00-23:00)</option>
                <option value="Malam">Malam (23:00-08:00)</option>
            `;
            return;
        }

        select.innerHTML = '<option value="">Pilih Shift</option>' + this.shifts.map(shift => {
            const label = `${shift.name} (${shift.startTime || '-'}-${shift.endTime || '-'})`;
            return `<option value="${shift.name}">${label}</option>`;
        }).join('');
    },

    async refreshShifts() {
        try {
            const result = await api.getShifts();
            if (result && result.success) {
                this.shifts = result.data || [];
                storage.set('shifts', this.shifts);
            }
        } catch (error) {
            console.error('Error loading shifts:', error);
            this.shifts = storage.get('shifts', []);
        }

        this.populateShiftOptions();
    },

    bindEvents() {
        this.syncSearchInputValue();
        this.protectSearchInputFromAutofill();

        if (this.eventsBound) {
            return;
        }
        this.eventsBound = true;

        // Search filter
        const searchInput = document.getElementById('employee-search');
        if (searchInput) {
            searchInput.addEventListener('focus', () => {
                searchInput.readOnly = false;
                if (!this.filters.search && this.looksLikeBrowserAutofill(searchInput.value)) {
                    searchInput.value = '';
                }
            });
            searchInput.addEventListener('pointerdown', () => {
                searchInput.readOnly = false;
            });
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Division filter
        const divisionFilter = document.getElementById('division-filter');
        if (divisionFilter) {
            divisionFilter.addEventListener('change', (e) => {
                this.filters.division = e.target.value;
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Add employee button
        const addBtn = document.getElementById('btn-add-employee');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }

        // Close modal
        const closeBtn = document.getElementById('btn-close-modal');
        const cancelBtn = document.getElementById('btn-cancel-add');
        const modal = document.getElementById('modal-add-employee');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hideAddModal());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideAddModal());

        // Close modal when clicking overlay
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideAddModal();
            });
        }

        // Form submit
        const form = document.getElementById('form-add-employee');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSaveEmployee(e));
        }

        // Set default date
        const joinDateInput = document.getElementById('emp-join-date');
        if (joinDateInput) {
            joinDateInput.valueAsDate = new Date();
        }
    },

    syncSearchInputValue() {
        const searchInput = document.getElementById('employee-search');
        if (searchInput) {
            searchInput.value = this.filters.search || '';
        }
    },

    protectSearchInputFromAutofill() {
        const searchInput = document.getElementById('employee-search');
        if (!searchInput) return;

        const clearUnexpectedAutofill = () => {
            if (this.filters.search) return;
            if (document.activeElement === searchInput && !searchInput.readOnly) return;
            if (!searchInput.value) return;

            searchInput.value = '';
        };

        searchInput.readOnly = true;
        clearUnexpectedAutofill();
        setTimeout(clearUnexpectedAutofill, 50);
        setTimeout(clearUnexpectedAutofill, 250);
        setTimeout(clearUnexpectedAutofill, 800);
    },

    looksLikeBrowserAutofill(value) {
        return /@/.test(String(value || ''));
    },

    getFilteredEmployees() {
        const filtered = this.employees.filter(emp => {
            const matchesSearch = !this.filters.search ||
                emp.name.toLowerCase().includes(this.filters.search) ||
                emp.email.toLowerCase().includes(this.filters.search) ||
                emp.position.toLowerCase().includes(this.filters.search);

            const matchesDivision = !this.filters.division || getEmployeeDivision(emp) === this.filters.division;
            const matchesStatus = !this.filters.status || emp.status === this.filters.status;

            return matchesSearch && matchesDivision && matchesStatus;
        });

        return this.sortEmployeesById(filtered);
    },

    sortEmployeesById(employees = []) {
        return [...employees].sort((a, b) => this.compareEmployeeIds(a.id, b.id));
    },

    compareEmployeeIds(a, b) {
        const left = this.getEmployeeIdNumber(a);
        const right = this.getEmployeeIdNumber(b);

        if (left !== right) return left - right;
        return String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
    },

    getEmployeeIdNumber(id) {
        const raw = String(id || '').trim();
        const prefixed = raw.match(/^KRY(\d+)$/i);
        if (prefixed) return parseInt(prefixed[1], 10) || Number.MAX_SAFE_INTEGER;
        if (/^\d+$/.test(raw)) return parseInt(raw, 10) || Number.MAX_SAFE_INTEGER;
        return Number.MAX_SAFE_INTEGER;
    },

    renderTable() {
        const tbody = document.getElementById('employees-table-body');
        if (!tbody) return;

        const filtered = this.getFilteredEmployees();
        const totalPages = Math.max(1, Math.ceil(filtered.length / this.perPage));
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
        }

        const start = (this.currentPage - 1) * this.perPage;
        const paginated = filtered.slice(start, start + this.perPage);
        const canManage = this.canManageEmployees();

        if (paginated.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: var(--spacing-xl);">
                        Tidak ada data karyawan
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = paginated.map(emp => `
            <tr>
                <td>
                    <div class="employee-info">
                        <div class="employee-avatar">
                            <img src="${getAvatarUrl(emp)}" alt="${emp.name}">
                        </div>
                        <div class="employee-details">
                            <span class="employee-name">${emp.name}</span>
                            <span class="employee-email">${emp.email}</span>
                        </div>
                    </div>
                </td>
                <td>${this.formatEmployeeId(emp.id)}</td>
                <td>${this.escapeHtml(getEmployeeDivision(emp) || '-')}</td>
                <td>${this.escapeHtml(emp.position || '-')}</td>
                <td>${emp.shift}</td>
                <td>
                    <span class="status-badge ${emp.status}">
                        ${this.getStatusLabel(emp.status)}
                    </span>
                </td>
                <td>
                    <button class="btn-action view" onclick="adminEmployees.viewEmployee('${String(emp.id).replace(/'/g, "\\'")}')" title="Lihat">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${canManage ? `<button class="btn-action edit" onclick="adminEmployees.editEmployee('${String(emp.id).replace(/'/g, "\\'")}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action delete" onclick="adminEmployees.deleteEmployee('${String(emp.id).replace(/'/g, "\\'")}')" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </td>
            </tr>
        `).join('');

        this.updatePagination(filtered.length);
    },

    renderMobileCards() {
        const container = document.getElementById('employees-mobile-cards');
        if (!container) return;

        const filtered = this.getFilteredEmployees();
        const start = (this.currentPage - 1) * this.perPage;
        const paginated = filtered.slice(start, start + this.perPage);
        const canManage = this.canManageEmployees();

        container.innerHTML = paginated.map(emp => `
            <div class="mobile-card">
                <div class="mobile-card-header">
                    <div class="employee-info">
                        <div class="employee-avatar">
                            <img src="${getAvatarUrl(emp)}" alt="${emp.name}">
                        </div>
                        <div class="employee-details">
                            <span class="employee-name">${emp.name}</span>
                            <span class="employee-email">${emp.email}</span>
                        </div>
                    </div>
                    <span class="status-badge ${emp.status}">${this.getStatusLabel(emp.status)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">ID</span>
                    <span class="mobile-card-value">${this.formatEmployeeId(emp.id)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Divisi</span>
                    <span class="mobile-card-value">${this.escapeHtml(getEmployeeDivision(emp) || '-')}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Jabatan</span>
                    <span class="mobile-card-value">${this.escapeHtml(emp.position || '-')}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Shift</span>
                    <span class="mobile-card-value">${emp.shift}</span>
                </div>
                <div class="mobile-card-actions employee-card-actions">
                    <button class="btn-action view employee-card-action" onclick="adminEmployees.viewEmployee('${String(emp.id).replace(/'/g, "\\'")}')" title="Lihat" aria-label="Lihat detail karyawan">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${canManage ? `<button class="btn-action edit employee-card-action" onclick="adminEmployees.editEmployee('${String(emp.id).replace(/'/g, "\\'")}')" title="Edit" aria-label="Edit karyawan">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action delete employee-card-action" onclick="adminEmployees.deleteEmployee('${String(emp.id).replace(/'/g, "\\'")}')" title="Hapus" aria-label="Hapus karyawan">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </div>
            </div>
        `).join('');
    },

    updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / this.perPage);
        const paginationButtons = document.querySelector('.pagination-buttons');

        if (paginationButtons) {
            let buttonsHtml = `
                <button class="btn-page" ${this.currentPage === 1 ? 'disabled' : ''} onclick="adminEmployees.goToPage(${this.currentPage - 1})">
                    <i class="fas fa-chevron-left"></i>
                </button>
            `;

            for (let i = 1; i <= totalPages; i++) {
                buttonsHtml += `
                    <button class="btn-page ${i === this.currentPage ? 'active' : ''}" onclick="adminEmployees.goToPage(${i})">${i}</button>
                `;
            }

            buttonsHtml += `
                <button class="btn-page" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="adminEmployees.goToPage(${this.currentPage + 1})">
                    <i class="fas fa-chevron-right"></i>
                </button>
            `;

            paginationButtons.innerHTML = buttonsHtml;
        }

        this.updatePaginationInfo();
    },

    updatePaginationInfo() {
        const filtered = this.getFilteredEmployees();
        const start = (this.currentPage - 1) * this.perPage + 1;
        const end = Math.min(start + this.perPage - 1, filtered.length);
        const info = document.querySelector('.pagination-info');

        if (info) {
            info.textContent = `Menampilkan ${filtered.length > 0 ? start : 0}-${end} dari ${filtered.length} karyawan`;
        }
    },

    goToPage(page) {
        const filtered = this.getFilteredEmployees();
        const totalPages = Math.ceil(filtered.length / this.perPage);

        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderTable();
            this.renderMobileCards();
        }
    },

    getStatusLabel(status) {
        const labels = {
            'active': 'Aktif',
            'on-leave': 'Cuti',
            'inactive': 'Non-Aktif'
        };
        return labels[status] || status;
    },

    async showAddModal() {
        if (!this.ensureCanManageEmployees()) return;
        await this.refreshShifts();
        this.setModalMode('add');
    },

    setModalMode(mode, employee = null) {
        const modal = document.getElementById('modal-add-employee');
        const modalTitle = document.getElementById('modal-add-title');
        const saveButton = document.getElementById('btn-save-employee');
        const idInput = document.getElementById('emp-id');
        const form = document.getElementById('form-add-employee');

        if (!modal || !modalTitle || !saveButton || !idInput || !form) return;

        this.employeeModalMode = mode === 'edit' ? 'edit' : 'add';
        this.populateShiftOptions();
        this.populateOrganizationOptions();

        if (mode === 'edit' && employee) {
            modalTitle.textContent = 'Edit Karyawan';
            saveButton.textContent = 'Perbarui Karyawan';
            idInput.value = employee.id;
            document.getElementById('emp-name').value = employee.name || '';
            document.getElementById('emp-email').value = employee.email || '';
            this.ensureSelectValue('emp-division', getEmployeeDivision(employee) || '');
            this.populatePositionOptionsForDivision(getEmployeeDivision(employee) || '', employee.position || '');
            this.ensureSelectValue('emp-position', employee.position || '');
            document.getElementById('emp-shift').value = employee.shift || '';
            document.getElementById('emp-status').value = employee.status || 'active';
            document.getElementById('emp-join-date').value = employee.joinDate || '';
            document.getElementById('emp-password').value = '';
            document.getElementById('emp-password').placeholder = 'Kosongkan jika tidak reset password';
            document.getElementById('emp-password').readOnly = false;
            const passwordLabel = document.querySelector('label[for="emp-password"]');
            if (passwordLabel) passwordLabel.textContent = 'Reset password';
        } else {
            modalTitle.textContent = 'Tambah Karyawan Baru';
            saveButton.textContent = 'Simpan Karyawan';
            form.reset();
            this.updateEmployeeIdPreview();
            document.getElementById('emp-password').value = '12345';
            document.getElementById('emp-password').placeholder = '12345';
            document.getElementById('emp-password').readOnly = true;
            const passwordLabel = document.querySelector('label[for="emp-password"]');
            if (passwordLabel) passwordLabel.textContent = 'Password awal';
            this.populatePositionOptionsForDivision('', '');
            const joinDateInput = document.getElementById('emp-join-date');
            if (joinDateInput) joinDateInput.valueAsDate = new Date();
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    updateEmployeeIdPreview() {
        const idInput = document.getElementById('emp-id');
        if (idInput) {
            document.getElementById('emp-id').value = this.getNextEmployeeIdPreview();
        }
    },

    ensureSelectValue(id, value) {
        const select = document.getElementById(id);
        const normalizedValue = String(value || '').trim();
        if (!select || !normalizedValue) return;

        if (!Array.from(select.options).some(option => option.value === normalizedValue)) {
            const option = document.createElement('option');
            option.value = normalizedValue;
            option.textContent = normalizedValue;
            select.appendChild(option);
        }

        select.value = normalizedValue;
    },

    hideAddModal() {
        const modal = document.getElementById('modal-add-employee');
        const form = document.getElementById('form-add-employee');
        const idInput = document.getElementById('emp-id');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        if (form) {
            form.reset();
            const joinDateInput = document.getElementById('emp-join-date');
            if (joinDateInput) joinDateInput.valueAsDate = new Date();
        }
        if (idInput) {
            idInput.value = '';
        }
        this.employeeModalMode = 'add';
    },

    async handleSaveEmployee(e) {
        e.preventDefault();
        if (!this.ensureCanManageEmployees()) return;

        const idValue = document.getElementById('emp-id').value;
        const name = document.getElementById('emp-name').value.trim();
        const email = document.getElementById('emp-email').value.trim();
        const division = document.getElementById('emp-division').value;
        const position = document.getElementById('emp-position').value;
        const shift = document.getElementById('emp-shift').value;
        const status = document.getElementById('emp-status').value;
        const joinDate = document.getElementById('emp-join-date').value;
        const password = document.getElementById('emp-password').value.trim();

        const employeeData = {
            name,
            email,
            division,
            position,
            shift,
            status,
            joinDate,
        };
        const isEdit = this.employeeModalMode === 'edit';
        if (isEdit) {
            if (password) employeeData.password = password;
        } else {
            employeeData.password = password || '12345';
            employeeData.mustChangePassword = true;
        }

        const tempId = isEdit ? idValue : (idValue || this.getNextEmployeeIdPreview());
        if (!isEdit) {
            employeeData.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${this.getRandomColor()}&color=fff`;
        }

        const saveBtn = document.getElementById('btn-save-employee');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        let previousEmployee = null;
        const safeEmployeeData = { ...employeeData };
        delete safeEmployeeData.password;
        if (isEdit) {
            const idx = this.employees.findIndex(emp => String(emp.id) === String(idValue));
            if (idx >= 0) {
                previousEmployee = { ...this.employees[idx] };
                this.employees[idx] = { ...this.employees[idx], ...safeEmployeeData };
                this.renderTable();
                this.renderMobileCards();
            }
        } else {
            const tempEmployee = { id: tempId, ...safeEmployeeData };
            this.employees.unshift(tempEmployee);
            this.renderTable();
            this.renderMobileCards();
            this.updatePaginationInfo();
        }

        try {
            const result = isEdit
                ? await api.updateEmployee(idValue, employeeData)
                : await api.addEmployee(employeeData);

            if (result.success) {
                if (isEdit) {
                    const idx = this.employees.findIndex(emp => String(emp.id) === String(idValue));
                    if (idx >= 0) {
                        this.employees[idx] = result.data;
                    }
                    if (previousEmployee && String(previousEmployee.shift || '') !== String(shift || '')) {
                        await this.syncEmployeeShiftToCalendar(idValue, shift);
                    }
                    toast.success(`Karyawan ${name} berhasil diperbarui!`);
                } else {
                    const idx = this.employees.findIndex(emp => String(emp.id) === String(tempId));
                    if (idx >= 0) {
                        this.employees[idx] = result.data;
                    } else {
                        const existingIdx = this.employees.findIndex(emp => String(emp.id) === String(result.data.id) || emp.email === result.data.email);
                        if (existingIdx >= 0) {
                            this.employees[existingIdx] = result.data;
                        } else {
                            this.employees.unshift(result.data);
                        }
                    }
                    await this.syncEmployeeShiftToCalendar(result.data.id, result.data.shift || shift);
                    toast.success(`Karyawan ${name} berhasil ditambahkan!\nPassword default: 12345`);
                }

                this.updateDivisionFilterOptions(division);
                this.populateOrganizationOptions();
                this.hideAddModal();
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            } else {
                if (isEdit && previousEmployee) {
                    const idx = this.employees.findIndex(emp => String(emp.id) === String(idValue));
                    if (idx >= 0) {
                        this.employees[idx] = previousEmployee;
                    }
                } else if (!isEdit) {
                    this.employees = this.employees.filter(emp => String(emp.id) !== String(tempId));
                }
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
                toast.error(result.error || 'Gagal menyimpan data karyawan');
            }
        } catch (error) {
            if (isEdit && previousEmployee) {
                const idx = this.employees.findIndex(emp => String(emp.id) === String(idValue));
                if (idx >= 0) {
                    this.employees[idx] = previousEmployee;
                }
            } else if (!isEdit) {
                this.employees = this.employees.filter(emp => String(emp.id) !== String(tempId));
            }
            this.renderTable();
            this.renderMobileCards();
            this.updatePaginationInfo();
            console.error('Error saving employee:', error);
            toast.error('Terjadi kesalahan saat menyimpan data');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = 'Simpan Karyawan';
            }
        }
    },

    async syncEmployeeShiftToCalendar(employeeId, shiftName) {
        if (!employeeId || !shiftName) return;

        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const startDay = today.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const key = `${year}-${month}`;

        const schedules = storage.get('shift_schedule', {}) || {};
        if (!schedules[key]) schedules[key] = {};

        const employeeKey = String(employeeId);
        if (!schedules[key][employeeKey]) schedules[key][employeeKey] = {};

        for (let day = startDay; day <= daysInMonth; day++) {
            schedules[key][employeeKey][day] = shiftName;
        }

        storage.set('shift_schedule', schedules);

        if (window.shiftSchedule) {
            shiftSchedule.scheduleData = schedules;
            const loadedEmployee = shiftSchedule.employees?.find(emp => String(emp.id) === employeeKey);
            if (loadedEmployee) loadedEmployee.shift = shiftName;
            if (`${shiftSchedule.currentYear}-${shiftSchedule.currentMonth}` === key) {
                shiftSchedule.renderTable();
                shiftSchedule.updateSummary();
            }
        }

        try {
            await api.saveSetting(`shift_schedule_${key}`, JSON.stringify(schedules[key]));
        } catch (error) {
            console.error('Error syncing employee shift to calendar:', error);
            toast.warning('Data karyawan tersimpan, tetapi sinkron jadwal kalender belum berhasil.');
        }
    },

    formatEmployeeId(id) {
        const rawId = String(id || '').trim();
        if (/^KRY\d+$/i.test(rawId)) return rawId.toUpperCase();
        if (/^\d+$/.test(rawId)) return `KRY${rawId.padStart(3, '0')}`;
        return rawId || '-';
    },

    getNextEmployeeIdPreview() {
        return this.getSmallestAvailableEmployeeId(this.employees);
    },

    getSmallestAvailableEmployeeId(employees = []) {
        const usedNumbers = new Set();
        employees.forEach(emp => {
            const formatted = this.formatEmployeeId(emp.id);
            const match = formatted.match(/^KRY(\d+)$/i);
            const number = match ? parseInt(match[1], 10) || 0 : 0;
            if (number > 0) usedNumbers.add(number);
        });

        let nextNumber = 1;
        while (usedNumbers.has(nextNumber)) {
            nextNumber += 1;
        }

        return `KRY${String(nextNumber).padStart(3, '0')}`;
    },

    updateDivisionFilterOptions(newDivision) {
        // Update filter dropdown
        const divisionFilter = document.getElementById('division-filter');
        if (divisionFilter) {
            const existingOptions = Array.from(divisionFilter.options).map(opt => opt.value);
            if (!existingOptions.includes(newDivision)) {
                const option = document.createElement('option');
                option.value = newDivision;
                option.textContent = newDivision;
                divisionFilter.appendChild(option);
            }
        }

        this.ensureSelectValue('emp-division', newDivision);
    },

    getRandomColor() {
        const colors = ['3B82F6', '10B981', 'F59E0B', 'EF4444', '8B5CF6', 'EC4899', '06B6D4'];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    viewEmployee(id) {
        const emp = this.employees.find(e => String(e.id) === String(id));
        if (!emp) {
            toast.error('Karyawan tidak ditemukan');
            return;
        }

        const content = `
            <div class="employee-detail-content">
                <div class="employee-detail-hero">
                    <div class="employee-info">
                        <div class="employee-avatar">
                            <img src="${getAvatarUrl(emp)}" alt="${this.escapeAttr(emp.name)}">
                        </div>
                        <div class="employee-details">
                            <span class="employee-name">${this.escapeHtml(emp.name || '-')}</span>
                            <span class="employee-email">${this.escapeHtml(emp.email || '-')}</span>
                        </div>
                    </div>
                    <span class="status-badge ${this.escapeAttr(emp.status || '')}">
                        ${this.getStatusLabel(emp.status)}
                    </span>
                </div>
                <div class="employee-detail-grid">
                    <div class="employee-detail-field">
                        <label>ID Karyawan</label>
                        <p>${this.formatEmployeeId(emp.id)}</p>
                    </div>
                    <div class="employee-detail-field">
                        <label>Divisi</label>
                        <p>${this.escapeHtml(getEmployeeDivision(emp) || '-')}</p>
                    </div>
                    <div class="employee-detail-field">
                        <label>Jabatan</label>
                        <p>${this.escapeHtml(emp.position || '-')}</p>
                    </div>
                    <div class="employee-detail-field">
                        <label>Shift</label>
                        <p>${this.escapeHtml(emp.shift || '-')}</p>
                    </div>
                    <div class="employee-detail-field">
                        <label>Bergabung</label>
                        <p>${this.escapeHtml(this.formatDisplayDate(emp.joinDate || '-'))}</p>
                    </div>
                    <div class="employee-detail-field">
                        <label>Status</label>
                        <p>${this.getStatusLabel(emp.status)}</p>
                    </div>
                </div>
            </div>
        `;

        const actions = [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }
        ];
        actions.modalClass = 'admin-detail-modal employee-detail-modal';

        modal.show('Detail Karyawan', content, actions);
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

    formatDisplayDate(value) {
        if (!value || value === '-') return '-';

        const raw = String(value).trim();
        const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const parsed = isoMatch
            ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
            : new Date(raw);

        if (Number.isNaN(parsed.getTime())) return raw;

        if (typeof dateTime !== 'undefined' && dateTime.formatNumericDate) {
            return dateTime.formatNumericDate(parsed);
        }

        return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
    },

    async editEmployee(id) {
        if (!this.ensureCanManageEmployees()) return;
        await this.refreshShifts();
        const emp = this.employees.find(e => String(e.id) === String(id));
        if (!emp) {
            toast.error('Karyawan tidak ditemukan');
            return;
        }
        this.setModalMode('edit', emp);
    },

    async deleteEmployee(id) {
        if (!this.ensureCanManageEmployees()) return;
        if (!confirm('Apakah Anda yakin ingin menghapus karyawan ini?')) {
            return;
        }

        const removedEmployee = this.employees.find(e => String(e.id) === String(id));
        this.employees = this.employees.filter(e => String(e.id) !== String(id));
        this.renderTable();
        this.renderMobileCards();
        this.updatePaginationInfo();

        try {
            const result = await api.deleteEmployee(id);
            if (!result?.success) {
                throw new Error(result?.error || 'Gagal menghapus karyawan');
            }
            this.renderTable();
            this.renderMobileCards();
            this.updatePaginationInfo();
            toast.success('Karyawan berhasil dihapus');
        } catch (error) {
            if (removedEmployee) {
                this.employees.unshift(removedEmployee);
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            }
            console.error('Error deleting employee:', error);
            toast.error('Gagal menghapus karyawan');
        }
    }
};

// Global init function
window.initEmployees = () => {
    adminEmployees.init();
};

// Expose
window.adminEmployees = adminEmployees;
