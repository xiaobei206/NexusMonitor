# GitHub Release Notes Guidelines

These requirements are mandatory for every NexusMonitor release, including maintenance releases.

## Never leave generated boilerplate as the final description

A Release body containing only `**Full Changelog**`, the tag comparison URL, or a vague one-line sentence is incomplete. GitHub's generated changelog is a useful link, not the release description.

## Required English structure

Each published Release must contain:

1. **Overview:** one or two sentences explaining the user-visible purpose of the version.
2. **Highlights:** at least three concrete changes. Prefer what changed and why it matters; do not pad this list with filenames, commit subjects, or vague claims such as “various fixes.”
3. **Validation:** the exact Windows Actions run and only the test counts/build stages that actually passed for that version. If the release's build report is incomplete or a final run cannot be verified, state that clearly instead of borrowing a previous version's results.
4. **Limitations and acceptance:** known regressions, unsupported capabilities, account/network prerequisites and physical-device checks that hosted CI cannot prove.
5. **Full Changelog:** retain the tag comparison link at the bottom.

The installer is currently unsigned because no code-signing certificate is configured. Do not claim an installer is signed.

## Source of truth and automation

- Add or update the release's tag entry in `.github/release-notes.json` **before** pushing a new application version. Required fields are `summary`, at least three `highlights`, `validation`, `caveat`, and `previousTag` (use `null` only for the earliest release).
- `scripts/sync-release-notes.cjs` turns the curated entries into complete English descriptions and patches every published Release using the repository's `GITHUB_TOKEN`.
- `.github/workflows/windows-ci.yml` runs the synchronizer after tests and after a new Release is published. It fails if a published tag has no valid entry; never bypass that failure by restoring generated boilerplate.
- `tests/release-notes.test.cjs` guards against empty, underspecified or missing entries. Keep this test in the main test suite.
- After the workflow finishes, fetch the live Release list from the GitHub API and check the actual `body` of every published tag. The mapping file is not proof that GitHub accepted the patches.
- Update the versioned BUILD-REPORT with the exact Actions run, regression count, installer size and SHA-256. Update the versioned HANDOFF, `START-HERE-NEXT-GPT.md`, and the cumulative `NexusMonitor-DEVELOPMENT-LOG-CN.md` when their status changes.

## Evidence and honesty

Do not infer release success from a queued/in-progress run, a previous version's green build, a package file name, or a draft report. Read the final Actions conclusion and relevant step results first. Explicitly separate hosted build/test evidence from real Windows PC acceptance, especially for USB displays, audio endpoints, weather credentials, multi-monitor/DPI layouts, sleep/wake and long-running devices.
