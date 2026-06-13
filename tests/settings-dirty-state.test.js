const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const absensiJs = fs.readFileSync(path.join(root, 'js', 'absensi.js'), 'utf8');
const jurnalJs = fs.readFileSync(path.join(root, 'js', 'jurnal.js'), 'utf8');
const cutiJs = fs.readFileSync(path.join(root, 'js', 'cuti.js'), 'utf8');
const backendSettingsJs = fs.readFileSync(path.join(root, '..', 'apps-script-absensi', 'Settings.js'), 'utf8');

const initBlock = settingsJs.match(/async init\(\)\s*\{[\s\S]*?\n    \},\n\n    async loadSettings/)?.[0] || '';
assert(
    initBlock.indexOf('this.initForms();') > -1 && initBlock.indexOf('this.initForms();') < initBlock.indexOf('await this.loadSettings();'),
    'settings form listeners should be initialized before awaiting backend settings'
);

assert(
    settingsJs.includes('dirtySections: new Set()'),
    'settings should track dirty sections so pending backend loads cannot overwrite active edits'
);

assert(
    settingsJs.includes("this.markSectionDirty('workdays')"),
    'working day checkbox changes should mark the workdays section dirty'
);

assert(
    /if\s*\(\s*workdays\s*&&\s*this\.canApplySection\('workdays'\)\s*\)/.test(settingsJs),
    'backend/applySettingsToForm should only apply workdays when the section is not dirty'
);

assert(
    settingsJs.includes("this.markSectionDirty('system')"),
    'system setting input changes should mark the system section dirty'
);

assert(
    /if\s*\(\s*allSettings\.late_tolerance[\s\S]*?this\.canApplySection\('system'\)/.test(settingsJs),
    'backend/applySettingsToForm should not overwrite dirty system settings'
);

assert(
    settingsJs.includes("this.clearSectionDirty('workdays')"),
    'saving workdays successfully should clear the dirty marker'
);

assert(
    settingsJs.includes("this.clearSectionDirty('system')"),
    'saving system settings successfully should clear the dirty marker'
);

assert(
    settingsJs.includes("this.markSectionDirty('shifts')"),
    'shift add/edit/delete should mark the shifts section dirty'
);

assert(
    /if\s*\(\s*this\.canApplySection\('shifts'\)\s*\)/.test(settingsJs),
    'loadSettings should not reset shift drafts while shift settings are dirty'
);

assert(
    settingsJs.includes("this.clearSectionDirty('shifts')"),
    'saving shifts successfully should clear the dirty marker'
);

assert(
    backendSettingsJs.includes('const SHIFT_SYNC_DEBUG = false;'),
    'backend shift sync debug logging should be disabled by default'
);

assert(
    backendSettingsJs.includes('function logShiftSyncDebug'),
    'backend shift sync should use a debug logger helper'
);

assert(
    backendSettingsJs.includes("if (String(key) === 'working_days')"),
    'backend should react when working day settings are saved'
);

assert(
    backendSettingsJs.includes('syncCurrentMonthScheduleWithWorkdaysData(value)'),
    'backend should rebuild the current month schedule after working days change'
);

assert(
    backendSettingsJs.includes('function normalizeSettingsSheetHeaders'),
    'backend should normalize Settings headers so saved values are readable on every device'
);

assert(
    backendSettingsJs.includes('function getSettingRowValue'),
    'backend should read Settings values through a helper that supports legacy headers'
);

assert(
    backendSettingsJs.includes("value(key-valuepairs)"),
    'backend should tolerate the existing legacy Settings value header'
);

assert(
    backendSettingsJs.includes('settings[row.key] = getSettingRowValue(row)'),
    'backend getSettingsData should read the normalized/legacy setting value'
);

assert(
    settingsJs.includes('getDefaultWorkdayShift(emp)'),
    'frontend workday sync should choose a real shift instead of reusing Libur as the default shift'
);

assert(
    settingsJs.includes('await this.syncCurrentMonthScheduleWithWorkdays(workdays);'),
    'saving workdays should finish local schedule sync before refreshing open admin/employee views'
);

assert(
    settingsJs.includes("await this.refreshAfterSettingsChange('workdays'") &&
    settingsJs.includes("await this.refreshAfterSettingsChange('system'") &&
    settingsJs.includes("await this.refreshAfterSettingsChange('shifts'") &&
    settingsJs.includes('this.broadcastSettingsUpdated(section, values)'),
    'saving any settings section should broadcast an update event through the shared refresh helper'
);

assert(
    settingsJs.includes('async refreshShiftConsumers()'),
    'refreshing setting consumers should be awaitable'
);

assert(
    absensiJs.includes("addEventListener('settingsUpdated'") &&
    absensiJs.includes('handleSettingsUpdated'),
    'attendance page should react to saved admin settings immediately'
);

assert(
    jurnalJs.includes("addEventListener('settingsUpdated'") &&
    jurnalJs.includes('handleSettingsUpdated'),
    'journal page should react to saved admin workday/shift settings immediately'
);

assert(
    cutiJs.includes("addEventListener('settingsUpdated'") &&
    cutiJs.includes('handleSettingsUpdated'),
    'leave page should react to saved annual leave settings immediately'
);

assert(
    !/console\.log\(\`\[ShiftSync\]/.test(backendSettingsJs) && !/console\.log\('\[ShiftSync\]/.test(backendSettingsJs),
    'backend shift sync should not directly log employee/schedule details'
);

console.log('Settings dirty-state tests passed');
