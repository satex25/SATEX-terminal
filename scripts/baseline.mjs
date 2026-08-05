#!/usr/bin/env node
/**
 * baseline.mjs — single source of truth for the ARCHITECTURE.md §4 "Baseline" line.
 *
 * Both `update-baseline.sh` (writes the line) and `check-baseline.sh` (fails CI when
 * it drifts) delegate here. They must not carry their own copies of the format: a
 * writer and a checker that disagree by one character produce a CI failure nothing
 * can clear, which is worse than the drift the check exists to catch.
 *
 * Subcommands:
 *   read                    → prints "<tests> <files>" recorded in ARCHITECTURE.md
 *   count <report.json>     → prints "<tests> <files>" actually observed by vitest
 *   write <tests> <files>   → rewrites the line with honest provenance
 *
 * Provenance honesty (P-158): the previous template appended "+ edits (working
 * tree)" unconditionally, so a baseline measured on a clean checkout still claimed
 * uncommitted edits. `write` now asks git and records what is actually true.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARCH = path.join(ROOT, 'ARCHITECTURE.md')

/** The one regex that defines what a Baseline line looks like. */
const LINE_RE = /^Baseline .*$/m
/** Counts are bold-wrapped: **2238 tests / 175 files**. */
const COUNTS_RE = /\*\*(\d+) tests \/ (\d+) files\*\*/

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim()

function readArch() {
  return fs.readFileSync(ARCH, 'utf8')
}

function readRecorded() {
  const line = readArch().match(LINE_RE)
  if (!line) throw new Error(`no "Baseline " line found in ${ARCH}`)
  const m = line[0].match(COUNTS_RE)
  if (!m) throw new Error(`Baseline line has no "**N tests / N files**" counts:\n  ${line[0]}`)
  return { tests: Number(m[1]), files: Number(m[2]) }
}

/**
 * Reads vitest's JSON report. `numTotalTests` is the test count, but the file count
 * is `testResults.length` — NOT `numTotalTestSuites`, which counts `describe` blocks
 * (one probe file with four describes reports numTotalTestSuites=4). Getting this
 * wrong inflates the file count several-fold and the drift never resolves.
 */
function countFromReport(reportPath) {
  const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  if (!Array.isArray(r.testResults)) throw new Error(`${reportPath} has no testResults[] — not a vitest JSON report?`)
  return { tests: r.numTotalTests, files: r.testResults.length }
}

/** True when the working tree has staged or unstaged changes. */
function treeIsDirty() {
  return git('status', '--porcelain').length > 0
}

function write(tests, files) {
  const date = new Date().toISOString().slice(0, 10)
  const branch = git('branch', '--show-current') || '(detached HEAD)'
  const sha = git('rev-parse', '--short', 'HEAD')
  // Honest provenance: only claim uncommitted edits when there are some.
  const provenance = treeIsDirty()
    ? `\`${branch}\` @ ${sha} + uncommitted edits (working tree)`
    : `\`${branch}\` @ ${sha} (clean tree)`
  const line =
    `Baseline ${date}: **${tests} tests / ${files} files**, all four gates green on ` +
    `${provenance} — jsdom, see P-019. <!-- refresh: scripts/update-baseline.sh -->`

  const before = readArch()
  const after = before.replace(LINE_RE, line)
  if (after === before && !LINE_RE.test(before)) throw new Error(`no "Baseline " line to replace in ${ARCH}`)
  fs.writeFileSync(ARCH, after)
  console.log(line)
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'read') {
    const { tests, files } = readRecorded()
    console.log(`${tests} ${files}`)
  } else if (cmd === 'count') {
    if (!rest[0]) throw new Error('usage: baseline.mjs count <vitest-report.json>')
    const { tests, files } = countFromReport(rest[0])
    console.log(`${tests} ${files}`)
  } else if (cmd === 'write') {
    if (rest.length !== 2) throw new Error('usage: baseline.mjs write <tests> <files>')
    write(Number(rest[0]), Number(rest[1]))
  } else {
    throw new Error(`unknown subcommand ${cmd ?? '(none)'} — expected read|count|write`)
  }
} catch (err) {
  console.error(`baseline.mjs: ${err.message}`)
  process.exit(2)
}
