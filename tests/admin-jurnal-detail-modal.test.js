const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adminReportsJs = fs.readFileSync(path.join(root, 'js', 'admin-reports.js'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'css', 'admin.css'), 'utf8');
const modalCss = fs.readFileSync(path.join(root, 'css', 'modal.css'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

function testJournalDetailModalUsesDedicatedClass() {
    assert(
        adminReportsJs.includes("actions.modalClass = 'admin-detail-modal jurnal-detail-modal'"),
        'admin journal detail should pass a dedicated modal class'
    );
}

function testModalWithTutupActionHidesDuplicateCloseButton() {
    assert(
        mainJs.includes('modal-has-close-action'),
        'modal system should mark modals that already have a Tutup action'
    );
    assert(
        /\.modal-has-close-action\s+\.btn-close-modal\s*\{[^}]*display:\s*none;/s.test(modalCss),
        'modals with a Tutup action should hide the duplicate header X button'
    );
}

function testJournalDetailUsesSingleScrollContainer() {
    const detailContentBlock = adminCss.match(/\.jurnal-detail-content\s*\{[\s\S]*?\}/)?.[0] || '';

    assert(
        !/overflow-y:\s*auto/.test(detailContentBlock),
        'journal detail content should not create a nested vertical scroll'
    );
    assert(
        !/max-height:\s*70vh/.test(detailContentBlock),
        'journal detail content should not set its own viewport height limit'
    );
    assert(
        /\.jurnal-detail-modal\s+\.modal-content\s*\{[^}]*overflow-y:\s*auto;/s.test(adminCss),
        'journal detail modal should leave scrolling to the modal content container'
    );
}

function testAdminDetailModalsShareBlueHeaderRule() {
    assert(
        !/\.admin-detail-modal\s+\.modal-header\s*\{[^}]*border-bottom-color:\s*var\(--color-primary\);/s.test(adminCss),
        'admin detail modals should not recolor the full-width header divider'
    );
    assert(
        /\.admin-detail-modal\s+\.modal-header\s*\{[^}]*border-bottom:\s*0\s*!important;/s.test(modalCss),
        'admin detail modals should remove the full-width gray header divider'
    );
    assert(
        /\.admin-detail-modal\s+\.modal-header\s+h3::after\s*\{[^}]*background:\s*var\(--color-primary\);/s.test(modalCss),
        'admin detail modal titles should use the primary blue short underline'
    );
    assert(
        /\.admin-detail-modal\s+\.modal-header\s+h3\s*\{[^}]*border-bottom:\s*0\s*!important;/s.test(modalCss),
        'admin detail modal titles should suppress legacy h3 bottom borders'
    );
    assert(
        /\.admin-detail-modal\s+\.modal-header\s+h3\s*\{[^}]*padding-bottom:\s*0;/s.test(modalCss),
        'admin detail modal titles should suppress legacy h3 underline spacing'
    );
    assert(
        adminReportsJs.includes("actions.modalClass = 'admin-detail-modal attendance-detail-modal'"),
        'attendance detail should use the shared admin detail modal class'
    );
    assert(
        adminReportsJs.includes("actions.modalClass = 'admin-detail-modal leave-detail-modal'"),
        'leave detail should use the shared admin detail modal class'
    );
    assert(
        adminReportsJs.includes("actions.modalClass = 'admin-detail-modal photo-detail-modal'"),
        'photo detail should use the shared admin detail modal class'
    );
}

function testAdminDetailTutupButtonUsesDangerStyle() {
    assert(
        /\.admin-detail-modal\.modal-has-close-action\s+\.modal-actions\s+\.btn-secondary\s*\{[^}]*color:\s*var\(--color-danger\);/s.test(modalCss),
        'admin detail Tutup buttons should use red text'
    );
    assert(
        !/\.admin-detail-modal\.modal-has-close-action\s+\.modal-actions\s+\.btn-secondary\s*\{[^}]*background:\s*var\(--color-danger\);/s.test(modalCss),
        'admin detail Tutup buttons should not use a red background'
    );
    assert(
        !/\.admin-detail-modal\.modal-has-close-action\s+\.modal-actions\s+\.btn-secondary\s*\{[^}]*border-color:\s*var\(--color-danger\);/s.test(modalCss),
        'admin detail Tutup buttons should not use a red border'
    );
}

function testJournalDetailUsesPolishedStructuredLayout() {
    assert(
        adminReportsJs.includes('jurnal-detail-meta'),
        'journal detail should group name/division/date in a compact metadata area'
    );
    assert(
        adminReportsJs.includes('jurnal-detail-sections'),
        'journal detail should group text sections in a structured content area'
    );
    assert(
        /\.jurnal-detail-content\s+\.jurnal-detail-meta\s*\{[^}]*display:\s*grid;/s.test(adminCss),
        'journal detail metadata should use a grid layout'
    );
    assert(
        /\.jurnal-detail-content\s+\.detail-section\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border-color\);/s.test(adminCss),
        'journal detail sections should have clear panel borders'
    );
    assert(
        /\.jurnal-detail-content\s+\.detail-photo-section\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border-color\);/s.test(adminCss),
        'journal detail photo area should be styled as a clean panel'
    );
}

function testJournalDetailUsesGeneralRadioWorkLabels() {
    assert(
        adminReportsJs.includes('<label>Aktivitas Kerja</label>'),
        'admin journal detail should show the updated activity label'
    );
    assert(
        adminReportsJs.includes('<label>Hasil Kerja</label>'),
        'admin journal detail should show the updated result label'
    );
    assert(
        adminReportsJs.includes('<label>Kendala atau Catatan</label>'),
        'admin journal detail should show the updated notes label'
    );
    assert(
        adminReportsJs.includes('<label>Rencana Berikutnya</label>'),
        'admin journal detail should show the updated next-plan label'
    );
    assert(
        adminReportsJs.includes("{ header: 'Aktivitas Kerja'"),
        'journal export should use the updated activity header without changing stored fields'
    );
}

function testLeaveDetailUsesIndonesianDisplayDate() {
    assert(
        adminReportsJs.includes('formatReportDisplayDate(value)'),
        'admin reports should provide a display date formatter'
    );
    assert(
        adminReportsJs.includes('dateTime.formatNumericDate'),
        'admin detail dates should use dd/mm/yyyy day-month-year formatting'
    );
    assert(
        adminReportsJs.includes("this.formatReportDisplayDate(item.startDate || '-')"),
        'leave detail start date should be formatted for display'
    );
    assert(
        adminReportsJs.includes("this.formatReportDisplayDate(item.endDate || '-')"),
        'leave detail end date should be formatted for display'
    );
    assert(
        adminReportsJs.includes("this.formatReportDisplayDate(item.date || '-')"),
        'permission detail date should be formatted for display'
    );
}

testJournalDetailModalUsesDedicatedClass();
testModalWithTutupActionHidesDuplicateCloseButton();
testJournalDetailUsesSingleScrollContainer();
testAdminDetailModalsShareBlueHeaderRule();
testAdminDetailTutupButtonUsesDangerStyle();
testJournalDetailUsesPolishedStructuredLayout();
testJournalDetailUsesGeneralRadioWorkLabels();
testLeaveDetailUsesIndonesianDisplayDate();
console.log('admin jurnal detail modal tests passed');
