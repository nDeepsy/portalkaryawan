const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiJs = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
const authJs = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const routerJs = fs.readFileSync(path.join(root, 'js', 'router.js'), 'utf8');

assert(
    /cacheTtl:\s*15000/.test(apiJs),
    'API read cache should stay short so active menus do not show stale data too long'
);

assert(
    /requestTimeoutMs:\s*20000/.test(apiJs),
    'API requests should have a clear timeout so the UI does not hang when Apps Script is slow'
);

assert(
    apiJs.includes('AbortController') && apiJs.includes('controller.abort()'),
    'API requests should abort slow Apps Script calls when supported'
);

assert(
    apiJs.includes('clearTimeout(timeoutId)'),
    'API request timeout timers should always be cleaned up'
);

assert(
    apiJs.includes("error.name === 'AbortError'"),
    'API should return a clear message when a request times out'
);

assert(
    !/catch\s*\(\s*error\s*\)\s*\{[\s\S]*return this\._localFallback\(action,\s*data\);/.test(apiJs),
    'production API failures should not silently fall back to localStorage'
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
