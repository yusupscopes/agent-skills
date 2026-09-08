#!/usr/bin/env node
/**
 * validate-omp-manifest.js
 *
 * Guards the Oh My Pi manifests in .omp-plugin/ against edits that look like
 * harmless cleanup but silently break the plugin.
 *
 * The rule worth enforcing is a coupling that is invisible from either file
 * alone. omp normally treats a declared `skills` path as *additive* to the
 * default `skills/` directory, which makes `"skills": "./skills"` read like
 * redundant boilerplate. But when a plugin's catalog `source` is exactly
 * "./", a declared path *replaces* the default instead. Deleting the line
 * there does not fall back — it disables skill discovery, and nothing fails
 * loudly: the plugin still installs, `omp plugin list` still shows it, and
 * the skills simply never appear.
 *
 * So the check is conditional on the source, not a flat "this key must
 * exist". If someone changes the catalog to a github source, omitting the
 * skills path becomes correct again and this validator stops demanding it.
 *
 * Also verified, cheaply:
 *   - declared skills/commands paths exist and hold the file types omp reads
 *     (commands must be Markdown; omp cannot parse the Antigravity TOML in
 *     the root commands/ directory)
 *   - marketplace and plugin names satisfy omp's naming rules, which omp
 *     enforces by rejecting the whole catalog
 *
 * Repos without a .omp-plugin/ directory pass without complaint.
 *
 * Exit codes: 0 = all clear, 1 = one or more errors
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const MANIFEST_DIR = '.omp-plugin';
const MARKETPLACE = path.join(MANIFEST_DIR, 'marketplace.json');
const PLUGIN = path.join(MANIFEST_DIR, 'plugin.json');

// omp: lowercase letters, digits, hyphens and dots; must start and end
// alphanumeric; at most 64 characters.
const NAME_RULE = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;

const errors = [];

function fail(message, hint) {
  errors.push({ message, hint });
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath} could not be read as JSON: ${error.message}`);
    return null;
  }
}

function declaredPaths(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string');
  return [];
}

function checkName(label, value) {
  if (typeof value !== 'string' || !NAME_RULE.test(value)) {
    fail(
      `${label} is ${JSON.stringify(value)}, which omp rejects.`,
      'Names must be lowercase letters, digits, hyphens or dots, start and end alphanumeric, max 64 chars. omp rejects the whole catalog otherwise.'
    );
  }
}

function checkSkillsPath(declared) {
  const absolute = path.resolve(ROOT, declared);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    fail(`${PLUGIN} declares skills path ${declared}, which does not exist.`);
    return;
  }
  const hasSkill = fs
    .readdirSync(absolute, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && fs.existsSync(path.join(absolute, entry.name, 'SKILL.md')));
  if (!hasSkill) {
    fail(
      `${PLUGIN} declares skills path ${declared}, but it holds no <name>/SKILL.md.`,
      'omp discovers skills exactly one level down; nested layouts are not found.'
    );
  }
}

function checkCommandsPath(declared) {
  const absolute = path.resolve(ROOT, declared);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    fail(`${PLUGIN} declares commands path ${declared}, which does not exist.`);
    return;
  }
  const entries = fs.readdirSync(absolute);
  if (!entries.some((entry) => entry.endsWith('.md'))) {
    fail(
      `${PLUGIN} declares commands path ${declared}, but it holds no .md files.`,
      'omp parses Markdown commands only. The root commands/ directory holds Antigravity TOML; point omp at .claude/commands instead.'
    );
  }
}

function main() {
  if (!fs.existsSync(path.join(ROOT, MANIFEST_DIR))) {
    console.log(`No ${MANIFEST_DIR}/ directory — nothing to validate.`);
    return;
  }

  const marketplace = readJson(MARKETPLACE);
  const plugin = fs.existsSync(path.join(ROOT, PLUGIN)) ? readJson(PLUGIN) : null;

  if (marketplace) {
    checkName(`${MARKETPLACE} name`, marketplace.name);
    for (const entry of marketplace.plugins ?? []) {
      checkName(`${MARKETPLACE} plugin name`, entry.name);
    }
  }

  if (plugin) {
    checkName(`${PLUGIN} name`, plugin.name);
  }

  // The coupling this validator exists for.
  const selfSourced = (marketplace?.plugins ?? []).some((entry) => entry.source === './');
  if (selfSourced && plugin && declaredPaths(plugin.skills).length === 0) {
    fail(
      `${MARKETPLACE} declares a "./" plugin source, but ${PLUGIN} does not declare "skills".`,
      'Under a "./" source omp replaces the default skills path rather than extending it, so an undeclared path means no skills are discovered — silently. Add "skills": "./skills".'
    );
  }

  if (plugin) {
    for (const declared of declaredPaths(plugin.skills)) checkSkillsPath(declared);
    for (const declared of declaredPaths(plugin.commands)) checkCommandsPath(declared);
  }

  if (errors.length > 0) {
    console.log(`omp manifest validation FAILED — ${errors.length} error(s):\n`);
    for (const { message, hint } of errors) {
      console.log(`  ✗ ${message}`);
      if (hint) console.log(`    ${hint}`);
    }
    console.log('\nSee docs/omp-setup.md for why these declarations are load-bearing.');
    process.exit(1);
  }

  console.log('omp manifests are valid.');
}

main();
