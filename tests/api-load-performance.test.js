const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const authJs = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const routerJs = fs.readFileSync(path.join(root, 'js', 'router.js'), 'utf8');

assert(
    /cacheTtl:\s*60000/.test(apiJs),
    'API read cache should last long enough to speed menu switching'
);

assert(
    apiJs.includes("'batch'"),
    'batch reads should be cacheable because most menus load data through batch'
);

assert(
    apiJs.includes('prefetchForUser(user = {})'),
    'API should expose role-aware prefetching for menu data'
);

assert(
    apiJs.includes("role === 'admin' || role === 'pemilik'"),
    'prefetch should warm admin/pemilik menu data together'
);

assert(
    apiJs.includes("role === 'karyawan'"),
    'prefetch should warm employee menu data'
);

assert(
    authJs.includes('api.prefetchForUser(user)'),
    'login should warm data for the user after opening the app'
);

assert(
    routerJs.includes('api.prefetchForUser(auth.getCurrentUser())'),
    'navigation should opportunistically keep menu data warm'
);

console.log('api load performance tests passed');
