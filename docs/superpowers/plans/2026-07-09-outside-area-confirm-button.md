# Outside-Area Confirmation Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the disabled attendance confirmation button in red with the professional label `Di Luar Area Absensi` when an employee is outside the configured radius.

**Architecture:** Reuse the existing `isOutsideRadius` state in `checkCanSubmit()`. Toggle one dedicated CSS class on every state update so pending, ready, and submitting states cannot retain stale red styling. Keep all validation and enablement logic unchanged.

**Tech Stack:** JavaScript, CSS, Node.js assertion tests.

---

## File Structure

- Modify `tests/attendance-location-radius.test.js`: button label and class contract.
- Modify `js/face-recognition.js`: toggle the outside-area class and update the label.
- Modify `css/face-rec.css`: disabled red-button presentation.
- Modify `index.html`: cache-busting identifiers.

### Task 1: Add the Red Outside-Area Button

**Files:**
- Modify: `tests/attendance-location-radius.test.js`
- Modify: `js/face-recognition.js:678-693`
- Modify: `css/face-rec.css:570-580`
- Modify: `index.html:21`
- Modify: `index.html:1735`
- Test: `tests/attendance-location-radius.test.js`

- [ ] **Step 1: Write failing assertions**

Replace the old `Di Luar Radius` assertion and add the class/style contract:

```js
assertContains(
    faceRecognitionJs,
    '<i class="fas fa-ban"></i><span>Di Luar Area Absensi</span>',
    'confirmation button should use professional outside-area wording'
);
assertContains(
    faceRecognitionJs,
    "confirmBtn.classList.toggle('outside-radius', isOutsideRadius)",
    'confirmation button should toggle its outside-radius visual state'
);
assert(
    /#btn-confirm-attendance\.outside-radius:disabled\s*\{[^}]*background:\s*var\(--color-danger\);[^}]*color:\s*var\(--color-white\);[^}]*opacity:\s*1;[^}]*cursor:\s*not-allowed;/s.test(faceCss),
    'outside-area confirmation button should remain visibly red while disabled'
);
```

Add this near the test setup:

```js
const faceCss = fs.readFileSync(path.join(root, 'css', 'face-rec.css'), 'utf8');
```

- [ ] **Step 2: Run the test and verify RED**

The test reads the sibling Apps Script repository. In a worktree, create the guarded temporary junction first, then run:

```powershell
node tests/attendance-location-radius.test.js
```

Expected: FAIL with `confirmation button should use professional outside-area wording`.

- [ ] **Step 3: Toggle the visual class and update the copy**

In `checkCanSubmit()`, immediately after calculating `isOutsideRadius`, add:

```js
confirmBtn.classList.toggle('outside-radius', isOutsideRadius);
```

Change the outside-area label to:

```js
'<i class="fas fa-ban"></i><span>Di Luar Area Absensi</span>'
```

The existing call to `classList.toggle` with a Boolean removes the class automatically when GPS is pending, the position returns inside the radius, validation is disabled, or the office is not configured.

- [ ] **Step 4: Add the disabled danger style**

After `.btn-full` in `css/face-rec.css`, add:

```css
#btn-confirm-attendance.outside-radius:disabled {
    background: var(--color-danger);
    border-color: var(--color-danger);
    color: var(--color-white);
    opacity: 1;
    cursor: not-allowed;
    box-shadow: none;
}

#btn-confirm-attendance.outside-radius:disabled:hover,
#btn-confirm-attendance.outside-radius:disabled:active {
    background: var(--color-danger);
    border-color: var(--color-danger);
    color: var(--color-white);
    box-shadow: none;
}
```

- [ ] **Step 5: Update cache busting**

```html
<link rel="stylesheet" href="css/face-rec.css?v=20260709-outside-area-button">
```

```html
<script src="js/face-recognition.js?v=20260709-outside-area-button"></script>
```

- [ ] **Step 6: Run focused verification**

```powershell
node tests/attendance-location-radius.test.js
node tests/absensi-responsive-update.test.js
node tests/attendance-settings-live-sync.test.js
node --check js/face-recognition.js
```

Expected: all three tests pass and the syntax check exits 0.

- [ ] **Step 7: Commit**

```powershell
git add tests/attendance-location-radius.test.js js/face-recognition.js css/face-rec.css index.html
git commit -m "feat: highlight blocked attendance button"
```

### Task 2: Verify and Integrate

**Files:**
- Test: `tests/attendance-location-radius.test.js`
- Test: `tests/absensi-responsive-update.test.js`
- Test: `tests/attendance-settings-live-sync.test.js`
- Test: `tests/attendance-backend-frontend-sync.test.js`

- [ ] **Step 1: Run regressions**

```powershell
node tests/attendance-location-radius.test.js
node tests/absensi-responsive-update.test.js
node tests/attendance-settings-live-sync.test.js
node tests/attendance-backend-frontend-sync.test.js
node --check js/face-recognition.js
git diff --check main...HEAD
```

Expected: all tests pass, syntax exits 0, and no whitespace errors are reported.

- [ ] **Step 2: Browser verification**

In a non-production employee session:

1. Verify pending GPS keeps the normal disabled button style.
2. Verify an outside-radius result changes the button to solid red and `Di Luar Area Absensi`.
3. Verify hover/tap does not imply the red disabled button is interactive.
4. Verify returning inside the radius removes red styling.
5. Verify the ready button returns to its normal primary color and enablement rules.
6. Verify the label fits at mobile width.

- [ ] **Step 3: Merge and final verification**

Merge the feature branch to `main`, rerun the commands from Step 1 in the main checkout, remove the owned worktree, and report that only the frontend repository requires pushing.
