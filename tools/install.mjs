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
- **Reference products:** <the products whose current behaviour settles how something should work, in order of preference, and where decisions are recorded with their sources; or "none">
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

**Keep the main chat free.** The main chat is for triage only; everything else is delegated, and a main chat that isn't ready for the owner's next input is a failure. For every owner prompt it reads live state (unread messages, completion records, the live worker list and the durable registry/queue), classifies the input (a new item, a change of direction, a priority change, a rule change or a question), finds the affected tracks, steers, queues or launches, updates the execution plan, and ends with a one- to three-line reply. Long or multi-track work runs as main chat (triage only) → one delivery coordinator (registry, dependency map, routing, verification) → bounded workers; the main chat routes new direction to the current coordinator from the registry, never creates a second one, and doesn't re-verify routine deliveries. Workers do implementation, builds, test suites and long commands. Keep coordinator turns short and end them; no sleeps, polling loops, blocking waits or watchers that hold a turn open. One writer per working copy; check for an existing worker or successor before any launch.

**A quiet main chat.** Sub-chats message the main chat only for a decision only the owner can make, something new ready to try, or a safety blocker: at most 3 plain lines, no IDs or jargon. Acknowledgements, milestones, dispatch and transfer notes go to the coordinator and the records. The main chat ignores stale and routine notes (one short line when a reply can't be avoided) and anything from a retired coordinator. Every worker assignment and handoff carries this rule.

**Parallel tracks.** Independent items don't wait in one queue: the coordinator keeps a dependency map in the registry and dispatches every ready item, each with its own worktree and branch, worker and completion record. Build an uncertain piece as an isolated proof of concept first. Integrate tracks one at a time and run the checks again on the combined result; when two touch the same files, rebase the second onto the first. Before deleting a worktree, remove shared dependency links in it (such as a \`node_modules\` junction) non-recursively.

**Decide, don't ask.** Settle how something should behave from the reference products or prior decisions named below, and record the source. Ask the owner only for decisions that are theirs: irreversible actions, licences, publishing, real accounts, deleting their data.

**Yielding is not finishing.** Completion is event-driven, and ending a coordinator turn is not completing the owner's task: never mark it complete to silence keep-working reminders while dispatched or queued work remains; answer each reminder in one line; where the host can't idle with work pending, say so and use its supported continuation. At the same session limits, hand the registry to one fresh coordinator without restarting workers or resetting their clocks; explicitly mark the old clock's roll-over after transfer. Use \`--session <id>\` for clock commands when sessions share a folder. This was learned in VS Code agent sessions; other tools differ. Without parallel chats or notifications, keep a file queue, use short turns and start-of-turn status checks, and ask the owner to re-prompt (\`orchestrate\`).

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
export function clockHooks(/** @type {string} */ target, /** @type {boolean} */ global) {
  const dir = hooksDir(global ? homedir() : target, global);
  const script = global ? join(dir, CLOCK).replace(/\\/g, '/') : `.github/hooks/${CLOCK}`;
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
  if (kinds.includes('copilot')) {
    const h = clockHooks(root, global);
    if (existsSync(h.file)) say(`keep ${h.file} (the session clock's hooks and limits)`);
    else {
      say(`create ${h.file} (the session clock's hooks)`);
      if (!dry) {
        mkdirSync(dirname(h.file), { recursive: true });
        writeFileSync(h.file, h.text);
      }
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
  say(`installed ${skills().length} skills and ${agents().length} agents for ${kinds.join(', ')}${kinds.includes('copilot') ? ', with the session clock' : ''}${global ? ' (for every project on this computer)' : ''}`);
  if (!global) say('next: fill in the "Project facts" in the Orchestration section of AGENTS.md');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
