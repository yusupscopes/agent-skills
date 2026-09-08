# Using agent-skills with Oh My Pi

This repository is also a native [Oh My Pi](https://github.com/can1357/oh-my-pi) (`omp`) plugin. The same root-level `skills/` directory used by Claude Code and Codex is consumed by omp, so no files are copied or duplicated.

## Install

Inside an omp session:

```
/marketplace add addyosmani/agent-skills
/marketplace install agent-skills@addy-agent-skills
```

Or from your shell:

```bash
omp plugin marketplace add addyosmani/agent-skills
omp plugin install agent-skills@addy-agent-skills
```

The first command registers this repository as the `addy-agent-skills` marketplace. The second installs and enables the `agent-skills` plugin from it. Start a new omp session after installing so the skills are discovered.

Local clones work too, and are the fastest way to try changes:

```bash
omp plugin marketplace add /path/to/your/clone
omp plugin install agent-skills@addy-agent-skills
```

### Install scope

Installs default to **user** scope (`~/.omp/plugins/`), which makes the skills available in every project. To confine an install to one project, use `--scope project`:

```bash
omp plugin install agent-skills@addy-agent-skills --scope project
```

Project scope writes to `<project>/.omp/`. That directory is install state, not source — this repo's `.gitignore` excludes it, and you should do the same in yours. An enabled project install shadows an enabled user install of the same plugin.

> **`--dry-run` is not a preview.** On omp 18.1.14, `omp plugin install … --dry-run` reports `✔ Installed` and performs a real user-scope install. If you use it, uninstall afterwards:
> ```bash
> omp plugin uninstall agent-skills@addy-agent-skills --scope user
> ```

## Usage

After install, all 25 skills under `skills/` are available. Describe your task and let omp route to the right skill, or invoke one directly:

```
/skill:spec-driven-development
```

The nine slash commands ship too — `/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`, `/constraints`, and `/webperf` — along with the four agent personas in `agents/`.

To scope which skills load in a session:

```bash
omp --skills='spec-*,test-*'   # only matching skills
omp --no-skills                # disable skill discovery entirely
```

## Uninstall

```bash
omp plugin uninstall agent-skills@addy-agent-skills --scope user
omp plugin marketplace remove addy-agent-skills
```

Use `--scope project` for a project-scoped install. If the plugin exists in both scopes, `--scope` is required.

## How it works

- **`.omp-plugin/marketplace.json`** — the catalog omp reads. omp prefers `.omp-plugin/marketplace.json` and falls back to `.claude-plugin/marketplace.json`, so this repo ships both: omp reads its own copy, Claude Code reads the Claude one.
- **`.omp-plugin/plugin.json`** — the plugin manifest. omp reads `.omp-plugin/plugin.json` first, then `.claude-plugin/plugin.json`.
- **`skills/<name>/SKILL.md`** — unchanged. omp shares the `name` + `description` frontmatter format with Claude Code and Codex, so one file serves every platform.
- **`.agents/skills`** — a symlink to `skills/`. omp's `agents` provider (`.agent[s]/skills`) is its canonical native project location, so cloning this repo and running omp inside it gives you every skill with no install at all.

### Two manifest details that look redundant but aren't

**`"skills": "./skills"` is required.** omp normally treats a declared skill path as *additive* to the default `skills/` directory. But for a plugin whose catalog `source` is exactly `"./"` — as this one is — a declared path **replaces** the default instead. Removing the line would break skill discovery rather than fall back to the default.

**`"commands": ["./.claude/commands"]` deliberately omits `./commands`.** A declared `commands` list replaces the default `./commands` unless that path is listed explicitly. The repo's root `commands/` holds Antigravity `.toml` files, which omp cannot parse; `.claude/commands/` holds the Markdown equivalents. The omission is the mechanism that selects the right ones.

**`agents/` needs no declaration.** It is a default location in omp's plugin tree, and this repo's root `agents/` already matches it.

### Why `source: "./"`

The catalog entry uses a relative `"./"` source, so the plugin resolves inside whichever repository the marketplace was added from. Adding a fork installs that fork's content; adding upstream installs upstream's. The same catalog file works in both places unchanged, which means you can verify a change against a real omp install before proposing it.

Note that `"./"` copies the **working tree**, not a git clone — uncommitted and untracked files are included in the installed plugin. Convenient when testing local edits; worth knowing before you install from a dirty checkout.

## Troubleshooting

**`omp: command not found` in scripts or non-interactive shells.** omp installs to `~/.bun/bin` when installed via Bun, which login shells pick up from your profile but non-interactive shells do not. Prefix the call:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

**Skills don't appear after installing.** Start a new omp session — discovery runs at startup. Then check the plugin is registered and enabled:

```bash
omp plugin list
omp plugin doctor
```

**`omp plugin features agent-skills` reports "not found".** Expected. `features` targets plugins that ship extension modules via `package.json` `omp.extensions`. This plugin is content only — skills, commands, and personas — so it exposes no toggleable features. Use `omp plugin list` to confirm it installed.

**A skill name collides with one you already have.** omp dedups by skill name across providers, highest-precedence first: `native` (`.omp`) > `omp-plugins` > `claude` > `claude-plugins`/`agents`/`codex` > `opencode` > `github`. Identical files reached by different paths are de-duplicated by `realpath`, so the `.agents/skills` symlink does not collide with the same skills installed as a plugin. To exclude specific skills, use `ignoredSkills`, or filter at launch with `omp --skills=<globs>`.

**Cloning the repo on Windows leaves `.agents/skills` as a text file.** `.agents/skills` and `.opencode/skills` are git symlinks. Enable Developer Mode or set `git config core.symlinks true` before cloning. This only affects working from a clone; installing the plugin normally is unaffected.

## Verified against

omp `18.1.14`. The install path in this document was executed end to end: `omp plugin marketplace add ./` against a local checkout, `omp plugin discover`, `omp plugin install` at both user and project scope, `omp plugin list --json`, `omp plugin doctor`, and full uninstall. The installed tree was confirmed to carry all 25 skills, 9 Markdown commands, and 4 personas at the paths the manifest declares, with the plugin recorded as `enabled` in omp's lock file.

Not verified here: model-level behavior inside a session — whether omp surfaces each skill in its system prompt and registers `/spec` and friends as slash commands. That needs a configured model, and no provider credentials were available on the verifying machine. The claims above about session behavior follow omp's documented discovery rules rather than an observed run.
