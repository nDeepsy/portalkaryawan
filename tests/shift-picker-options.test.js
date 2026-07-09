const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'shift-schedule.js'),
    'utf8'
);

const pickerSection = source.slice(
    source.indexOf('createShiftPicker(employeeId, day, currentShift)'),
    source.indexOf('positionShiftMenu(button, menu)')
);

assert(
    !pickerSection.includes("label: 'Pilih'"),
    'dropdown jadwal shift tidak boleh menampilkan opsi Pilih'
);
assert(
    pickerSection.includes("{ name: 'Libur', label: 'Libur'"),
    'dropdown jadwal shift harus tetap menyediakan opsi Libur'
);
assert(
    pickerSection.includes('...this.shifts.map'),
    'dropdown jadwal shift harus tetap menampilkan seluruh shift'
);

console.log('shift picker option tests passed');
