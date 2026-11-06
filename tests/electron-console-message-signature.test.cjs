const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Electron 45 console-message listener uses the positional event signature', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  assert.match(
    source,
    /on\('console-message',\s*\(_event,\s*level,\s*message,\s*line,\s*sourceId\)\s*=>/,
  );
  assert.doesNotMatch(source, /on\('console-message',\s*\(_event,\s*details\)\s*=>/);
});
