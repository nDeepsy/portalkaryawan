# Outside-Radius Attendance Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clearly disable and relabel the attendance confirmation button when the employee's GPS position is outside the admin-configured radius.

**Architecture:** Reuse the existing `locationRadiusStatus` as the single frontend state source. Extend `checkCanSubmit()` to render the confirmation label from that state while preserving the existing photo, GPS accuracy, disabled-radius, unconfigured-location, and submitting flows. Keep Apps Script as the authoritative server-side validator without backend changes.

**Tech Stack:** JavaScript, HTML DOM state, Node.js assertion tests, Google Apps Script regression tests.

---

## File Structure

- `tests/attendance-location-radius.test.js`: regression contract for the outside-radius message, disabled button label, and restoration of the normal label.
- `js/face-recognition.js`: derive the confirmation button state and label from the existing photo, GPS, radius, and submission state.
- `index.html`: update the cache-busting identifier for the changed frontend script.

### Task 1: Define the Outside-Radius Button Contract

**Files:**
- Modify: `tests/attendance-location-radius.test.js`
- Test: `tests/attendance-location-radius.test.js`

- [ ] **Step 1: Add failing assertions**

Extend `testFrontendLocksConfirmationOutsideRadius()` with:

```js
assertContains(
    faceRecognitionJs,
    'Anda berada di luar radius absensi',
    'employee should receive an explicit outside-radius explanation'
);
assertContains(
    faceRecognitionJs,
    '<i class="fas fa-ban"></i><span>Di Luar Radius</span>',
    'confirmation button should explain that attendance is blocked outside radius'
);
assertContains(
    faceRecognitionJs,
    '<i class="fas fa-check-circle"></i><span>Konfirmasi Absensi</span>',
    'confirmation button should restore its normal label when attendance becomes valid'
);
assertContains(
    faceRecognitionJs,
    'radiusStatus.configured && radiusStatus.enabled && radiusStatus.allowed === false',
    'outside-radius button state should not replace unconfigured or disabled-radius behavior'
);
```

- [ ] **Step 2: Run the test and verify RED**

Because the test reads the sibling Apps Script repository, create a temporary junction from the worktree parent before running it:

```powershell
$workspaceRoot = (Resolve-Path '..\..').Path
$junction = Join-Path (Resolve-Path '..').Path 'apps-script-absensi'
$target = Join-Path $workspaceRoot 'apps-script-absensi'
New-Item -ItemType Junction -Path $junction -Target $target | Out-Null
node tests/attendance-location-radius.test.js
```

Expected: FAIL with `employee should receive an explicit outside-radius explanation`.

Remove the verified temporary junction after the test:

```powershell
$expected = Join-Path (Join-Path $workspaceRoot '.worktrees') 'apps-script-absensi'
$item = Get-Item -LiteralPath $junction
if ($item.FullName -ne $expected -or $item.LinkType -ne 'Junction') {
    throw 'Refusing to remove unexpected path'
}
[System.IO.Directory]::Delete($junction)
```

- [ ] **Step 3: Commit the failing test**

```powershell
git add tests/attendance-location-radius.test.js
git commit -m "test: define outside-radius attendance state"
```

### Task 2: Render the Confirmation State

**Files:**
- Modify: `js/face-recognition.js:281-290`
- Modify: `js/face-recognition.js:665-668`
- Modify: `index.html:1734`
- Test: `tests/attendance-location-radius.test.js`

- [ ] **Step 1: Make the location explanation explicit**

Change the outside-radius message in `getLocationRadiusStatus()` to:

```js
message: allowed
    ? `Dalam radius absensi (${roundedDistance}m dari kantor, batas ${settings.radius}m)`
    : `Anda berada di luar radius absensi. Jarak Anda ${roundedDistance}m dari kantor, batas ${settings.radius}m.`
```

- [ ] **Step 2: Derive the button label from radius state**

Replace `checkCanSubmit()` with:

```js
checkCanSubmit() {
    const confirmBtn = document.getElementById('btn-confirm-attendance');
    if (!confirmBtn) return;

    const radiusStatus = this.locationRadiusStatus;
    const isOutsideRadius = Boolean(radiusStatus
        && radiusStatus.configured && radiusStatus.enabled && radiusStatus.allowed === false);

    confirmBtn.disabled = !(this.photoCaptured && this.locationVerified) || this.isConfirming;

    if (this.isConfirming) return;

    confirmBtn.innerHTML = isOutsideRadius
        ? '<i class="fas fa-ban"></i><span>Di Luar Radius</span>'
        : '<i class="fas fa-check-circle"></i><span>Konfirmasi Absensi</span>';
}
```

This method is already called after every relevant GPS, photo, retry, and reset transition. The existing `confirmAttendance()` continues to replace the label with `Menyimpan...` after setting `isConfirming`.

- [ ] **Step 3: Update cache busting**

Change the script URL in `index.html` to:

```html
<script src="js/face-recognition.js?v=20260709-outside-radius-state"></script>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Recreate the temporary junction using the exact commands from Task 1 Step 2, then run:

```powershell
node tests/attendance-location-radius.test.js
```

Expected: `attendance location radius tests passed`.

Remove the verified temporary junction using the exact guarded commands from Task 1 Step 2.

- [ ] **Step 5: Check JavaScript syntax**

```powershell
node --check js/face-recognition.js
```

Expected: exit code 0 with no output.

- [ ] **Step 6: Commit the implementation**

```powershell
git add js/face-recognition.js index.html
git commit -m "feat: explain outside-radius attendance block"
```

### Task 3: Verify Attendance Regressions

**Files:**
- Test: `tests/attendance-location-radius.test.js`
- Test: `tests/attendance-backend-frontend-sync.test.js`
- Test: `tests/absensi-responsive-update.test.js`

- [ ] **Step 1: Run the complete related regression set**

Recreate the temporary Apps Script junction using Task 1 Step 2, then run:

```powershell
node tests/attendance-location-radius.test.js
node tests/attendance-backend-frontend-sync.test.js
node tests/absensi-responsive-update.test.js
node --check js/face-recognition.js
```

Expected:

```text
attendance location radius tests passed
attendance backend/frontend sync tests passed
absensi responsive update tests passed
```

The syntax check exits with code 0 and no output. Remove the verified temporary junction using Task 1 Step 2.

- [ ] **Step 2: Verify the committed scope**

```powershell
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Expected: no whitespace errors, only frontend feature/spec/plan commits on the feature branch, and a clean working tree.

- [ ] **Step 3: Perform browser verification**

With a test admin account and employee account in a non-production environment:

1. Save an office point and radius as admin.
2. Open an attendance action as an employee outside that radius.
3. Verify the photo can still be captured.
4. Verify the status reads `Anda berada di luar radius absensi` with distance and limit.
5. Verify the disabled confirmation button reads `Di Luar Radius`.
6. Move or simulate the employee position inside the radius.
7. Verify the status becomes valid and the button returns to `Konfirmasi Absensi`.
8. Verify confirmation becomes enabled only after both photo and valid location are ready.
9. Verify an outside-radius payload is still rejected by Apps Script.
