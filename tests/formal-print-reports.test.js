const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'css', 'admin.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'css', 'mobile.css'), 'utf8');

assert(
    adminReportsJs.includes('prepareFormalPrintReport(type)'),
    'printReport should prepare formal print content before opening the print dialog'
);

assert(
    adminReportsJs.includes('LAPORAN REKAP ABSENSI KARYAWAN') &&
    adminReportsJs.includes('LAPORAN REKAP JURNAL KERJA KARYAWAN') &&
    adminReportsJs.includes('LAPORAN REKAP CUTI DAN IZIN KARYAWAN'),
    'all existing report print types should have formal report titles'
);

assert(
    adminReportsJs.includes('PT MAGTAS RADIO 107.3 FM') &&
    adminReportsJs.includes('Desa Margalaksana, Kp. Tambakbaya RT.11/RW.05') &&
    adminReportsJs.includes('No. Telepon: 082116917610'),
    'formal print header should include final company identity, address, and phone number'
);

assert(
    adminReportsJs.includes('assets/images/logo-magtas.png'),
    'formal print header should use the current company logo asset'
);

assert(
    adminReportsJs.includes('Dibuat oleh,') &&
    adminReportsJs.includes('Admin') &&
    adminReportsJs.includes('Mengetahui,') &&
    adminReportsJs.includes('Pemilik'),
    'formal print footer should include admin and owner signature blocks'
);

assert(
    adminReportsJs.includes('buildPrintInfoRows') &&
    adminReportsJs.includes('Tanggal Cetak') &&
    adminReportsJs.includes('Dicetak Oleh'),
    'formal print should include report metadata such as print date and printed by'
);

assert(
    adminCss.includes('@media print') &&
    adminCss.includes('.print-only') &&
    adminCss.includes('.print-letterhead') &&
    adminCss.includes('.print-signatures'),
    'admin print CSS should style formal print-only header and signatures'
);

assert(
    adminCss.includes('.reports-actions') &&
    adminCss.includes('.reports-filters-card') &&
    adminCss.includes('.reports-table thead tr:first-child th:last-child'),
    'print CSS should hide interactive controls and action columns without changing screen tables'
);

assert(
    mobileCss.includes('.print-only'),
    'mobile print CSS should not conflict with formal print-only elements'
);

console.log('Formal print report tests passed');
