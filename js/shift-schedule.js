/**
 * Portal Karyawan - Shift Schedule
 * Employee shift schedule management for admin
 */

const shiftSchedule = {
    employees: [],
    shifts: [],
    scheduleData: {},
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    filters: {
        division: '',
        search: ''
    },
    eventsBound: false,

    async init() {
        // Check if admin
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses ke halaman ini!');
            router.navigate('dashboard');
            return;
        }

        this.setCurrentMonthYearControls();
        this.bindEvents();
        this.loadCachedData();
        this.populateDivisionFilter();
        this.renderLegend();
        this.updateMonthLabel();
        this.renderTable();
        this.updateSummary();
        this.loadData().then(() => {
            this.populateDivisionFilter();
            this.renderLegend();
            this.updateMonthLabel();
            this.renderTable();
            this.updateSummary();
        }).catch(error => {
            console.error('Error refreshing schedule data:', error);
        });
    },

    loadCachedData() {
        this.employees = storage.get('admin_employees', []);
        this.shifts = storage.get('shifts', []);
        this.scheduleData = storage.get('shift_schedule', {});

        const monthSelect = document.getElementById('schedule-month');
        const yearSelect = document.getElementById('schedule-year');

        if (monthSelect && monthSelect.value !== '') this.currentMonth = parseInt(monthSelect.value, 10);
        if (yearSelect && yearSelect.value !== '') this.currentYear = parseInt(yearSelect.value, 10);

        this.applyDefaultEmployeeShiftsForMonth();
    },

    async loadData() {
        // Load employees and shifts from API
        try {
            const batchResult = await api.batch([
                { key: 'employees', action: 'getEmployees' },
                { key: 'shifts', action: 'getShifts' },
                { key: 'settings', action: 'getSettings' }
            ]);
            const batch = batchResult?.data || {};
            const empResult = batch.employees;
            const shiftResult = batch.shifts;
            const settingsRes = batch.settings;
            this.employees = normalizeEmployeeList(empResult.data || []);
            this.shifts = shiftResult.data || [];
            storage.set('admin_employees', this.employees);
            storage.set('shifts', this.shifts);

            // Extract schedules from global settings string blobs
            const loadedSchedules = {};
            if (settingsRes.success && settingsRes.data) {
                const globalSettings = settingsRes.data;
                storage.set('app_settings', globalSettings);
                Object.keys(globalSettings).forEach(k => {
                    if (k.startsWith('shift_schedule_')) {
                        const monthKey = k.replace('shift_schedule_', '');
                        try {
                            loadedSchedules[monthKey] = JSON.parse(globalSettings[k]);
                        } catch (e) { }
                    }
                });

                if (Object.keys(loadedSchedules).length > 0) {
                    this.scheduleData = loadedSchedules;
                    storage.set('shift_schedule', loadedSchedules);
                } else {
                    this.scheduleData = storage.get('shift_schedule', {});
                }
            }
        } catch (error) {
            console.error('Error loading schedule data:', error);
            this.employees = normalizeEmployeeList(storage.get('admin_employees', []));
            this.shifts = storage.get('shifts', []);
            this.scheduleData = storage.get('shift_schedule', {});
        }

        // Set current month/year from selectors
        const monthSelect = document.getElementById('schedule-month');
        const yearSelect = document.getElementById('schedule-year');

        if (monthSelect && monthSelect.value !== '') this.currentMonth = parseInt(monthSelect.value, 10);
        if (yearSelect && yearSelect.value !== '') this.currentYear = parseInt(yearSelect.value, 10);

        this.applyDefaultEmployeeShiftsForMonth();
    },

    applyDefaultEmployeeShiftsForMonth() {
        const key = `${this.currentYear}-${this.currentMonth}`;
        const daysInMonth = this.getDaysInMonth(this.currentMonth, this.currentYear);
        const workdays = this.getConfiguredWorkdays();
        const dayKeys = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

        if (!this.scheduleData[key]) {
            this.scheduleData[key] = {};
        }

        this.employees.forEach(emp => {
            if (!emp?.id || !emp.shift) return;
            const empId = String(emp.id);
            if (!this.scheduleData[key][empId]) {
                this.scheduleData[key][empId] = {};
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(this.currentYear, this.currentMonth, day);
                const dayKey = dayKeys[date.getDay()];
                const isWorkday = workdays[dayKey] !== false;
                const hasExistingValue = Object.prototype.hasOwnProperty.call(this.scheduleData[key][empId], day);

                if (!isWorkday && (!hasExistingValue || this.scheduleData[key][empId][day] === '')) {
                    this.scheduleData[key][empId][day] = 'Libur';
                } else if (isWorkday && !hasExistingValue) {
                    this.scheduleData[key][empId][day] = emp.shift;
                }
            }
        });

        storage.set('shift_schedule', this.scheduleData);
    },

    getConfiguredWorkdays() {
        const defaults = {
            senin: true,
            selasa: true,
            rabu: true,
            kamis: true,
            jumat: true,
            sabtu: false,
            minggu: false
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

    setCurrentMonthYearControls() {
        const today = new Date();
        this.currentMonth = today.getMonth();
        this.currentYear = today.getFullYear();

        const monthSelect = document.getElementById('schedule-month');
        if (monthSelect) monthSelect.value = String(this.currentMonth);

        const yearSelect = document.getElementById('schedule-year');
        if (yearSelect) {
            const years = [this.currentYear - 1, this.currentYear, this.currentYear + 1];
            yearSelect.innerHTML = years.map(year => `
                <option value="${year}" ${year === this.currentYear ? 'selected' : ''}>${year}</option>
            `).join('');
        }
    },

    updateMonthLabel() {
        const label = document.getElementById('schedule-current-period');
        if (!label) return;
        const date = new Date(this.currentYear, this.currentMonth, 1);
        label.textContent = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    },

    populateDivisionFilter() {
        const divisionFilter = document.getElementById('schedule-division-filter');
        if (!divisionFilter) return;

        const selected = divisionFilter.value;
        const divisions = [...new Set(this.employees.map(getEmployeeDivision).filter(Boolean))].sort();
        divisionFilter.innerHTML = '<option value="">Semua Divisi</option>' + divisions.map(division => `
            <option value="${this.escapeHtml(division)}" ${selected === division ? 'selected' : ''}>${this.escapeHtml(division)}</option>
        `).join('');
    },

    renderLegend() {
        const legend = document.getElementById('shift-legend-items');
        if (!legend) return;
        const icons = ['fa-sun', 'fa-cloud-sun', 'fa-moon', 'fa-clock'];
        const items = this.shifts.map((shift, index) => `
            <span class="legend-item ${this.getShiftClass(shift.name)}" style="--shift-accent:${this.getShiftColor(shift.name, index)}">
                <i class="fas ${icons[index] || 'fa-clock'}"></i> ${this.escapeHtml(shift.name)}
            </span>
        `).join('');
        legend.innerHTML = `${items}<span class="legend-item shift-libur"><i class="fas fa-ban"></i> Libur</span>`;
    },

    bindEvents() {
        this.syncSearchInputValue();

        if (this.eventsBound) return;
        this.eventsBound = true;

        // Month selector
        const monthSelect = document.getElementById('schedule-month');
        if (monthSelect) {
            monthSelect.addEventListener('change', (e) => {
                this.currentMonth = parseInt(e.target.value, 10);
                this.updateMonthLabel();
                this.applyDefaultEmployeeShiftsForMonth();
                this.renderTable();
                this.updateSummary();
            });
        }

        // Year selector
        const yearSelect = document.getElementById('schedule-year');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                this.currentYear = parseInt(e.target.value, 10);
                this.updateMonthLabel();
                this.applyDefaultEmployeeShiftsForMonth();
                this.renderTable();
                this.updateSummary();
            });
        }

        // Division filter
        const divisionFilter = document.getElementById('schedule-division-filter');
        if (divisionFilter) {
            divisionFilter.addEventListener('change', (e) => {
                this.filters.division = e.target.value;
                this.renderTable();
                this.updateSummary();
            });
        }

        // Search filter
        const searchInput = document.getElementById('schedule-employee-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value.toLowerCase();
                this.renderTable();
                this.updateSummary();
            });
        }

        // Save button
        const saveBtn = document.getElementById('btn-save-schedule');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSchedule());
        }

        // Copy from last month button
        const copyBtn = document.getElementById('btn-copy-schedule');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyFromLastMonth());
        }

        const scrollLeftBtn = document.getElementById('shift-scroll-left');
        if (scrollLeftBtn) {
            scrollLeftBtn.addEventListener('click', () => this.scrollCalendar(-1));
        }

        const scrollRightBtn = document.getElementById('shift-scroll-right');
        if (scrollRightBtn) {
            scrollRightBtn.addEventListener('click', () => this.scrollCalendar(1));
        }

        const tableContainer = document.querySelector('.shift-schedule-table-container');
        if (tableContainer) {
            tableContainer.addEventListener('scroll', () => {
                this.updateScrollButtons();
                this.closeShiftPickers();
            });
        }

        document.addEventListener('click', () => {
            this.closeShiftPickers();
        });
    },

    syncSearchInputValue() {
        const searchInput = document.getElementById('schedule-employee-search');
        if (searchInput) {
            searchInput.value = this.filters.search || '';
        }
    },

    scrollCalendar(direction) {
        const tableContainer = document.querySelector('.shift-schedule-table-container');
        if (!tableContainer) return;

        const amount = Math.max(280, Math.floor(tableContainer.clientWidth * 0.65));
        tableContainer.scrollBy({
            left: direction * amount,
            behavior: 'smooth'
        });

        setTimeout(() => this.updateScrollButtons(), 260);
    },

    updateScrollButtons() {
        const tableContainer = document.querySelector('.shift-schedule-table-container');
        const leftBtn = document.getElementById('shift-scroll-left');
        const rightBtn = document.getElementById('shift-scroll-right');
        if (!tableContainer || !leftBtn || !rightBtn) return;

        const maxScroll = tableContainer.scrollWidth - tableContainer.clientWidth;
        leftBtn.disabled = tableContainer.scrollLeft <= 4;
        rightBtn.disabled = tableContainer.scrollLeft >= maxScroll - 4;
    },

    getDaysInMonth(month, year) {
        return new Date(year, month + 1, 0).getDate();
    },

    getDayName(dayIndex) {
        const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        return days[dayIndex];
    },

    isToday(day) {
        const today = new Date();
        return today.getFullYear() === this.currentYear &&
            today.getMonth() === this.currentMonth &&
            today.getDate() === day;
    },

    getIndonesiaRedDateKey(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    },

    getIndonesiaRedDates(year) {
        const holidayDates = {
            2025: [
                '2025-01-01',
                '2025-01-27',
                '2025-01-28',
                '2025-01-29',
                '2025-03-28',
                '2025-03-29',
                '2025-03-31',
                '2025-04-01',
                '2025-04-02',
                '2025-04-03',
                '2025-04-04',
                '2025-04-07',
                '2025-04-18',
                '2025-04-20',
                '2025-05-01',
                '2025-05-12',
                '2025-05-13',
                '2025-05-29',
                '2025-05-30',
                '2025-06-01',
                '2025-06-06',
                '2025-06-09',
                '2025-06-27',
                '2025-08-17',
                '2025-09-05',
                '2025-12-25',
                '2025-12-26'
            ],
            2026: [
                '2026-01-01',
                '2026-01-16',
                '2026-02-16',
                '2026-02-17',
                '2026-03-18',
                '2026-03-19',
                '2026-03-20',
                '2026-03-21',
                '2026-03-22',
                '2026-03-23',
                '2026-03-24',
                '2026-04-03',
                '2026-04-05',
                '2026-05-01',
                '2026-05-14',
                '2026-05-15',
                '2026-05-27',
                '2026-05-28',
                '2026-05-31',
                '2026-06-01',
                '2026-06-16',
                '2026-08-17',
                '2026-08-25',
                '2026-12-24',
                '2026-12-25'
            ],
            2027: [
                '2027-01-01',
                '2027-01-05',
                '2027-02-06',
                '2027-03-09',
                '2027-03-10',
                '2027-03-11',
                '2027-03-26',
                '2027-05-01',
                '2027-05-06',
                '2027-05-17',
                '2027-05-20',
                '2027-06-01',
                '2027-06-06',
                '2027-08-15',
                '2027-08-17',
                '2027-12-25',
                '2027-12-26'
            ]
        };

        return new Set(holidayDates[year] || []);
    },

    isIndonesiaRedDate(day) {
        const key = this.getIndonesiaRedDateKey(this.currentYear, this.currentMonth, day);
        return this.getIndonesiaRedDates(this.currentYear).has(key);
    },

    getShiftClass(shiftName) {
        const normalized = String(shiftName || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        return normalized ? `shift-${normalized}` : '';
    },

    getShiftColor(shiftName, index = 0) {
        const normalized = String(shiftName || '').toLowerCase();
        if (normalized.includes('pagi')) return '#007BFF';
        if (normalized.includes('siang')) return '#3B82F6';
        if (normalized.includes('malam')) return '#6366F1';
        if (normalized.includes('libur')) return '#EF4444';
        const colors = ['#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B'];
        return colors[index % colors.length];
    },

    getShiftIcon(shiftName, index = 0) {
        const normalized = String(shiftName || '').toLowerCase();
        if (normalized.includes('pagi')) return 'fa-sun';
        if (normalized.includes('siang')) return 'fa-cloud-sun';
        if (normalized.includes('malam')) return 'fa-moon';
        if (normalized.includes('libur')) return 'fa-ban';
        const icons = ['fa-clock', 'fa-business-time', 'fa-calendar-day', 'fa-stopwatch', 'fa-briefcase'];
        return icons[Math.max(0, index) % icons.length];
    },

    getFilteredEmployees() {
        return this.employees.filter(emp => {
            const matchDivision = !this.filters.division || getEmployeeDivision(emp) === this.filters.division;
            const matchSearch = !this.filters.search ||
                emp.name.toLowerCase().includes(this.filters.search) ||
                emp.email.toLowerCase().includes(this.filters.search);
            return matchDivision && matchSearch;
        });
    },

    renderTable() {
        const headerRow = document.querySelector('#shift-schedule-table thead tr');
        const tbody = document.getElementById('shift-schedule-body');

        if (!headerRow || !tbody) return;

        document.querySelectorAll('.shift-picker-menu-portal').forEach(menu => menu.remove());

        // Clear existing date headers (keep employee header)
        const existingDateHeaders = headerRow.querySelectorAll('.date-header-col');
        existingDateHeaders.forEach(th => th.remove());

        // Get days in current month
        const daysInMonth = this.getDaysInMonth(this.currentMonth, this.currentYear);

        // Generate date headers
        const redDates = this.getIndonesiaRedDates(this.currentYear);
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(this.currentYear, this.currentMonth, day);
            const dayOfWeek = date.getDay();
            const isRedDate = redDates.has(this.getIndonesiaRedDateKey(this.currentYear, this.currentMonth, day));

            const th = document.createElement('th');
            const isToday = this.isToday(day);
            th.className = `date-header-col ${isRedDate ? 'red-date' : ''} ${isToday ? 'today' : ''}`;
            th.innerHTML = `
                <div class="date-header ${isRedDate ? 'red-date' : ''} ${isToday ? 'today' : ''}">
                    <span class="date-day">${this.getDayName(dayOfWeek)}</span>
                    <span class="date-number">${day}</span>
                    ${isToday ? '<span class="date-today-dot"></span>' : ''}
                </div>
            `;
            headerRow.appendChild(th);
        }

        // Clear tbody
        tbody.innerHTML = '';

        // Get filtered employees
        const filteredEmployees = this.getFilteredEmployees();

        if (filteredEmployees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${daysInMonth + 1}" class="shift-schedule-empty">
                        <i class="fas fa-users-slash"></i>
                        <p>Tidak ada karyawan yang sesuai dengan filter</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Generate employee rows
        const key = `${this.currentYear}-${this.currentMonth}`;
        this.applyDefaultEmployeeShiftsForMonth();
        const monthData = this.scheduleData[key] || {};

        filteredEmployees.forEach(emp => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-employee-id', emp.id);

            // Employee cell (sticky)
            const empCell = document.createElement('td');
            empCell.className = 'sticky-col';
            empCell.innerHTML = `
                <div class="employee-cell">
                    <img src="${getAvatarUrl(emp)}" alt="${emp.name}" class="employee-avatar">
                    <div class="employee-info">
                        <span class="employee-name">${this.escapeHtml(emp.name)}</span>
                        <span class="employee-dept">${this.escapeHtml(getEmployeeDivision(emp) || '-')}</span>
                    </div>
                </div>
            `;
            tr.appendChild(empCell);

            // Shift cells for each day
            for (let day = 1; day <= daysInMonth; day++) {
                const isToday = this.isToday(day);
                const currentShift = monthData[String(emp.id)]?.[day] || monthData[emp.id]?.[day] || '';
                const isConfiguredDayOff = currentShift === 'Libur';

                const td = document.createElement('td');
                td.className = `shift-select-cell ${isToday ? 'today' : ''} ${isConfiguredDayOff ? 'configured-day-off' : ''}`;

                td.appendChild(this.createShiftPicker(emp.id, day, currentShift));
                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        });

        this.updateScrollButtons();
    },

    createShiftPicker(employeeId, day, currentShift) {
        const wrapper = document.createElement('div');
        wrapper.className = 'shift-picker';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `shift-picker-trigger ${this.getShiftClass(currentShift)}`;
        this.applyShiftStyle(button, currentShift);
        button.innerHTML = this.getShiftTriggerHtml(currentShift);

        const menu = document.createElement('div');
        menu.className = 'shift-picker-menu shift-picker-menu-portal';

        const options = [
            { name: '', label: 'Pilih', icon: 'fa-calendar-plus', color: '#64748B' },
            ...this.shifts.map((shift, index) => ({
                name: shift.name,
                label: shift.name,
                icon: this.getShiftIcon(shift.name, index),
                color: this.getShiftColor(shift.name, index)
            })),
            { name: 'Libur', label: 'Libur', icon: 'fa-ban', color: '#EF4444' }
        ];

        menu.innerHTML = options.map(option => `
            <button type="button" class="shift-picker-option ${currentShift === option.name ? 'active' : ''}" data-shift="${this.escapeHtml(option.name)}" style="--shift-accent:${option.color}">
                <i class="fas ${option.icon}"></i>
                <span>${this.escapeHtml(option.label)}</span>
            </button>
        `).join('');

        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = !menu.classList.contains('open');
            this.closeShiftPickers();
            if (willOpen) {
                this.positionShiftMenu(button, menu);
                wrapper.classList.add('open');
                menu.classList.add('open');
            }
        });

        menu.querySelectorAll('.shift-picker-option').forEach(optionButton => {
            optionButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const value = optionButton.dataset.shift || '';
                this.updateShift(employeeId, day, value);
                button.className = `shift-picker-trigger ${this.getShiftClass(value)}`;
                this.applyShiftStyle(button, value);
                button.innerHTML = this.getShiftTriggerHtml(value);
                menu.querySelectorAll('.shift-picker-option').forEach(btn => btn.classList.remove('active'));
                optionButton.classList.add('active');
                wrapper.classList.remove('open');
                menu.classList.remove('open');
                this.updateSummary();
            });
        });

        wrapper.appendChild(button);
        document.body.appendChild(menu);
        return wrapper;
    },

    positionShiftMenu(button, menu) {
        const rect = button.getBoundingClientRect();
        const menuWidth = Math.max(138, menu.offsetWidth || 138);
        const left = Math.min(
            Math.max(8, rect.left + (rect.width / 2) - (menuWidth / 2)),
            window.innerWidth - menuWidth - 8
        );
        const top = rect.bottom + 8;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.minWidth = `${Math.max(138, rect.width + 34)}px`;
    },

    closeShiftPickers() {
        document.querySelectorAll('.shift-picker.open').forEach(item => item.classList.remove('open'));
        document.querySelectorAll('.shift-picker-menu.open').forEach(menu => menu.classList.remove('open'));
    },

    applyShiftStyle(element, shiftName) {
        const index = this.shifts.findIndex(s => s.name === shiftName);
        element.style.setProperty('--shift-accent', this.getShiftColor(shiftName, index));
    },

    getShiftTriggerHtml(shiftName) {
        const index = this.shifts.findIndex(s => s.name === shiftName);
        const label = shiftName || 'Pilih';
        const icon = shiftName ? this.getShiftIcon(shiftName, index) : 'fa-calendar-plus';
        return `<i class="fas ${icon}"></i><span>${this.escapeHtml(label)}</span>`;
    },

    updateShift(employeeId, day, shiftValue) {
        const key = `${this.currentYear}-${this.currentMonth}`;

        if (!this.scheduleData[key]) {
            this.scheduleData[key] = {};
        }
        if (!this.scheduleData[key][employeeId]) {
            this.scheduleData[key][employeeId] = {};
        }

        this.scheduleData[key][employeeId][day] = shiftValue;

        // Auto save to localStorage
        storage.set('shift_schedule', this.scheduleData);
    },

    async saveSchedule() {
        try {
            const saveBtn = document.getElementById('btn-save-schedule');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
            }

            const key = `${this.currentYear}-${this.currentMonth}`;
            const monthData = this.scheduleData[key] || {};

            // Push exact month map configuration to Database API Global Settings
            await api.saveSetting(`shift_schedule_${key}`, JSON.stringify(monthData));

            // Maintain cache locally
            storage.set('shift_schedule', this.scheduleData);

            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Jadwal';
            }
            toast.success('Jadwal shift berhasil disimpan ke Server!');
        } catch (error) {
            console.error('Save error', error);
            const saveBtn = document.getElementById('btn-save-schedule');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan Jadwal';
            }
            toast.error('Gagal menyimpan jadwal ke server!');
        }
    },

    copyFromLastMonth() {
        const lastMonth = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
        const lastYear = this.currentMonth === 0 ? this.currentYear - 1 : this.currentYear;

        const lastKey = `${lastYear}-${lastMonth}`;
        const currentKey = `${this.currentYear}-${this.currentMonth}`;

        if (!this.scheduleData[lastKey]) {
            toast.error('Tidak ada data jadwal di bulan sebelumnya!');
            return;
        }

        if (confirm('Apakah Anda yakin ingin menyalin jadwal dari bulan lalu?')) {
            // Copy data from last month
            this.scheduleData[currentKey] = JSON.parse(JSON.stringify(this.scheduleData[lastKey]));
            storage.set('shift_schedule', this.scheduleData);

            this.renderTable();
            this.updateSummary();
            toast.success('Jadwal bulan lalu berhasil disalin!');
        }
    },

    updateSummary() {
        const key = `${this.currentYear}-${this.currentMonth}`;
        this.applyDefaultEmployeeShiftsForMonth();
        const monthData = this.scheduleData[key] || {};
        const filteredEmployees = this.getFilteredEmployees();
        const counts = {};

        filteredEmployees.forEach(emp => {
            const empData = monthData[emp.id] || {};
            Object.values(empData).forEach(shift => {
                if (!shift) return;
                counts[shift] = (counts[shift] || 0) + 1;
            });
        });

        const summary = document.getElementById('schedule-summary');
        if (!summary) return;

        const shiftItems = this.shifts.map((shift, index) => {
            const icons = ['fa-sun', 'fa-cloud-sun', 'fa-moon', 'fa-clock'];
            const icon = icons[index] || 'fa-clock';
            const color = this.getShiftColor(shift.name, index);
            return `
                <div class="summary-item" style="--summary-accent:${color}">
                    <span class="summary-label"><i class="fas ${icon}"></i> ${this.escapeHtml(shift.name)}</span>
                    <span class="summary-value">${counts[shift.name] || 0}</span>
                </div>
            `;
        }).join('');

        summary.innerHTML = `
            <div class="summary-item total">
                <span class="summary-label">Total Karyawan</span>
                <span class="summary-value" id="summary-total-employees">${filteredEmployees.length}</span>
            </div>
            ${shiftItems}
            <div class="summary-item" style="--summary-accent:#EF4444">
                <span class="summary-label"><i class="fas fa-ban"></i> Libur</span>
                <span class="summary-value shift-libur-count" id="summary-libur">${counts.Libur || 0}</span>
            </div>
        `;
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

// Global init function
window.initShiftSchedule = () => {
    shiftSchedule.init();
};

// Expose shiftSchedule object
window.shiftSchedule = shiftSchedule;
