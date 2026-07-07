/**
 * Portal Karyawan - Face Recognition & Location
 * Handles fresh photo and high-accuracy geolocation for every attendance action.
 */

const faceRecognition = {
    video: null,
    canvas: null,
    stream: null,
    currentAction: null,
    photoCaptured: false,
    locationVerified: false,
    position: null,
    capturedPhotoData: null,
    locationWatchId: null,
    locationRetryTimer: null,
    locationAccuracyTimer: null,
    locationTimeInterval: null,
    locationStartedAt: 0,
    isConfirming: false,
    isCapturing: false,
    attendanceLocationSettings: null,
    locationRadiusStatus: null,
    desiredAccuracyMeters: 50,
    maxAcceptableAccuracyMeters: 150,
    locationMaxWaitMs: 15000,
    maxCaptureDimension: 440,
    minCaptureDimension: 220,
    maxPhotoDataLength: 42000,
    capturePreviewObjectFit: 'cover',
    shouldUnmirrorFrontCamera: true,

    init(action) {
        this.cleanup();
        this.resetView();

        this.currentAction = action;
        this.photoCaptured = false;
        this.locationVerified = false;
        this.position = null;
        this.capturedPhotoData = null;
        this.isConfirming = false;
        this.isCapturing = false;
        this.attendanceLocationSettings = null;
        this.locationRadiusStatus = null;
        this.locationStartedAt = Date.now();

        this.updateActionTitle(action);
        this.bindButtons();
        this.startLocationClock();
        this.loadAttendanceLocationSettings();
        this.initCamera();
        this.initLocation();
    },

    resetView() {
        const preview = document.getElementById('camera-preview');
        if (preview) preview.innerHTML = this.getCameraMarkup();

        const captureBtn = document.getElementById('btn-capture');
        const retakeBtn = document.getElementById('btn-retake');
        const confirmBtn = document.getElementById('btn-confirm-attendance');
        const statusEl = document.getElementById('location-status');
        const infoEl = document.getElementById('location-info');
        const mapEl = document.getElementById('location-map');

        if (captureBtn) {
            captureBtn.style.display = 'flex';
            captureBtn.disabled = true;
        }
        if (retakeBtn) retakeBtn.style.display = 'none';
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>Konfirmasi Absensi</span>';
        }
        if (statusEl) {
            statusEl.className = 'location-status';
            statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendeteksi...';
        }
        if (infoEl) infoEl.style.display = 'none';
        if (mapEl) {
            mapEl.innerHTML = `
                <div class="map-placeholder">
                    <i class="fas fa-map-marker-alt"></i>
                    <p>Meminta akses lokasi...</p>
                </div>
            `;
        }
    },

    getCameraMarkup() {
        return `
            <video id="camera-video" autoplay playsinline muted></video>
            <canvas id="camera-canvas" style="display: none;"></canvas>
            <div class="face-overlay" id="face-overlay">
                <div class="face-frame">
                    <div class="face-corner top-left"></div>
                    <div class="face-corner top-right"></div>
                    <div class="face-corner bottom-left"></div>
                    <div class="face-corner bottom-right"></div>
                </div>
                <div class="face-guide">
                    <i class="fas fa-user"></i>
                    <p>Posisikan wajah di dalam frame</p>
                </div>
            </div>
            <div class="scanning-line" id="scanning-line" style="display: none;"></div>
            <div class="verification-status" id="verification-status">
                <div class="status-icon"><i class="fas fa-check"></i></div>
                <p>Foto Berhasil Diambil</p>
            </div>
        `;
    },

    updateActionTitle(action) {
        const titles = {
            'clock-in': { title: 'Masuk - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk Masuk' },
            'clock-out': { title: 'Pulang - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk Pulang' },
            'break': { title: 'Istirahat - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk mulai istirahat' },
            'after-break': { title: 'Selesai Istirahat - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk kembali bekerja' },
            'break-2': { title: 'Istirahat 2 - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk mulai istirahat sesi 2' },
            'after-break-2': { title: 'Selesai Istirahat 2 - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk kembali bekerja dari istirahat sesi 2' },
            'overtime': { title: 'Lembur - Ambil Foto Absensi', subtitle: 'Ambil foto absensi Anda untuk mulai lembur' },
            'izin': { title: 'Pengajuan Izin - Ambil Foto Absensi', subtitle: 'Ambil foto untuk pengajuan izin' }
        };

        const titleEl = document.getElementById('face-rec-title');
        const subtitleEl = document.getElementById('face-rec-subtitle');
        const data = titles[action] || titles['clock-in'];

        if (titleEl) titleEl.textContent = data.title;
        if (subtitleEl) subtitleEl.textContent = data.subtitle;
    },

    async initCamera() {
        this.video = document.getElementById('camera-video');
        this.canvas = document.getElementById('camera-canvas');
        if (!this.video || !navigator.mediaDevices?.getUserMedia) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            this.video.onloadedmetadata = async () => {
                try {
                    await this.video.play();
                } catch (e) { }

                const captureBtn = document.getElementById('btn-capture');
                if (captureBtn) captureBtn.disabled = false;
            };
        } catch (error) {
            console.error('Camera error:', error);
            toast.error('Tidak dapat mengakses kamera. Pastikan izin kamera aktif.');
            const captureBtn = document.getElementById('btn-capture');
            if (captureBtn) captureBtn.disabled = true;
        }
    },

    initLocation() {
        if (!navigator.geolocation) {
            toast.error('Browser Anda tidak mendukung geolokasi');
            return;
        }

        this.setLocationLoading();
        this.requestCurrentLocation();

        try {
            this.locationWatchId = navigator.geolocation.watchPosition(
                (position) => this.handleLocationSuccess(position),
                (error) => this.handleLocationError(error),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        } catch (error) {
            this.handleLocationError(error);
        }
    },

    requestCurrentLocation() {
        navigator.geolocation.getCurrentPosition(
            (position) => this.handleLocationSuccess(position),
            (error) => this.handleLocationError(error),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    },

    async loadAttendanceLocationSettings() {
        if (!this.requiresAttendanceRadius()) {
            this.attendanceLocationSettings = { enabled: false, configured: true };
            return;
        }

        try {
            if (window.api?.clearRequestCacheForActions) {
                api.clearRequestCacheForActions(['getSettings', 'batch']);
            }
            const result = await api.getSettings();
            const data = result?.data || storage.get('app_settings', {}) || {};
            storage.set('app_settings', { ...storage.get('app_settings', {}), ...data });
            this.attendanceLocationSettings = this.normalizeAttendanceLocationSettings(data);
            if (this.position) {
                this.locationRadiusStatus = this.getLocationRadiusStatus(this.position);
                this.renderLocation(this.position, this.locationVerified);
                this.checkCanSubmit();
            }
        } catch (error) {
            console.error('Error loading attendance location settings:', error);
            this.attendanceLocationSettings = this.normalizeAttendanceLocationSettings(storage.get('app_settings', {}) || {});
        }
    },

    normalizeAttendanceLocationSettings(data = {}) {
        const enabled = String(data.attendance_location_enabled || 'true') !== 'false';
        const latitude = Number(data.attendance_location_latitude);
        const longitude = Number(data.attendance_location_longitude);
        const radius = Math.min(1000, Math.max(10, Number(data.attendance_location_radius || 100) || 100));
        const configured = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
            && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

        return { enabled, latitude, longitude, radius, configured };
    },

    requiresAttendanceRadius() {
        return this.currentAction !== 'izin';
    },

    calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        const earthRadiusMeters = 6371000;
        const toRadians = value => Number(value) * Math.PI / 180;
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadiusMeters * c;
    },

    getLocationRadiusStatus(position) {
        if (!this.requiresAttendanceRadius()) {
            return { allowed: true, enabled: false, configured: true, message: 'Lokasi terverifikasi akurat' };
        }

        const settings = this.attendanceLocationSettings || this.normalizeAttendanceLocationSettings(storage.get('app_settings', {}) || {});
        this.attendanceLocationSettings = settings;

        if (!settings.enabled) {
            return { allowed: true, enabled: false, configured: true, message: 'Validasi radius nonaktif' };
        }

        if (!settings.configured) {
            return {
                allowed: false,
                enabled: true,
                configured: false,
                radius: settings.radius,
                message: 'Lokasi absensi belum diatur admin'
            };
        }

        const distance = this.calculateDistanceMeters(
            Number(position.coords.latitude),
            Number(position.coords.longitude),
            settings.latitude,
            settings.longitude
        );
        const roundedDistance = Math.round(distance);
        const allowed = distance <= settings.radius;

        return {
            allowed,
            enabled: true,
            configured: true,
            distance,
            radius: settings.radius,
            officeLatitude: settings.latitude,
            officeLongitude: settings.longitude,
            message: allowed
                ? `Dalam radius absensi (${roundedDistance}m dari kantor, batas ${settings.radius}m)`
                : `Di luar radius absensi. Jarak Anda ${roundedDistance}m dari kantor, batas ${settings.radius}m.`
        };
    },

    refreshLocation() {
        if (this.isConfirming) return;

        this.locationVerified = false;
        this.position = null;
        this.locationStartedAt = Date.now();
        clearTimeout(this.locationRetryTimer);
        clearTimeout(this.locationAccuracyTimer);

        if (this.locationWatchId !== null) {
            navigator.geolocation.clearWatch(this.locationWatchId);
            this.locationWatchId = null;
        }

        this.setLocationLoading('Memperbarui lokasi...');
        this.checkCanSubmit();
        this.requestCurrentLocation();

        try {
            this.locationWatchId = navigator.geolocation.watchPosition(
                (position) => this.handleLocationSuccess(position),
                (error) => this.handleLocationError(error),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        } catch (error) {
            this.handleLocationError(error);
        }
    },

    handleLocationSuccess(position) {
        if (!position?.coords) return;

        const currentAccuracy = Number(position.coords.accuracy || Infinity);
        const bestAccuracy = Number(this.position?.coords?.accuracy || Infinity);
        if (!this.position || currentAccuracy <= bestAccuracy) {
            this.position = position;
        }

        const accuracy = Number(this.position.coords.accuracy || Infinity);
        const waitedLongEnough = (Date.now() - this.locationStartedAt) >= this.locationMaxWaitMs;
        const accuracyReady = accuracy <= this.maxAcceptableAccuracyMeters || waitedLongEnough;
        this.locationRadiusStatus = this.getLocationRadiusStatus(this.position);
        this.locationVerified = accuracyReady && this.locationRadiusStatus.allowed;

        this.renderLocation(this.position, this.locationVerified);
        this.checkCanSubmit();

        if (!this.locationVerified) {
            clearTimeout(this.locationAccuracyTimer);
            const remainingWait = Math.max(1000, this.locationMaxWaitMs - (Date.now() - this.locationStartedAt));
            this.locationAccuracyTimer = setTimeout(() => {
                if (this.position && !this.locationVerified) {
                    this.locationRadiusStatus = this.getLocationRadiusStatus(this.position);
                    this.locationVerified = this.locationRadiusStatus.allowed;
                    this.renderLocation(this.position, this.locationVerified);
                    this.checkCanSubmit();
                }
            }, remainingWait);
        }

        if (accuracy <= this.desiredAccuracyMeters && this.locationWatchId !== null) {
            navigator.geolocation.clearWatch(this.locationWatchId);
            this.locationWatchId = null;
        }
    },

    handleLocationError(error) {
        console.error('Location error:', error);
        this.locationVerified = false;
        this.position = null;
        this.renderLocationError(error);
        this.checkCanSubmit();

        clearTimeout(this.locationRetryTimer);
        this.locationRetryTimer = setTimeout(() => {
            if (this.currentAction && !document.hidden) {
                this.setLocationLoading('Mencoba ulang lokasi...');
                this.requestCurrentLocation();
            }
        }, 3000);
    },

    setLocationLoading(text = 'Mendeteksi...') {
        const statusEl = document.getElementById('location-status');
        if (statusEl) {
            statusEl.className = 'location-status';
            statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
        }
    },

    updateLocationTime() {
        const timeEl = document.getElementById('location-time');
        if (timeEl) timeEl.textContent = dateTime.getCurrentTime();
    },

    startLocationClock() {
        this.stopLocationClock();
        this.updateLocationTime();
        this.locationTimeInterval = setInterval(() => this.updateLocationTime(), 1000);
    },

    stopLocationClock() {
        if (this.locationTimeInterval) {
            clearInterval(this.locationTimeInterval);
            this.locationTimeInterval = null;
        }
    },

    renderLocation(position, isReady) {
        const statusEl = document.getElementById('location-status');
        const infoEl = document.getElementById('location-info');
        const mapEl = document.getElementById('location-map');
        const accuracy = Math.round(Number(position.coords.accuracy || 0));
        const isPrecise = accuracy <= this.desiredAccuracyMeters;
        const radiusStatus = this.getLocationRadiusStatus(position);
        this.locationRadiusStatus = radiusStatus;

        if (statusEl) {
            statusEl.className = `location-status ${isReady ? 'verified' : ''}`;
            statusEl.innerHTML = isReady
                ? '<i class="fas fa-check-circle"></i> Terverifikasi'
                : radiusStatus.allowed
                    ? '<i class="fas fa-spinner fa-spin"></i> Memperbaiki akurasi...'
                    : '<i class="fas fa-exclamation-circle"></i> Lokasi ditolak';
        }

        if (infoEl) {
            infoEl.style.display = 'block';
            const coordsEl = document.getElementById('location-coords');
            const addressEl = document.getElementById('location-address');
            const timeEl = document.getElementById('location-time');
            const accuracyEl = document.getElementById('location-accuracy');

            if (coordsEl) coordsEl.textContent = `${position.coords.latitude.toFixed(7)}, ${position.coords.longitude.toFixed(7)}`;
            if (addressEl) {
                addressEl.textContent = radiusStatus.allowed
                    ? (isReady ? radiusStatus.message : 'Lokasi terdeteksi, menunggu GPS lebih akurat')
                    : radiusStatus.message;
                addressEl.classList.toggle('location-ready', isReady);
            }
            if (timeEl) this.updateLocationTime();
            if (accuracyEl) accuracyEl.textContent = `+/-${accuracy}m`;
        }

        if (mapEl) {
            mapEl.classList.remove('location-map--empty');
            const lat = Number(position.coords.latitude);
            const lng = Number(position.coords.longitude);
            const satelliteMapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=18&t=k&output=embed`;
            mapEl.innerHTML = `
                <div class="map-container">
                    <div class="map-static-fallback" aria-hidden="true">
                        <div class="map-fallback-road road-a"></div>
                        <div class="map-fallback-road road-b"></div>
                        <div class="map-fallback-block block-a"></div>
                        <div class="map-fallback-block block-b"></div>
                    </div>
                    <iframe
                        class="map-satellite-frame"
                        title="Peta satelit lokasi absensi"
                        src="${satelliteMapUrl}"
                        loading="lazy"
                        allow="fullscreen"
                        allowfullscreen
                        referrerpolicy="no-referrer-when-downgrade"
                    ></iframe>
                    <div class="map-note">
                        <i class="fas fa-crosshairs"></i>
                        ${radiusStatus.allowed ? (isPrecise ? 'Titik perangkat terdeteksi' : 'Mencari titik GPS terbaik') : radiusStatus.message}
                    </div>
                </div>
            `;
        }
    },

    renderLocationError(error) {
        const statusEl = document.getElementById('location-status');
        const infoEl = document.getElementById('location-info');
        const mapEl = document.getElementById('location-map');
        const denied = error?.code === 1;

        if (statusEl) {
            statusEl.className = 'location-status';
            statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${denied ? 'Aktifkan izin lokasi' : 'Lokasi belum terdeteksi'}`;
        }
        if (infoEl) infoEl.style.display = 'none';
        if (mapEl) {
            mapEl.classList.add('location-map--empty');
            mapEl.innerHTML = `
                <div class="map-placeholder">
                    <i class="fas fa-location-crosshairs"></i>
                    <p>${denied ? 'Nyalakan location lalu tetap di halaman ini.' : 'Mencoba ulang otomatis...'}</p>
                </div>
            `;
        }
    },

    bindButtons() {
        const captureBtn = document.getElementById('btn-capture');
        const retakeBtn = document.getElementById('btn-retake');
        const confirmBtn = document.getElementById('btn-confirm-attendance');
        const refreshLocationBtn = document.getElementById('btn-refresh-location');

        if (captureBtn) {
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);
            newCaptureBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.capturePhoto();
            });
            newCaptureBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.capturePhoto();
            }, { passive: false });
        }

        if (retakeBtn) {
            const newRetakeBtn = retakeBtn.cloneNode(true);
            retakeBtn.parentNode.replaceChild(newRetakeBtn, retakeBtn);
            newRetakeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.retakePhoto();
            });
        }

        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            newConfirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.confirmAttendance();
            });
        }

        if (refreshLocationBtn) {
            const newRefreshBtn = refreshLocationBtn.cloneNode(true);
            refreshLocationBtn.parentNode.replaceChild(newRefreshBtn, refreshLocationBtn);
            newRefreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.refreshLocation();
            });
            newRefreshBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.refreshLocation();
            }, { passive: false });
        }
    },

    capturePhoto() {
        if (!this.video || !this.canvas || this.photoCaptured || this.isCapturing) return;
        if (!this.video.videoWidth || !this.video.videoHeight) {
            toast.warning('Kamera belum siap. Coba beberapa detik lagi.');
            return;
        }

        this.isCapturing = true;
        const captureBtn = document.getElementById('btn-capture');
        if (captureBtn) captureBtn.disabled = true;

        const ctx = this.canvas.getContext('2d');
        const scale = Math.min(1, this.maxCaptureDimension / Math.max(this.video.videoWidth, this.video.videoHeight));
        this.canvas.width = Math.max(1, Math.round(this.video.videoWidth * scale));
        this.canvas.height = Math.max(1, Math.round(this.video.videoHeight * scale));
        this.drawVideoFrameToCanvas(ctx, this.canvas.width, this.canvas.height);

        const scanningLine = document.getElementById('scanning-line');
        if (scanningLine) scanningLine.style.display = 'block';

        setTimeout(() => {
            if (scanningLine) scanningLine.style.display = 'none';

            this.capturedPhotoData = this.compressCanvasPhoto();
            this.photoCaptured = true;
            this.isCapturing = false;
            this.stopCamera();

            const preview = document.getElementById('camera-preview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${this.capturedPhotoData}" class="captured-photo" alt="Foto verifikasi" style="object-fit: ${this.capturePreviewObjectFit};">
                    <div class="verification-status show" id="verification-status">
                        <div class="status-icon"><i class="fas fa-check"></i></div>
                        <p>Foto Berhasil Diambil</p>
                    </div>
                `;
            }

            const currentCaptureBtn = document.getElementById('btn-capture');
            const retakeBtn = document.getElementById('btn-retake');
            if (currentCaptureBtn) currentCaptureBtn.style.display = 'none';
            if (retakeBtn) retakeBtn.style.display = 'flex';

            this.checkCanSubmit();
        }, 700);
    },

    compressCanvasPhoto() {
        let quality = 0.72;
        let photo = this.canvas.toDataURL('image/jpeg', quality);

        while (photo.length > this.maxPhotoDataLength && quality > 0.38) {
            quality -= 0.08;
            photo = this.canvas.toDataURL('image/jpeg', quality);
        }

        while (photo.length > this.maxPhotoDataLength && Math.max(this.canvas.width, this.canvas.height) > this.minCaptureDimension) {
            const source = document.createElement('canvas');
            source.width = this.canvas.width;
            source.height = this.canvas.height;
            source.getContext('2d').drawImage(this.canvas, 0, 0);

            const nextWidth = Math.max(1, Math.round(this.canvas.width * 0.84));
            const nextHeight = Math.max(1, Math.round(this.canvas.height * 0.84));
            this.canvas.width = nextWidth;
            this.canvas.height = nextHeight;

            const ctx = this.canvas.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(source, 0, 0, nextWidth, nextHeight);
            quality = Math.max(0.36, quality);
            photo = this.canvas.toDataURL('image/jpeg', quality);
        }

        return photo;
    },

    drawVideoFrameToCanvas(ctx, width, height) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);

        if (this.shouldUnmirrorFrontCamera) {
            ctx.save();
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(this.video, 0, 0, width, height);
            ctx.restore();
            return;
        }

        ctx.drawImage(this.video, 0, 0, width, height);
    },

    retakePhoto() {
        this.photoCaptured = false;
        this.isCapturing = false;
        this.capturedPhotoData = null;
        this.stopCamera();

        const preview = document.getElementById('camera-preview');
        if (preview) preview.innerHTML = this.getCameraMarkup();

        const captureBtn = document.getElementById('btn-capture');
        const retakeBtn = document.getElementById('btn-retake');
        if (captureBtn) {
            captureBtn.style.display = 'flex';
            captureBtn.disabled = true;
        }
        if (retakeBtn) retakeBtn.style.display = 'none';

        this.bindButtons();
        this.initCamera();
        this.checkCanSubmit();
    },

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    },

    checkCanSubmit() {
        const confirmBtn = document.getElementById('btn-confirm-attendance');
        if (confirmBtn) confirmBtn.disabled = !(this.photoCaptured && this.locationVerified) || this.isConfirming;
    },

    confirmAttendance() {
        if (this.isConfirming) return;

        if (!this.photoCaptured || !this.locationVerified || !this.position) {
            toast.error('Harap ambil foto absensi dan lokasi terlebih dahulu!');
            return;
        }

        this.isConfirming = true;
        this.checkCanSubmit();

        const confirmBtn = document.getElementById('btn-confirm-attendance');
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Menyimpan...</span>';
        }

        const attendanceData = {
            action: this.currentAction,
            timestamp: new Date().toISOString(),
            location: {
                latitude: this.position.coords.latitude,
                longitude: this.position.coords.longitude,
                accuracy: this.position.coords.accuracy,
                altitude: this.position.coords.altitude || '',
                heading: this.position.coords.heading || '',
                speed: this.position.coords.speed || '',
                distanceFromOffice: this.locationRadiusStatus?.distance !== undefined ? Math.round(this.locationRadiusStatus.distance) : '',
                allowedRadius: this.locationRadiusStatus?.radius || '',
                withinAttendanceRadius: this.locationRadiusStatus?.allowed !== false,
                officeLatitude: this.locationRadiusStatus?.officeLatitude || '',
                officeLongitude: this.locationRadiusStatus?.officeLongitude || ''
            },
            photo: this.capturedPhotoData
        };

        storage.set('temp_attendance', attendanceData);
        toast.success('Verifikasi berhasil!');
        this.cleanup();

        if (this.currentAction === 'izin') {
            router.navigate('izin');
            if (window.izin) {
                window.izin.submitWithVerification(attendanceData).catch(error => {
                    console.error('Processing error:', error);
                    toast.error(error.message || 'Terjadi kesalahan saat memproses data.');
                });
            }
            return;
        }

        router.navigate('absensi');
        if (window.absensi) {
            window.absensi.processWithVerification(this.currentAction, attendanceData).catch(error => {
                console.error('Processing error:', error);
                toast.error(error.message || 'Terjadi kesalahan saat memproses data.');
            });
        }
    },

    cleanup() {
        this.stopCamera();
        clearTimeout(this.locationRetryTimer);
        clearTimeout(this.locationAccuracyTimer);
        this.stopLocationClock();
        this.locationRetryTimer = null;
        this.locationAccuracyTimer = null;

        if (this.locationWatchId !== null) {
            navigator.geolocation.clearWatch(this.locationWatchId);
            this.locationWatchId = null;
        }
    }
};

window.initFaceRecognition = (action) => {
    faceRecognition.init(action);
};

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        faceRecognition.cleanup();
    } else if (router?.currentPage === 'face-recognition' && faceRecognition.currentAction) {
        faceRecognition.init(faceRecognition.currentAction);
    }
});

window.addEventListener('settingsUpdated', (event) => {
    if (router?.currentPage !== 'face-recognition' || !faceRecognition.currentAction) return;
    const section = event?.detail?.section || '';
    if (section && section !== 'system') return;
    faceRecognition.loadAttendanceLocationSettings();
});

window.faceRecognition = faceRecognition;
