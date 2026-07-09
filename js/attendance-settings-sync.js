const attendanceSettingsSync = {
    refreshIntervalMs: 10000,
    timer: null,
    initialized: false,
    isLoading: false,
    requestSequence: 0,
    appliedSequence: 0,
    lastFingerprint: '',
    locationKeys: [
        'attendance_location_enabled',
        'attendance_location_latitude',
        'attendance_location_longitude',
        'attendance_location_radius'
    ],

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.lastFingerprint = this.fingerprint(
            this.normalize(storage.get('app_settings', {}) || {})
        );

        window.addEventListener('focus', () => this.refresh({ force: true }));
        window.addEventListener('storage', event => this.handleStorageEvent(event));
        window.addEventListener('settingsUpdated', event => this.handleLocalSettingsEvent(event));
        document.addEventListener('visibilitychange', () => this.updateLifecycle());
        document.addEventListener('authReady', () => this.updateLifecycle());
        document.addEventListener('authChanged', () => this.updateLifecycle());

        this.updateLifecycle();
    },

    hasSession() {
        return Boolean(window.auth?.getCurrentUser?.());
    },

    normalize(values = {}) {
        return {
            attendance_location_enabled: String(values.attendance_location_enabled ?? 'true'),
            attendance_location_latitude: String(values.attendance_location_latitude ?? ''),
            attendance_location_longitude: String(values.attendance_location_longitude ?? ''),
            attendance_location_radius: String(values.attendance_location_radius ?? '100')
        };
    },

    fingerprint(values) {
        return this.locationKeys.map(key => `${key}:${values[key]}`).join('|');
    },

    start() {
        if (this.timer || document.hidden || !this.hasSession()) return;
        this.timer = setInterval(() => this.refresh(), this.refreshIntervalMs);
    },

    stop() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    },

    updateLifecycle() {
        if (document.hidden || !this.hasSession()) {
            this.stop();
            return;
        }
        this.start();
        this.refresh({ force: true });
    },

    async refresh(options = {}) {
        if (this.isLoading || !this.hasSession()) return false;
        if (document.hidden && !options.force) return false;

        const sequence = ++this.requestSequence;
        this.isLoading = true;
        try {
            const result = await api.getFreshSettings();
            if (!result?.success || !result.data || sequence < this.appliedSequence) return false;
            return this.apply(result.data, { sequence, source: 'remote-sync', emit: true });
        } catch (error) {
            console.error('Attendance settings sync error:', error);
            return false;
        } finally {
            this.isLoading = false;
        }
    },

    apply(values, options = {}) {
        const normalized = this.normalize(values);
        const nextFingerprint = this.fingerprint(normalized);
        const sequence = Number(options.sequence || ++this.requestSequence);
        if (sequence < this.appliedSequence || nextFingerprint === this.lastFingerprint) return false;

        this.appliedSequence = sequence;
        this.lastFingerprint = nextFingerprint;
        storage.set('app_settings', {
            ...(storage.get('app_settings', {}) || {}),
            ...normalized
        });

        if (options.emit !== false) {
            window.dispatchEvent(new CustomEvent('settingsUpdated', {
                detail: {
                    section: 'system',
                    values: normalized,
                    source: options.source || 'remote-sync'
                }
            }));
        }
        return true;
    },

    handleStorageEvent(event) {
        if (event?.key !== 'app_settings' || !event.newValue) return;
        try {
            this.apply(JSON.parse(event.newValue), { source: 'storage-sync', emit: true });
        } catch (error) {
            console.error('Attendance settings storage sync error:', error);
        }
    },

    handleLocalSettingsEvent(event) {
        if (event?.detail?.source === 'remote-sync' || event?.detail?.source === 'storage-sync') return;
        const section = event?.detail?.section || '';
        if (section && section !== 'system') return;

        const values = event?.detail?.values || storage.get('app_settings', {}) || {};
        this.apply(values, {
            sequence: ++this.requestSequence,
            source: 'local-save',
            emit: false
        });
    }
};

window.attendanceSettingsSync = attendanceSettingsSync;
attendanceSettingsSync.init();
