const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dashboardJs = fs.readFileSync(path.join(root, 'js', 'dashboard.js'), 'utf8');
const mainCss = fs.readFileSync(path.join(root, 'css', 'main.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'css', 'mobile.css'), 'utf8');

assert(
    /this\.loadCachedData\(\);\s*this\.renderDashboard\(\);/.test(dashboardJs),
    'dashboard should render cached/session data immediately before remote refresh'
);
assert(
    dashboardJs.includes('this.loadingPromise = this.loadData().finally'),
    'dashboard should still refresh real data in the background'
);
assert(
    dashboardJs.includes('const shiftGreeting = this.getShiftGreeting(currentShiftName);'),
    'dashboard greeting should be able to follow the employee shift'
);
assert(
    dashboardJs.includes("malam") && dashboardJs.includes("Selamat Malam"),
    'night shift users should not be stuck with the default morning greeting'
);
assert(
    !/await\s+this\.loadingPromise;\s*this\.initialized\s*=\s*true;/.test(dashboardJs),
    'dashboard init should not block first render while waiting for remote data'
);
assert(
    /\.donut-bg\s*\{[^}]*stroke-width:\s*7;/s.test(mainCss),
    'dashboard donut background ring should use a slimmer modern stroke'
);
assert(
    /\.donut-fill\s*\{[^}]*stroke-width:\s*7;[^}]*stroke-linecap:\s*round;/s.test(mainCss),
    'dashboard donut segments should use a slim rounded stroke'
);
assert(
    /\.donut-fill\.present\s*\{[^}]*stroke-dasharray:\s*0\s+251;/s.test(mainCss) &&
    /\.donut-fill\.late\s*\{[^}]*stroke-dasharray:\s*0\s+251;/s.test(mainCss) &&
    /\.donut-fill\.absent\s*\{[^}]*stroke-dasharray:\s*0\s+251;/s.test(mainCss),
    'dashboard donut should not show fake colored segments before real stats render'
);
assert(
    /\.donut-value\s*\{[^}]*font-size:\s*var\(--font-size-xl\);/s.test(mainCss),
    'dashboard donut center value should be less oversized'
);
assert(
    /\.donut-chart\s*\{[^}]*width:\s*96px;[^}]*height:\s*96px;/s.test(mobileCss),
    'mobile donut chart should be compact and not bulky'
);
assert(
    /\.donut-value\s*\{[^}]*font-size:\s*20px;/s.test(mobileCss),
    'mobile donut value should fit comfortably inside the ring'
);
assert(
    dashboardJs.includes('getScheduledWorkDateKeys') &&
    dashboardJs.includes('scheduledWorkDates.forEach') &&
    dashboardJs.includes('absentDates.add(dateKey)'),
    'dashboard attendance stats should count elapsed scheduled workdays without attendance as absent'
);
assert(
    dashboardJs.includes('getApprovedLeaveDateKeys') &&
    dashboardJs.includes('getApprovedIzinDateKeys'),
    'dashboard attendance stats should keep approved leave and izin counted in absent days'
);
assert(
    dashboardJs.includes('populateStatsPeriodOptions') &&
    dashboardJs.includes('Januari') &&
    dashboardJs.includes('Desember') &&
    dashboardJs.includes('select.options.length !== 12'),
    'dashboard attendance stats period dropdown should provide 12 months for the current year'
);
assert(
    !dashboardJs.includes('(Bulan Ini)'),
    'dashboard stats month dropdown should not add extra "(Bulan Ini)" wording'
);
assert(
    dashboardJs.includes('const numericMatch = text.match') &&
    dashboardJs.includes('const day = second > 12 ? second : first;') &&
    dashboardJs.includes('const month = second > 12 ? first : second;'),
    'dashboard stats should normalize dd/mm/yyyy and legacy mm/dd/yyyy dates before filtering real attendance data'
);
assert(
    dashboardJs.includes('const date = this.parseDashboardDate(a.date);') &&
    dashboardJs.includes('return date && date.getMonth() === month && date.getFullYear() === year;'),
    'dashboard stats should filter attendance using normalized local dates instead of browser-dependent Date parsing'
);
assert(
    dashboardJs.includes('this.selectedStatsMonth = event.target.value') &&
    dashboardJs.includes('this.updateStats();'),
    'dashboard attendance stats should recalculate when the selected month changes'
);
assert(
    dashboardJs.includes('const selectedMonthEnd = new Date(year, month + 1, 0);') &&
    dashboardJs.includes('const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();'),
    'dashboard attendance stats should use realtime current month and full past months'
);
assert(
    dashboardJs.includes('presentDates.forEach(dateKey => absentDates.delete(dateKey));') &&
    dashboardJs.includes('lateDates.forEach(dateKey => absentDates.delete(dateKey));'),
    'dashboard attendance stats should not double-count present or late dates as absent'
);

console.log('dashboard responsive tests passed');
