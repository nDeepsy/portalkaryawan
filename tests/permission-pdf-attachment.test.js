const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const izinJs = fs.readFileSync(path.join(root, 'js', 'izin.js'), 'utf8');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const permissionJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Permission.js'), 'utf8');
const databaseJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Database.js'), 'utf8');
const codeJs = fs.readFileSync(path.join(repoRoot, 'apps-script-absensi', 'Code.js'), 'utf8');

assert(
    izinJs.includes("file.type === 'application/pdf'") &&
    izinJs.includes('readFileAsDataUrl(file)') &&
    izinJs.includes('15 * 1024 * 1024'),
    'permission form should send PDF attachment data to the backend and allow PDFs up to 15MB'
);

assert(
    izinJs.includes('resetIzinForm()') &&
    izinJs.includes('setDefaultIzinDate()') &&
    indexHtml.includes('id="izin-date"') &&
    indexHtml.includes('readonly'),
    'permission date should stay automatic and the form should reset only after a successful submit'
);

assert(
    adminReportsJs.includes('attachmentUrl') &&
    adminReportsJs.includes('attachmentStorage') &&
    adminReportsJs.includes('Buka PDF') &&
    adminReportsJs.includes('viewDocument(documentUrl') &&
    adminReportsJs.includes('createPdfObjectUrl') &&
    adminReportsJs.includes("new Blob([bytes], { type: 'application/pdf' })") &&
    adminReportsJs.includes('api.getIzinAttachment'),
    'admin and owner leave detail should open PDF attachments from Drive or Sheet fallback using a stable PDF Blob URL'
);

assert(
    permissionJs.includes('saveIzinAttachmentToDrive') &&
    permissionJs.includes('DriveApp.createFile') &&
    permissionJs.includes('authorizeDriveForIzinPdf') &&
    permissionJs.includes('isDriveAuthorizationError') &&
    permissionJs.includes('getBase64ByteSize') &&
    permissionJs.includes('File PDF terlalu besar. Maksimum 15MB.') &&
    permissionJs.includes('attachmentUrl') &&
    permissionJs.includes('attachmentFileId') &&
    permissionJs.includes('saveIzinAttachmentToSheet') &&
    permissionJs.includes('getIzinAttachmentData') &&
    permissionJs.includes('attachmentError') &&
    permissionJs.includes('blockSubmit: true'),
    'Apps Script should store PDF attachments in Drive or Sheet fallback and keep metadata in the Izin sheet'
);

assert(
    databaseJs.includes('attachmentUrl') &&
    databaseJs.includes('attachmentFileId') &&
    databaseJs.includes('attachmentStorage') &&
    databaseJs.includes('attachmentError') &&
    databaseJs.includes('IzinAttachments'),
    'Izin sheet schema should include PDF attachment URL and fallback storage columns'
);

assert(
    codeJs.includes("case 'getIzinAttachment'") &&
    codeJs.includes("case 'checkIzinDriveAccess'") &&
    permissionJs.includes('checkIzinDriveAccessData'),
    'Apps Script should expose attachment retrieval and a lightweight Drive access check for troubleshooting'
);

console.log('Permission PDF attachment tests passed');
