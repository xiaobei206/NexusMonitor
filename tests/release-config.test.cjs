const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

test('Windows release requests administrator privileges and always creates desktop shortcut', () => {
  assert.equal(pkg.build.win.requestedExecutionLevel, 'requireAdministrator');
  assert.equal(pkg.build.nsis.createDesktopShortcut, 'always');
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
});
