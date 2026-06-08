const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const authJs = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const adminEmployeesJs = fs.readFileSync(path.join(root, 'js', 'admin-employees.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const backendAuthJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Auth.js'), 'utf8');
const backendEmployeeJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Employee.js'), 'utf8');
const backendDatabaseJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Database.js'), 'utf8');

assert(backendDatabaseJs.includes('mustChangePassword'), 'Employees sheet should include mustChangePassword column');
assert(backendAuthJs.includes('hashPasswordData'), 'backend should hash stored passwords');
assert(backendAuthJs.includes('verifyPasswordData'), 'backend should verify hashed and legacy plaintext passwords');
assert(backendAuthJs.includes('validateNewPasswordData'), 'backend should validate password strength');
assert(backendAuthJs.includes("mustChangePassword: parseBooleanData"), 'login should return mustChangePassword state');
assert(backendAuthJs.includes('migratePasswordHashIfNeededData'), 'legacy plaintext passwords should migrate after successful login/change');
assert(backendAuthJs.includes("mustChangePassword: false"), 'successful password change should clear mustChangePassword');
assert(backendAuthJs.includes('normalizeChangePasswordRoleData'), 'backend password change should use role to avoid Users/Employees id collisions');
assert(backendAuthJs.includes("normalizedRole === 'karyawan'"), 'employee password changes should target Employees directly');
assert(backendAuthJs.includes("normalizedRole === 'admin' || normalizedRole === 'pemilik'"), 'admin and owner password changes should target Users directly');
assert(backendEmployeeJs.includes("data.mustChangePassword = true"), 'new employees should be forced to change the default password');
assert(backendEmployeeJs.includes('sanitizeEmployeeForClientData'), 'employee list should strip password before returning to frontend');
assert(backendEmployeeJs.includes('delete clean.password'), 'employee API should not expose password');

assert(authJs.includes('mustChangePassword'), 'frontend auth should carry mustChangePassword from login response');
assert(authJs.includes('enforcePasswordChange'), 'frontend should enforce first-login password change');
assert(authJs.includes('validateNewPassword'), 'frontend should validate password before sending to backend');
assert(authJs.includes('Password baru minimal 8 karakter'), 'frontend should explain password length requirement');
assert(authJs.includes('Password baru harus mengandung huruf dan angka'), 'frontend should explain letter and number requirement');
assert(authJs.includes('Password baru tidak boleh sama dengan password default'), 'frontend should reject default password');
assert(authJs.includes('Karyawan wajib mengganti password'), 'frontend should block forced-password users from dashboard');
assert(authJs.includes('closeProfileModal()'), 'forced password modal close should be guarded');
assert(indexHtml.includes('onclick="auth.closeProfileModal()"'), 'profile modal close button should use guarded auth close helper');
assert(apiJs.includes('async changePassword(userId, oldPassword, newPassword, userEmail, userRole)'), 'API should send user email and role for password validation');
assert(apiJs.includes('userRole'), 'API should include role when changing password');
assert(adminEmployeesJs.includes("document.getElementById('emp-password').value = ''"), 'edit employee should not show existing password');
assert(adminEmployeesJs.includes('Reset password'), 'admin password field should be reset-only in edit mode');

console.log('password security tests passed');
