#!/usr/bin/env node
// @ts-check
/**
 * Installs the agent-orchestration harness into a project, or for every project on this computer, with no dependencies.
 *
 *   node tools/install.mjs <project folder> [--for copilot,claude,agents] [--templates <folder>] [--dry-run]
 *   node tools/install.mjs --global [--for copilot,claude,agents]
 *
 * - Skills go where each agent looks for them: GitHub Copilot `.github/skills/<name>/`, Claude Code
 *   `.claude/skills/<name>/`, Codex and other agents that read the open skills layout `.agents/skills/<name>/`
 *   (with --global: `~/.copilot/skills`, `~/.claude/skills`, `~/.agents/skills`).
 * - Agents go to `.github/agents/<name>.agent.md` (Copilot) and `.claude/agents/<name>.md` (Claude Code). Tools
 *   without custom agents use the same questions from the `progress-review` skill.
 * - The project's AGENTS.md (and CLAUDE.md, when there is one) gets a section between its own markers, with the
 *   project facts the skills read, to fill in. Other sections, including other harnesses', are left alone. Run
 *   again to update; the section's filled-in facts are kept.
 * - --templates copies the work plan, progress log and handoff starters into a folder, keeping any file already there.
 * Without --for it installs for Copilot, plus Claude Code when the project has .claude/ or CLAUDE.md, plus the
 * open skills layout when the project has .agents/.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const START = '<!-- agent-orchestration:start -->';
export const END = '<!-- agent-orchestration:end -->';

/** The section the harness keeps in AGENTS.md; `facts` is what the project filled in before (kept). */
export function section(/** @type {string | null} */ facts) {
  const defaultFacts = `### Project facts (fill in; the skills read these)

- **Product intent:** <path to the spec and Definitions of Done, or "none: the work plan states the goal, done when and limits">
- **Work plan:** <path to the current work plan>
- **Commands by validation tier:** unit, related files \`<…>\` · types \`<…>\` · one end-to-end test \`<…> -g "<title>"\` · full suites \`<…>\` · production build with budgets \`<…>\`
- **Progress log:** <a path outside the repository, or an ignored folder inside it when the agent can't write outside>
- **Branches and merges:** <work branch or worktree> · merge with \`<…>\` · deploy watched with \`<…>\` · the agent may: <merge, push, deploy, or none: the owner does> · must never break: <the live product, an API>
- **Reviews and escalation:** review every <30> minutes · always escalate: <what waits for the owner>`;
  return `${START}
## Orchestration (agent-orchestration harness)

This project uses the [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) skills to carry out work. Start with the \`orchestrate\` skill: it picks the mode (show me the UX sooner, prove the risky assumption, make this production-ready; work with me or keep going unattended) and routes to \`execution-modes\`, \`stage-validation\`, \`progress-review\` and \`coordinate\`. Agent: \`throughput-reviewer\` (about every 30 minutes of running work). These skills decide how work is run, not what to build; product intent comes from the files named below when there are any.

${facts ?? defaultFacts}
${END}`;
}

/** AGENTS.md with the harness's section added or updated, keeping the project's filled-in facts. */
export function withSection(/** @type {string} */ text) {
  const i = text.indexOf(START);
  const j = text.indexOf(END);
  if (i >= 0 && j > i) {
    const old = text.slice(i, j);
    const facts = /### Project facts[\s\S]*$/.exec(old.trimEnd())?.[0] ?? null;
    return text.slice(0, i) + section(facts) + text.slice(j + END.length);
  }
  return `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${section(null)}\n`;
}

export const skills = () => readdirSync(join(HERE, 'skills'));
export const agents = () => readdirSync(join(HERE, 'agents')).filter((f) => f.endsWith('.agent.md'));

/** What to copy where, for a target. */
export function plan(/** @type {string} */ target, /** @type {string[]} */ kinds, /** @type {boolean} */ global) {
  /** @type {{ from: string, to: string }[]} */
  const copies = [];
  const base = global ? homedir() : target;
  const roots = {
    copilot: { skills: join(base, global ? '.copilot' : '.github', 'skills'), agents: join(base, global ? '.copilot' : '.github', 'agents') },
    claude: { skills: join(base, '.claude', 'skills'), agents: join(base, '.claude', 'agents') },
    agents: { skills: join(base, '.agents', 'skills'), agents: null },
  };
  for (const kind of kinds) {
    const r = /** @type {any} */ (roots)[kind];
    if (!r) throw new Error(`Unknown --for ${kind}: use copilot, claude or agents`);
    for (const s of skills()) copies.push({ from: join(HERE, 'skills', s), to: join(r.skills, s) });
    if (r.agents) for (const a of agents()) copies.push({ from: join(HERE, 'agents', a), to: join(r.agents, kind === 'claude' ? a.replace('.agent.md', '.md') : a) });
  }
  return copies;
}

/** The agents to install for when --for isn't given. */
export function defaultKinds(/** @type {string} */ root) {
  return [
    'copilot',
    ...(existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md')) ? ['claude'] : []),
    ...(existsSync(join(root, '.agents')) ? ['agents'] : []),
  ];
}

function main(/** @type {string[]} */ argv) {
  const flag = (/** @type {string} */ k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const global = argv.includes('--global');
  const dry = argv.includes('--dry-run');
  const target = global ? homedir() : argv.find((a, i) => !a.startsWith('--') && !['--for', '--templates'].includes(argv[i - 1]));
  if (!target) {
    console.error('Usage: node tools/install.mjs <project folder> [--for copilot,claude,agents] [--templates <folder>] [--dry-run] | --global [--for copilot,claude,agents]');
    return 2;
  }
  const root = resolve(target);
  if (!existsSync(root)) {
    console.error(`No folder at ${root}`);
    return 2;
  }
  const given = flag('--for');
  const kinds = given ? given.split(',').map((k) => k.trim()).filter(Boolean) : global ? ['copilot', 'claude'] : defaultKinds(root);
  const say = (/** @type {string} */ s) => console.log(`${dry ? '(dry run) ' : ''}${s}`);
  for (const c of plan(root, kinds, global)) {
    say(`copy ${c.to}`);
    if (!dry) {
      mkdirSync(dirname(c.to), { recursive: true });
      cpSync(c.from, c.to, { recursive: true });
    }
  }
  if (!global) {
    for (const name of ['AGENTS.md', ...(existsSync(join(root, 'CLAUDE.md')) ? ['CLAUDE.md'] : [])]) {
      const file = join(root, name);
      const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const after = withSection(before);
      if (after !== before) {
        say(`${before ? 'update' : 'create'} ${file} (the Orchestration section)`);
        if (!dry) writeFileSync(file, after);
      }
    }
    const tpl = flag('--templates');
    if (tpl) {
      const to = resolve(root, tpl);
      say(`copy templates to ${to} (files already there are kept)`);
      if (!dry) cpSync(join(HERE, 'templates'), to, { recursive: true, force: false, errorOnExist: false });
    }
  }
  say(`installed ${skills().length} skills and ${agents().length} agents for ${kinds.join(', ')}${global ? ' (for every project on this computer)' : ''}`);
  if (!global) say('next: fill in the "Project facts" in the Orchestration section of AGENTS.md');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
