#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { afterEach, test } = require('node:test');

const VALIDATOR = path.join(__dirname, 'validate-omp-manifest.js');
const sandboxes = [];

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-validate-omp-manifest-test-'));
  const scriptsDir = path.join(root, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.copyFileSync(VALIDATOR, path.join(scriptsDir, 'validate-omp-manifest.js'));
  sandboxes.push(root);
  return root;
}

function writeFile(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** A repo laid out the way this one is: skills/, Markdown commands, both manifests. */
function scaffold(root, { source = './', plugin = {} } = {}) {
  writeFile(root, 'skills/spec-driven-development/SKILL.md', '---\nname: spec\n---\n');
  writeFile(root, '.claude/commands/spec.md', '---\ndescription: x\n---\n');
  writeJson(root, '.omp-plugin/marketplace.json', {
    name: 'addy-agent-skills',
    owner: { name: 'Owner' },
    plugins: [{ name: 'agent-skills', version: '0.0.0', source }],
  });
  writeJson(root, '.omp-plugin/plugin.json', {
    name: 'agent-skills',
    version: '0.0.0',
    ...plugin,
  });
}

function run(root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-omp-manifest.js')], {
    cwd: root,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('passes on a well-formed manifest pair', () => {
  const root = makeSandbox();
  scaffold(root, { plugin: { skills: './skills', commands: ['./.claude/commands'] } });
  const result = run(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('fails when source is "./" and the plugin manifest omits skills', () => {
  // The core coupling: under a "./" source, omp REPLACES the default skills
  // path with whatever the manifest declares. Omitting it silently disables
  // discovery instead of falling back.
  const root = makeSandbox();
  scaffold(root, { plugin: { commands: ['./.claude/commands'] } });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /skills/i);
});

test('allows an omitted skills path when the source is not "./"', () => {
  // Any other source keeps omp's additive semantics, so the default applies.
  const root = makeSandbox();
  scaffold(root, {
    source: { source: 'github', repo: 'owner/repo' },
    plugin: { commands: ['./.claude/commands'] },
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('fails when a declared skills path does not exist', () => {
  const root = makeSandbox();
  scaffold(root, { plugin: { skills: './nope', commands: ['./.claude/commands'] } });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /nope/);
});

test('fails when a declared skills path holds no SKILL.md', () => {
  const root = makeSandbox();
  scaffold(root, { plugin: { skills: './skills', commands: ['./.claude/commands'] } });
  fs.rmSync(path.join(root, 'skills/spec-driven-development/SKILL.md'));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /SKILL\.md/);
});

test('fails when a declared commands path holds no Markdown', () => {
  // Guards against pointing omp at the root commands/ directory, which holds
  // Antigravity TOML that omp cannot parse.
  const root = makeSandbox();
  scaffold(root, { plugin: { skills: './skills', commands: ['./commands'] } });
  writeFile(root, 'commands/spec.toml', 'description = "x"\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /commands/);
});

test('fails when the marketplace name breaks omp naming rules', () => {
  const root = makeSandbox();
  scaffold(root, { plugin: { skills: './skills', commands: ['./.claude/commands'] } });
  writeJson(root, '.omp-plugin/marketplace.json', {
    name: 'Addy_Agent_Skills',
    owner: { name: 'Owner' },
    plugins: [{ name: 'agent-skills', version: '0.0.0', source: './' }],
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /name/i);
});

test('passes quietly when the repo ships no .omp-plugin directory', () => {
  const root = makeSandbox();
  writeFile(root, 'skills/spec-driven-development/SKILL.md', '---\nname: spec\n---\n');
  const result = run(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
