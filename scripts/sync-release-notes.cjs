#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RELEASE_NOTES_PATH = path.join(__dirname, '..', '.github', 'release-notes.json');
const releaseNotes = JSON.parse(fs.readFileSync(RELEASE_NOTES_PATH, 'utf8'));

function renderReleaseBody(tag, entry, repository) {
  if (!entry || typeof entry.summary !== 'string' || !entry.summary.trim()) {
    throw new Error(`Missing summary for release ${tag}`);
  }
  if (!Array.isArray(entry.highlights) || entry.highlights.length < 3) {
    throw new Error(`Release ${tag} must provide at least three concrete highlights`);
  }
  if (typeof entry.validation !== 'string' || !entry.validation.trim()) {
    throw new Error(`Release ${tag} is missing its validation record`);
  }
  if (typeof entry.caveat !== 'string' || !entry.caveat.trim()) {
    throw new Error(`Release ${tag} is missing its limitations / acceptance note`);
  }

  const fullChangelog = entry.previousTag
    ? `https://github.com/${repository}/compare/${entry.previousTag}...${tag}`
    : `https://github.com/${repository}/commits/${tag}`;
  return [
    `# NexusMonitor ${tag.replace(/^v/, '')}`,
    '',
    entry.summary.trim(),
    '',
    '## Highlights',
    ...entry.highlights.map(item => `- ${item}`),
    '',
    '## Validation',
    `- ${entry.validation.trim()}`,
    '',
    '## Limitations and acceptance',
    `- ${entry.caveat.trim()}`,
    '- The Windows installer is not code-signed because no code-signing certificate is configured.',
    '',
    `**Full Changelog:** ${fullChangelog}`,
    '',
  ].join('\n');
}

function validateReleaseCoverage(releases, notes = releaseNotes) {
  const missing = [];
  for (const release of releases.filter(item => !item.draft)) {
    const tag = release.tag_name;
    const entry = notes[tag];
    if (!entry) {
      missing.push(tag);
      continue;
    }
    try {
      renderReleaseBody(tag, entry, 'xiaobei206/NexusMonitor');
    } catch (error) {
      missing.push(`${tag} (${error.message})`);
    }
  }
  return missing;
}

async function syncReleaseNotes() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    throw new Error('GITHUB_REPOSITORY and GH_TOKEN/GITHUB_TOKEN are required');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`GitHub API ${options.method || 'GET'} ${url} failed (${response.status}): ${detail.slice(0, 1200)}`);
    }
    return response.status === 204 ? null : response.json();
  }

  const base = `https://api.github.com/repos/${repository}`;
  const releases = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await request(`${base}/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if (batch.length < 100) break;
    if (page === 100) throw new Error('Release pagination exceeded 100 pages; refusing a partial update');
  }

  const published = releases.filter(item => !item.draft);
  const missing = validateReleaseCoverage(published, releaseNotes);
  if (missing.length) {
    throw new Error(`Every published Release must have a substantive note entry in .github/release-notes.json. Missing/invalid: ${missing.join(', ')}`);
  }

  let updated = 0;
  let unchanged = 0;
  for (const release of published) {
    const desiredBody = renderReleaseBody(release.tag_name, releaseNotes[release.tag_name], repository);
    if (release.body === desiredBody) {
      unchanged += 1;
      console.log(`UNCHANGED ${release.tag_name}`);
      continue;
    }
    if (release.immutable) {
      throw new Error(`Release ${release.tag_name} is immutable and cannot be edited`);
    }
    await request(`${base}/releases/${release.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: desiredBody }),
    });
    updated += 1;
    console.log(`UPDATED ${release.tag_name}`);
  }
  console.log(`Release descriptions synchronized: ${updated} updated, ${unchanged} unchanged, ${published.length} published releases checked.`);
}

if (require.main === module) {
  syncReleaseNotes().catch(error => {
    console.error('Release-note synchronization failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { renderReleaseBody, validateReleaseCoverage, releaseNotes };
