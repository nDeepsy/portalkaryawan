const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const databaseJs = fs.readFileSync(path.join(root, 'apps-script-absensi', 'Database.js'), 'utf8');
const permissionJs = fs.readFileSync(path.join(root, 'apps-script-absensi', 'Permission.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'apps-script-absensi', 'Settings.js'), 'utf8');
const backendJs = fs
  .readdirSync(path.join(root, 'apps-script-absensi'))
  .filter(file => file.endsWith('.js'))
  .map(file => fs.readFileSync(path.join(root, 'apps-script-absensi', file), 'utf8'))
  .join('\n');

assert(
  databaseJs.includes('function findFirstEmptySheetRow'),
  'Database.js should provide a helper for the first empty sheet row'
);

assert(
  databaseJs.includes('function findFirstEmptySheetBlock'),
  'Database.js should provide a helper for a contiguous empty sheet block'
);

assert(
  databaseJs.includes('function setRowToFirstEmptySheetRow'),
  'Database.js should provide a helper for array rows such as seeded Users, Shifts, Settings, and Employees'
);

assert(
  /for \(let i = 1; i < data\.length; i\+\+\) \{\s*if \(isSheetDataRowEmpty\(data\[i\]\)\) continue;/s.test(databaseJs),
  'getAllRows should skip manually emptied sheet rows'
);

assert(
  databaseJs.includes('const targetRow = findFirstEmptySheetRow(sheet, row.length);'),
  'addRow should write new records to the first empty row instead of always appending'
);

assert(
  !databaseJs.includes('const targetRow = sheet.getLastRow() + 1;'),
  'addRow should no longer use getLastRow() + 1 as the only target row'
);

assert(
  permissionJs.includes('findFirstEmptySheetBlock(sheet, IZIN_ATTACHMENT_HEADERS.length, chunks.length)'),
  'PDF attachment chunks should use the first empty contiguous block'
);

assert(
  settingsJs.includes('findFirstEmptySheetRow(sheet, 2)'),
  'Settings should add new keys to the first empty row'
);

assert(
  !backendJs.includes('.appendRow('),
  'Backend should avoid appendRow so every table can reuse manually emptied rows'
);

assert(
  !backendJs.includes('getLastRow() + 1'),
  'Backend should avoid direct getLastRow() + 1 writes so every table can fill gaps'
);

console.log('backend sheet gap fill tests passed');
