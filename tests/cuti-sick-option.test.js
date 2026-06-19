const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cutiJs = fs.readFileSync(path.join(root, 'js', 'cuti.js'), 'utf8');

const leaveSelectStart = indexHtml.indexOf('<select id="leave-type"');
const leaveSelectEnd = indexHtml.indexOf('</select>', leaveSelectStart);
const leaveSelectHtml = indexHtml.slice(leaveSelectStart, leaveSelectEnd);

assert(leaveSelectStart !== -1 && leaveSelectEnd !== -1, 'leave type select should exist');
assert(!leaveSelectHtml.includes('value="sick"'), 'employee leave form should not show Cuti Sakit option');
assert(!leaveSelectHtml.includes('Cuti Sakit'), 'employee leave form should not show Cuti Sakit label');
assert(
    cutiJs.includes("if (type.value === 'sick')") &&
    cutiJs.includes('Cuti sakit diajukan melalui menu Izin / Sakit.'),
    'manual sick leave submissions should be rejected and redirected to Izin / Sakit'
);

console.log('cuti sick option tests passed');
