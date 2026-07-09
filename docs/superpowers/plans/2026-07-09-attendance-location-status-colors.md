# Attendance Location Status Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show green location text when attendance is allowed, red location text when the employee is outside the radius, and neutral text while GPS is pending.

**Architecture:** Derive mutually exclusive ready/rejected classes from the existing `isReady` and `radiusStatus.allowed` values inside `renderLocation()`. Style those classes with existing success and danger tokens. Do not change radius calculation, GPS behavior, or submission logic.

**Tech Stack:** JavaScript, CSS, Node.js assertion tests.

---

## File Structure

- Modify `tests/absensi-responsive-update.test.js`: source-level regression contract for green, red, and neutral state classes.
- Modify `js/face-recognition.js`: assign mutually exclusive badge and description classes.
- Modify `css/face-rec.css`: style rejected badge and description using the danger token.
- Modify `index.html`: update cache-busting versions for the changed script and stylesheet.

### Task 1: Add Semantic Location Colors

**Files:**
- Modify: `tests/absensi-responsive-update.test.js`
- Modify: `js/face-recognition.js:410-442`
- Modify: `css/face-rec.css:303-318`
- Modify: `css/face-rec.css:551-555`
- Modify: `index.html:21`
- Modify: `index.html:1735`
- Test: `tests/absensi-responsive-update.test.js`

- [ ] **Step 1: Write the failing status-color test**

Add:

```js
function testLocationEligibilityUsesSemanticColors() {
    const faceCss = fs.readFileSync(path.join(root, 'css', 'face-rec.css'), 'utf8');

    assert(
        faceRecognitionJs.includes("statusEl.classList.toggle('rejected', isRejected)"),
        'outside-radius status badge should receive a rejected class'
    );
    assert(
        faceRecognitionJs.includes("addressEl.classList.toggle('location-rejected', isRejected)"),
        'outside-radius location description should receive a rejected class'
    );
    assert(
        faceRecognitionJs.includes("addressEl.classList.toggle('location-ready', isReady)") &&
        faceRecognitionJs.includes('const isRejected = !radiusStatus.allowed'),
        'ready and rejected states should be derived explicitly'
    );
    assert(
        faceCss.includes('.location-status.rejected') &&
        faceCss.includes('.info-value.location-rejected'),
        'rejected badge and description should have dedicated styles'
    );
    assert(
        /\.location-status\.rejected\s*\{[^}]*color:\s*var\(--color-danger\);/s.test(faceCss) &&
        /\.info-value\.location-rejected\s*\{[^}]*color:\s*var\(--color-danger\);/s.test(faceCss),
        'rejected location UI should use the shared danger token'
    );
}
```

Invoke it before the final test runner completes:

```js
testLocationEligibilityUsesSemanticColors();
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
node tests/absensi-responsive-update.test.js
```

Expected: FAIL with `outside-radius status badge should receive a rejected class`.

- [ ] **Step 3: Assign mutually exclusive state classes**

In `renderLocation()`, after assigning `this.locationRadiusStatus`, add:

```js
const isRejected = !radiusStatus.allowed;
```

Replace the status class assignment with:

```js
statusEl.className = 'location-status';
statusEl.classList.toggle('verified', isReady);
statusEl.classList.toggle('rejected', isRejected);
```

Replace the description class update with:

```js
addressEl.classList.toggle('location-ready', isReady);
addressEl.classList.toggle('location-rejected', isRejected);
```

Because `classList.toggle(name, false)` removes the class, pending and changed GPS states cannot retain stale green or red colors.

- [ ] **Step 4: Add danger-token styles**

After `.location-status.verified`:

```css
.location-status.rejected {
    color: var(--color-danger);
}
```

After `.info-value.location-ready`:

```css
.info-value.location-rejected {
    color: var(--color-danger);
    font-weight: 600;
}
```

- [ ] **Step 5: Update cache busting**

Change the stylesheet and script URLs in `index.html`:

```html
<link rel="stylesheet" href="css/face-rec.css?v=20260709-location-status-colors">
```

```html
<script src="js/face-recognition.js?v=20260709-location-status-colors"></script>
```

- [ ] **Step 6: Run focused verification**

```powershell
node tests/absensi-responsive-update.test.js
node tests/attendance-location-radius.test.js
node tests/attendance-settings-live-sync.test.js
node --check js/face-recognition.js
```

Expected:

```text
absensi responsive update tests passed
attendance location radius tests passed
attendance settings live sync tests passed
```

The syntax check exits 0.

- [ ] **Step 7: Commit**

```powershell
git add tests/absensi-responsive-update.test.js js/face-recognition.js css/face-rec.css index.html
git commit -m "feat: color attendance location eligibility"
```

### Task 2: Verify Related Regressions

**Files:**
- Test: `tests/absensi-responsive-update.test.js`
- Test: `tests/attendance-location-radius.test.js`
- Test: `tests/attendance-settings-live-sync.test.js`
- Test: `tests/attendance-backend-frontend-sync.test.js`

- [ ] **Step 1: Run the full related suite**

```powershell
node tests/absensi-responsive-update.test.js
node tests/attendance-location-radius.test.js
node tests/attendance-settings-live-sync.test.js
node tests/attendance-backend-frontend-sync.test.js
node --check js/face-recognition.js
git diff --check main...HEAD
```

Expected: all four test scripts pass, syntax exits 0, and no whitespace errors are reported.

- [ ] **Step 2: Browser verification**

Using a non-production employee session:

1. Open the attendance modal inside the configured radius.
2. Verify pending GPS text remains neutral.
3. Verify fully valid location status and description become green.
4. Test a position outside the radius.
5. Verify `Lokasi ditolak` and the distance/radius description become red.
6. Verify returning inside the radius removes red and restores green once GPS is ready.
7. Verify desktop and mobile layouts remain unchanged.

- [ ] **Step 3: Inspect final scope**

```powershell
git status --short
git diff --stat main...HEAD
```

Expected: clean worktree with only the four frontend files from Task 1 changed by the feature commit.
