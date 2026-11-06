const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyFetchError } = require('../dist-electron/main/api-error.js');

test('classifies an AbortSignal timeout as timeout, not offline', () => {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  assert.equal(classifyFetchError(error).kind, 'timeout');
});

test('classifies ECONNREFUSED as unreachable', () => {
  const error = new Error('fetch failed');
  error.cause = { code: 'ECONNREFUSED' };
  const classified = classifyFetchError(error);
  assert.equal(classified.kind, 'unreachable');
  assert.match(classified.message, /ECONNREFUSED/);
});

test('classifies malformed JSON as parse failure', () => {
  assert.equal(classifyFetchError(new SyntaxError('Unexpected token')).kind, 'parse');
});

test('classifies an unknown fetch failure as unreachable with its message', () => {
  const classified = classifyFetchError(new Error('socket hang up'));
  assert.equal(classified.kind, 'unreachable');
  assert.match(classified.message, /socket hang up/);
});
