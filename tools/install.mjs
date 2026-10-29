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
 *   again to update; the section's filled-in facts are kept, and a fact the harness added since is added as its placeholder.
 * - For Copilot, the session clock goes to `.github/hooks/` (with --global: `~/.copilot/hooks/`): `orchestration-clock.mjs`
 *   and the hook configuration `orchestration-clock.json`, which runs it on session start, after each tool call, before
 *   a compaction and at the end of a turn. A configuration already there is kept, with any limits tuned in it.
 * - --templates copies the work plan, progress log and handoff starters into a folder, keeping any file already there.
 * Without --for it installs for Copilot, plus Claude Code when the project has .claude/ or CLAUDE.md, plus the
 * open skills layout when the project has .agents/.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argumentsFor, copyTree, prepare, finish, output, safe } from './install-contract.mjs';

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
- **Coordinator registry:** <session-store location or ignored queue file, readable by a successor; task, owner worker, working copy, state, trigger and completion signal; message routes or completion-record paths>
- **Branches and merges:** <work branch or worktree> · merge with \`<…>\` · deploy watched with \`<…>\` · the agent may: <merge, push, deploy, or none: the owner does> · must never break: <the live product, an API>
- **Review build:** <how to start and refresh it (its own checkout, such as a git worktree at the last validated commit, with its own port or user-data folder and demo data), and where it is (an address, or the app and how to open it)>
- **Reviews and escalation:** review every <30> minutes · roll over to a new session after <90> minutes, <300> tool calls or <2> compactions (the session clock's limits, in its hook configuration) · always escalate: <what waits for the owner>`;
  return `${START}
## Orchestration (agent-orchestration harness)

This project uses the [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) skills to carry out work. Start with the \`orchestrate\` skill: it picks the mode (show me the UX sooner, prove the risky assumption, make this production-ready; work with me or keep going unattended) and routes to \`execution-modes\`, \`stage-validation\`, \`progress-review\` and \`coordinate\`. Agent: \`throughput-reviewer\` (about every 30 minutes of running work). The session clock (Copilot hooks in \`.github/hooks/orchestration-clock.json\`) is **mandatory**: it says when a review is due and when to roll over to a new session. Act on every reminder before the next increment, and never disable it or loosen its limits without the owner. Where the tool has no hooks, keep time by hand on the same limits. A **review build** is always running for the owner to try: built from the last validated commit, isolated from development (its own checkout, port or user-data folder, and demo data), refreshed at each validated increment or stage close, and named in every status report and handoff. These skills decide how work is run, not what to build; product intent comes from the files named below when there are any.

**Keep the coordinator free.** The main chat only reads prompts and live state, triages, queues, routes, steers or stops workers, checks deliveries cheaply and reports. Workers do implementation, builds, test suites and long commands. Keep coordinator turns short and end them; no sleeps, polling loops, blocking waits or watchers that hold a turn open. At every turn, read unread messages, completion records, the live worker list and the durable registry/queue before dispatch. One writer per working copy; check for an existing worker or successor before any launch. Completion is event-driven, and ending a coordinator turn is not completing the owner's task: never mark it complete to silence keep-working reminders while dispatched work remains; where the host can't idle with work pending, say so and use its supported continuation. At the same session limits, hand the registry to one fresh coordinator without restarting workers or resetting their clocks; explicitly mark the old clock's roll-over after transfer. Use \`--session <id>\` for clock commands when sessions share a folder. This was learned in VS Code agent sessions; other tools differ. Without parallel chats or notifications, keep a file queue, use short turns and start-of-turn status checks, and ask the owner to re-prompt (\`orchestrate\`).

${mergeFacts(facts, defaultFacts)}
${END}`;
}

/** The project's filled-in facts, plus any fact the harness added since (as its placeholder line), before the last fact. */
export function mergeFacts(/** @type {string | null} */ facts, /** @type {string} */ defaults) {
  if (!facts) return defaults;
  const label = (/** @type {string} */ line) => /^- \*\*([^*]+):\*\*/.exec(line)?.[1];
  const missing = defaults.split('\n').filter((l) => label(l) && !facts.includes(`**${label(l)}:**`));
  if (!missing.length) return facts;
  const lines = facts.split('\n');
  let at = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) if (label(lines[i])) { at = i; break; }
  lines.splice(at, 0, ...missing);
  return lines.join('\n');
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
    if (kind === 'copilot') copies.push({ from: join(HERE, 'tools', 'clock.mjs'), to: join(hooksDir(base, global), CLOCK) });
  }
  return copies;
}

export const CLOCK = 'orchestration-clock.mjs';
export const CLOCK_HOOKS = 'orchestration-clock.json';
const hooksDir = (/** @type {string} */ base, /** @type {boolean} */ global) => join(base, global ? '.copilot' : '.github', 'hooks');

/** The Copilot hook configuration that runs the session clock, and where it goes. */
export function clockHooks(/** @type {string} */ target, /** @type {boolean} */ global, logicalRoot = global ? homedir() : target) {
  const dir = hooksDir(global ? homedir() : target, global);
  const script = global ? join(logicalRoot, '.copilot', 'hooks', CLOCK).replace(/\\/g, '/') : `.github/hooks/${CLOCK}`;
  const cmd = `node ${global ? `"${script}"` : script}`;
  const env = { AO_REVIEW_MIN: '30', AO_ROLLOVER_MIN: '90', AO_ROLLOVER_TOOLS: '300', AO_ROLLOVER_COMPACTIONS: '2', AO_CLOCK_CMD: cmd };
  const entry = (/** @type {string} */ event) => [{ type: 'command', command: `${cmd} ${event}`, timeoutSec: 10, env }];
  const json = { version: 1, hooks: Object.fromEntries(['sessionStart', 'postToolUse', 'preCompact', 'agentStop'].map((e) => [e, entry(e)])) };
  return { file: join(dir, CLOCK_HOOKS), text: `${JSON.stringify(json, null, 2)}\n` };
}

/** The agents to install for when --for isn't given. */
export function defaultKinds(/** @type {string} */ root) {
  return [
    'copilot',
    ...(existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md')) ? ['claude'] : []),
    ...(existsSync(join(root, '.agents')) ? ['agents'] : []),
  ];
}

export function contract(argv) {
  const o = argumentsFor(argv, ['logical-root']);
  if (!o.target && !o.global) throw Object.assign(new Error('Choose a project folder or --global.'), { code: 2 });
  const root = resolve(o.global ? homedir() : o.target);
  if (!o.kinds.length) {
    if (o.json || !process.stdin.isTTY) throw Object.assign(new Error('Choose --for copilot,claude,agents explicitly.'), { code: 2 });
    o.kinds = defaultKinds(root);
  }
  const entries = [];
  const kept = [];
  for (const c of plan(root, o.kinds, o.global)) {
    const to = c.to.slice(root.length + 1).replaceAll('\\', '/');
    const from = c.from.slice(HERE.length + 1).replaceAll('\\', '/');
    if (from.startsWith('skills/')) entries.push(...copyTree(HERE, from, to));
    else entries.push({ path: to, bytes: readFileSync(c.from) });
  }
  if (o.kinds.includes('copilot')) {
    const h = clockHooks(root, o.global, o['logical-root'] ? resolve(o['logical-root']) : root);
    if (existsSync(h.file) && !o.uninstall) kept.push(h.file);
    entries.push({ path: h.file.slice(root.length + 1).replaceAll('\\', '/'), bytes: Buffer.from(h.text), policy: 'keep' });
  }
  if (!o.global) {
    for (const name of ['AGENTS.md', ...(existsSync(join(root, 'CLAUDE.md')) ? ['CLAUDE.md'] : [])]) entries.push({ path: name, section: { start: START, end: END, transform: withSection } });
    if (o.templates) { safe(root, o.templates); entries.push(...copyTree(HERE, 'templates', o.templates, 'keep')); }
  }
  const allowed = (p) => ['AGENTS.md', 'CLAUDE.md'].includes(p) && !o.global
    || ['.github', '.copilot', '.claude', '.agents'].some((d) => p.startsWith(`${d}/skills/`) && skills().some((s) => p.startsWith(`${d}/skills/${s}/`))
      || p.startsWith(`${d}/agents/`) && agents().some((a) => p === `${d}/agents/${d === '.claude' ? a.replace('.agent.md', '.md') : a}`)
      || ['.github', '.copilot'].includes(d) && [CLOCK, CLOCK_HOOKS].some((f) => p === `${d}/hooks/${f}`))
    || !!o.templates && p.startsWith(`${o.templates}/`);
  const result = finish(prepare({ id: 'agent-orchestration', root, entries, allowed, uninstall: o.uninstall, effects: ['writes-project-files', 'runs-hooks'], settings: { kinds: o.kinds, global: !!o.global, templates: o.templates ?? null } }), o, 'Fill in the Orchestration Project facts. The session clock is mandatory.');
  result.kept = kept;
  if (!o.json && result.status === 'ok') {
    for (const file of kept) console.log(`keep ${file} (the session clock’s hooks and limits)`);
    console.log(`${o['dry-run'] ? 'planned' : o.uninstall ? 'removed' : 'installed'} ${skills().length} skills and ${agents().length} agents for ${o.kinds.join(', ')}${o.kinds.includes('copilot') ? ', with the session clock' : ''}`);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = output(() => contract(process.argv.slice(2)), process.argv.slice(2));
