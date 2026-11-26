'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReleaseBody, validateReleaseCoverage, releaseNotes } = require('../scripts/sync-release-notes.cjs');

test('every release-note entry has a substantive English summary and complete evidence', () => {
  const releases = Object.keys(releaseNotes).map(tag_name => ({ tag_name, draft: false }));
  assert.ok(releases.length >= 14, 'the historical release inventory must not silently shrink');
  assert.deepEqual(validateReleaseCoverage(releases, releaseNotes), []);
});

test('every version has concrete highlights, validation evidence and an acceptance caveat', () => {
  for (const [tag, entry] of Object.entries(releaseNotes)) {
    assert.ok(entry.summary.length >= 70, `${tag} summary is too short`);
    assert.ok(entry.highlights.length >= 3, `${tag} needs at least three highlights`);
    assert.ok(entry.validation.length >= 30, `${tag} lacks a validation record`);
    assert.ok(entry.caveat.length >= 30, `${tag} lacks a limitations note`);
  }
});

test('generated release body contains sections and more than a Full Changelog link', () => {
  const body = renderReleaseBody('v2.2.12', releaseNotes['v2.2.12'], 'xiaobei206/NexusMonitor');
  assert.match(body, /^# NexusMonitor 2\.2\.12/m);
  assert.match(body, /## Highlights/);
  assert.match(body, /## Validation/);
  assert.match(body, /## Limitations and acceptance/);
  assert.match(body, /271\/271/);
  assert.match(body, /compare\/v2\.2\.11\.\.\.v2\.2\.12/);
  assert.ok(body.length > 700);
});

test('oldest release keeps its commit-history link when no previous tag is recorded', () => {
  const body = renderReleaseBody('v2.1.8', releaseNotes['v2.1.8'], 'xiaobei206/NexusMonitor');
  assert.match(body, /commits\/v2\.1\.8/);
});
