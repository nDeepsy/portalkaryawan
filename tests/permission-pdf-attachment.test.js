const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const izinJs = fs.readFileSync(path.join(root, 'js', 'izin.js'), 'utf8');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const permissionJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Permission.js'), 'utf8');
const databaseJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Database.js'), 'utf8');

assert(
    izinJs.includes("file.type === 'application/pdf'") &&
    izinJs.includes('readFileAsDataUrl(file)'),
    'permission form should send PDF attachment data to the backend'
);

assert(
    adminReportsJs.includes('attachmentUrl') &&
    adminReportsJs.includes('Buka PDF') &&
    adminReportsJs.includes('viewDocument(documentUrl'),
    'admin and owner leave detail should be able to open PDF attachments'
);

assert(
    permissionJs.includes('saveIzinAttachmentToDrive') &&
    permissionJs.includes('DriveApp.createFile') &&
    permissionJs.includes('attachmentUrl') &&
    permissionJs.includes('attachmentFileId'),
    'Apps Script should store PDF attachments in Drive and keep the URL in the sheet'
);

assert(
    databaseJs.includes('attachmentUrl') &&
    databaseJs.includes('attachmentFileId'),
    'Izin sheet schema should include PDF attachment URL columns'
);

console.log('Permission PDF attachment tests passed');
