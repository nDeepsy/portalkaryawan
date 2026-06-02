const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');

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

console.log('Settings dirty-state tests passed');
