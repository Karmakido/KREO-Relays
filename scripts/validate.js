/* Basic validator for relays.json
   - Ensures shape { relays: string[] }
   - Accepts ws:// or wss:// only, with host present
   - Detects duplicates (normalized host:port)
   - Fails on invalid entries
*/

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'relays.json');

function loadJson(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function normalize(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch (e) {
    throw new Error(`invalid URL: ${urlStr}`);
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`invalid protocol (must be ws:// or wss://): ${urlStr}`);
  }
  if (!url.hostname) {
    throw new Error(`missing hostname: ${urlStr}`);
  }
  const port = url.port || (url.protocol === 'wss:' ? '443' : '80');
  const pathPart = url.pathname && url.pathname !== '/' ? url.pathname : '';
  return { norm: `${url.protocol}//${url.hostname}:${port}${pathPart}`, url: urlStr };
}

function validate(relays) {
  if (!relays || typeof relays !== 'object' || !Array.isArray(relays.relays)) {
    throw new Error('root must be { relays: string[] }');
  }
  const seen = new Map();
  const issues = [];
  relays.relays.forEach((entry, idx) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      issues.push(`entry ${idx} is not a non-empty string`);
      return;
    }
    try {
      const { norm } = normalize(entry.trim());
      if (seen.has(norm)) {
        issues.push(`duplicate (normalized): ${entry} (same as ${seen.get(norm)})`);
      } else {
        seen.set(norm, entry);
      }
    } catch (e) {
      issues.push(`entry ${idx} invalid: ${e.message}`);
    }
  });
  return issues;
}

function main() {
  try {
    const data = loadJson(file);
    const issues = validate(data);
    if (issues.length > 0) {
      console.error('Validation failed:');
      issues.forEach((i) => console.error('- ' + i));
      process.exitCode = 1;
      return;
    }
    console.log(`OK: ${data.relays.length} relays, no duplicates, protocols valid.`);
  } catch (e) {
    console.error('Validation error:', e.message);
    process.exitCode = 1;
  }
}

main();
