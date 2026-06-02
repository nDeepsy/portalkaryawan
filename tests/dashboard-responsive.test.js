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
    /\.donut-bg\s*\{[^}]*stroke-width:\s*8;/s.test(mainCss),
    'dashboard donut background ring should use a slimmer modern stroke'
);
assert(
    /\.donut-fill\s*\{[^}]*stroke-width:\s*8;[^}]*stroke-linecap:\s*round;/s.test(mainCss),
    'dashboard donut segments should use a slim rounded stroke'
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

console.log('dashboard responsive tests passed');
