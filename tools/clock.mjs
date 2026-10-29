#!/usr/bin/env node
// @ts-check
/**
 * The session clock: makes progress reviews and session roll-overs scheduled, not remembered.
 *
 * Run by an agent tool's hooks (GitHub Copilot: `.github/hooks/orchestration-clock.json`, written by the installer):
 *
 *   node orchestration-clock.mjs <sessionStart | postToolUse | preCompact | agentStop>   (the hook's JSON on stdin)
 *
 * It keeps one small state file per session (how old it is, how many tool calls and compactions, when the last
 * review was) and answers with a reminder the agent sees after its next tool result:
 * - a progress review is due (every AO_REVIEW_MIN minutes, default 30), repeated every AO_RENUDGE_MIN (5) until done;
 * - the session should roll over to a new one (after AO_ROLLOVER_MIN minutes, default 90, or AO_ROLLOVER_TOOLS tool
 *   calls, default 300, or AO_ROLLOVER_COMPACTIONS compactions, default 2), repeated until handover is explicitly marked.
 * At the end of a turn with a roll-over due, it asks for one more turn to do it (once).
 *
 * A review counts as done when the agent runs the `throughput-reviewer` agent, loads the `progress-review` skill, or
 * runs `node orchestration-clock.mjs mark review`. Only a successful `mark rollover` acknowledges a handover.
 * Starting a worker session must never silence the coordinator's clock.
 *
 *   node orchestration-clock.mjs mark <review | rollover> [--session <id>]
 *   node orchestration-clock.mjs status [--session <id>]
 * Without an ID, the folder must have exactly one clock; never guess between a coordinator and its workers.
 *
 * State lives in AO_CLOCK_DIR (default: the system's temporary folder), never in the project. Tool arguments are read
 * only to recognise those commands; nothing from them is stored or printed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN = 60_000;

/** @typedef {{ reviewMin: number, renudgeMin: number, rolloverMin: number, rolloverTools: number, rolloverCompactions: number, cmd: string }} Config */
/** @typedef {{ cwd: string, started: number, seen: number, tools: number, compactions: number, lastReview: number, reviewNudged: number, rolloverDue: number, rolloverNudged: number, rolloverBlocked: number, rolledOver: number, handedOverNudged: number }} State */

export const DEFAULTS = /** @type {Config} */ ({ reviewMin: 30, renudgeMin: 5, rolloverMin: 90, rolloverTools: 300, rolloverCompactions: 2, cmd: 'node .github/hooks/orchestration-clock.mjs' });

/** The limits, from the hook's environment. */
export function config(/** @type {Record<string, string | undefined>} */ env = process.env) {
  const n = (/** @type {string} */ k, /** @type {number} */ d) => {
    const v = Number(env[k]);
    return env[k] != null && env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : d;
  };
  return {
    reviewMin: n('AO_REVIEW_MIN', DEFAULTS.reviewMin),
    renudgeMin: n('AO_RENUDGE_MIN', DEFAULTS.renudgeMin),
    rolloverMin: n('AO_ROLLOVER_MIN', DEFAULTS.rolloverMin),
    rolloverTools: n('AO_ROLLOVER_TOOLS', DEFAULTS.rolloverTools),
    rolloverCompactions: n('AO_ROLLOVER_COMPACTIONS', DEFAULTS.rolloverCompactions),
    cmd: env.AO_CLOCK_CMD || DEFAULTS.cmd,
  };
}

export function fresh(/** @type {string} */ cwd, /** @type {number} */ now) {
  return /** @type {State} */ ({ cwd, started: now, seen: now, tools: 0, compactions: 0, lastReview: now, reviewNudged: 0, rolloverDue: 0, rolloverNudged: 0, rolloverBlocked: 0, rolledOver: 0, handedOverNudged: 0 });
}

const hhmm = (/** @type {number} */ t) => new Date(t).toTimeString().slice(0, 5);
const mins = (/** @type {number} */ ms) => Math.max(0, Math.round(ms / MIN));

/** Review tools only. Mark commands update their selected clock directly, only when they succeed. */
export function recognise(/** @type {string} */ toolName, /** @type {unknown} */ toolArgs) {
  const args = /** @type {Record<string, unknown>} */ (toolArgs && typeof toolArgs === 'object' ? toolArgs : {});
  const name = toolName.toLowerCase();
  const agent = String(args.agent_type ?? args.agentType ?? args.subagent_type ?? args.agent ?? '');
  if (agent === 'throughput-reviewer') return 'review';
  if (name === 'skill' && String(args.skill ?? args.name ?? '') === 'progress-review') return 'review';
  return null;
}

/** Why the session should roll over now, or null. */
export function rolloverReason(/** @type {State} */ s, /** @type {number} */ now, /** @type {Config} */ c) {
  if (c.rolloverMin > 0 && now - s.started >= c.rolloverMin * MIN) return `it has run ${mins(now - s.started)} minutes (limit ${c.rolloverMin})`;
  if (c.rolloverTools > 0 && s.tools >= c.rolloverTools) return `it has made ${s.tools} tool calls (limit ${c.rolloverTools})`;
  if (c.rolloverCompactions > 0 && s.compactions >= c.rolloverCompactions) return `its context has been compacted ${s.compactions} times (limit ${c.rolloverCompactions})`;
  return null;
}

export const rolloverSteps = (/** @type {Config} */ c) =>
  `Workers: at the next safe point (the current step checked, not mid-edit), commit the verified work, write the handoff (with where the review build is), and add a log line. Coordinators: hand the registry/queue to one fresh coordinator without waiting for or restarting workers; their clocks keep running. Before either role creates a successor, check unread messages and live workers for one already created. Resume with the handoff, same role, mode and bounds. After ownership transfers, run \`${c.cmd} mark rollover\` (add \`--session <id>\` when clocks share a folder). Without a session tool, give the owner the resume prompt, then mark the roll-over. A worker launch is not a roll-over. Stop working in this old session; one writer per working copy. This is required; don't start another increment first.`;

/**
 * One hook event: the new state and what to say back. Pure, for tests.
 * @param {State | null} state
 * @param {string} event
 * @param {{ cwd?: string, toolName?: string, toolArgs?: unknown, stopHookActive?: boolean }} input
 * @param {number} now
 * @param {Config} c
 * @returns {{ state: State, output: Record<string, unknown> }}
 */
export function step(state, event, input, now, c) {
  const s = state ? { ...state } : fresh(input.cwd ?? '', now);
  s.seen = now;
  if (event === 'sessionStart') {
    const limits = [c.rolloverMin && `${c.rolloverMin} minutes`, c.rolloverTools && `${c.rolloverTools} tool calls`, c.rolloverCompactions && `${c.rolloverCompactions} compactions`].filter(Boolean).join(', ');
    return { state: s, output: { additionalContext: `Session clock on (agent-orchestration; mandatory): a progress review every ${c.reviewMin} minutes; roll over to a new session after ${limits || 'no limit'}, whichever comes first. The clock reminds you after tool results. Its reminders are required: act on each one before the next increment, and never disable the clock or loosen its limits; only the owner changes them.` } };
  }
  if (event === 'preCompact') {
    s.compactions += 1;
    return { state: s, output: {} };
  }
  if (event === 'agentStop') {
    if (s.rolledOver || input.stopHookActive) return { state: s, output: {} };
    const why = rolloverReason(s, now, c);
    if (!why || s.rolloverBlocked) return { state: s, output: {} };
    s.rolloverBlocked = now;
    return { state: s, output: { decision: 'block', reason: `Session clock (required): this session should roll over, because ${why}. If work remains, roll over now. ${rolloverSteps(c)} If the owner is talking with you and no work is running, ask them in one line whether to roll over now, then stop.` } };
  }
  if (event !== 'postToolUse') return { state: s, output: {} };

  s.tools += 1;
  const seen = recognise(input.toolName ?? '', input.toolArgs);
  if (seen === 'review') {
    s.lastReview = now;
    s.reviewNudged = 0;
  }
  /** @type {string[]} */
  const say = [];
  const renudge = c.renudgeMin * MIN;
  if (s.rolledOver) {
    if (now - s.handedOverNudged >= Math.max(renudge, 10 * MIN)) {
      s.handedOverNudged = now;
      say.push(`Session clock: this session handed over to a new one at ${hhmm(s.rolledOver)}. Don't carry on the work here; the new session has it.`);
    }
    return { state: s, output: say.length ? { additionalContext: say.join('\n\n') } : {} };
  }
  const why = rolloverReason(s, now, c);
  if (why) {
    if (!s.rolloverDue) s.rolloverDue = now;
    if (now - s.rolloverNudged >= renudge) {
      s.rolloverNudged = now;
      const late = mins(now - s.rolloverDue);
      say.push(`Session clock (required): roll over to a new session as soon as possible, because ${why}${late ? `; due for ${late} minutes` : ''}. ${rolloverSteps(c)}`);
    }
  }
  if (c.reviewMin > 0 && now - s.lastReview >= c.reviewMin * MIN && now - s.reviewNudged >= renudge) {
    s.reviewNudged = now;
    const late = mins(now - s.lastReview - c.reviewMin * MIN);
    say.push(`Session clock (required): progress review due (last ${hhmm(s.lastReview)}, ${mins(now - s.lastReview)} minutes ago${late ? `, ${late} overdue` : ''}). Before the next increment, run the throughput-reviewer agent (or the progress-review questions as a separate pass), act on its top finding and write the verdict as one progress log line. Without the agent or the skill tool, run \`${c.cmd} mark review\` when it's done.`);
  }
  return { state: s, output: say.length ? { additionalContext: say.join('\n\n') } : {} };
}

export const clockDir = (/** @type {Record<string, string | undefined>} */ env = process.env) => resolve(env.AO_CLOCK_DIR || join(tmpdir(), 'agent-orchestration-clock'));
const safe = (/** @type {string} */ id) => id.replace(/[^\w.-]/g, '_').slice(0, 120) || 'unknown';

function load(/** @type {string} */ file) {
  try {
    return /** @type {State} */ (JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/** Whether two folders are the same; on Windows, paths are case-insensitive (a hook may report `c:\x` for `C:\x`). */
export function samePath(/** @type {string} */ a, /** @type {string} */ b, platform = process.platform) {
  if (platform === 'win32') return win32.resolve(a || '.').toLowerCase() === win32.resolve(b || '.').toLowerCase();
  return resolve(a || '.') === resolve(b || '.');
}

/** Select a clock explicitly, or the only clock in a folder. Ambiguity must never mark another role's clock. */
export function findSession(/** @type {string} */ dir, /** @type {string} */ cwd, /** @type {string | undefined} */ id = undefined) {
  if (!existsSync(dir)) return null;
  let found = /** @type {{ file: string, state: State } | null} */ (null);
  const files = id ? [`${safe(id)}.json`] : readdirSync(dir).filter((x) => x.endsWith('.json'));
  for (const f of files) {
    const state = load(join(dir, f));
    if (!state || !samePath(state.cwd, cwd)) continue;
    if (found) throw new Error('More than one session clock for this folder; pass --session <id>.');
    found = { file: join(dir, f), state };
  }
  return found;
}

/** Runs one hook event from its JSON payload; returns what to print. Never throws: a broken clock must not stop work. */
export function hook(/** @type {string} */ event, /** @type {string} */ raw, /** @type {Record<string, string | undefined>} */ env = process.env, now = Date.now()) {
  try {
    const p = /** @type {Record<string, any>} */ (raw.trim() ? JSON.parse(raw) : {});
    const id = String(p.sessionId ?? p.session_id ?? 'unknown');
    const cwd = String(p.cwd ?? process.cwd());
    const dir = clockDir(env);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${safe(id)}.json`);
    const input = { cwd, toolName: p.toolName ?? p.tool_name, toolArgs: p.toolArgs ?? p.tool_input, stopHookActive: Boolean(p.stop_hook_active ?? p.stopHookActive) };
    const { state, output } = step(existsSync(file) ? load(file) : null, event, input, now, config(env));
    writeFileSync(file, JSON.stringify(state));
    return JSON.stringify(output);
  } catch {
    return '{}';
  }
}

function main(/** @type {string[]} */ argv) {
  const [cmd, what] = argv;
  if (cmd === 'mark' || cmd === 'status') {
    const rest = argv.slice(cmd === 'mark' ? 2 : 1);
    if ((cmd === 'mark' && !['review', 'rollover'].includes(what)) ||
        (rest.length && (rest.length !== 2 || rest[0] !== '--session' || !rest[1] || rest[1].startsWith('--')))) {
      console.error('Usage: status [--session <id>] | mark <review | rollover> [--session <id>]');
      return 2;
    }
    let found;
    try {
      found = findSession(clockDir(), process.cwd(), rest[1]);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
    if (!found) {
      console.error('No matching session clock for this folder.');
      return 1;
    }
    const s = found.state;
    const now = Date.now();
    if (cmd === 'mark') {
      if (what === 'review') Object.assign(s, { lastReview: now, reviewNudged: 0 });
      else s.rolledOver = now;
      writeFileSync(found.file, JSON.stringify(s));
      console.log(`Marked ${what} at ${hhmm(now)}.`);
      return 0;
    }
    const why = rolloverReason(s, now, config());
    console.log(`Session started ${hhmm(s.started)} (${mins(now - s.started)} min), ${s.tools} tool calls, ${s.compactions} compactions; last review ${hhmm(s.lastReview)}; ${s.rolledOver ? `handed over at ${hhmm(s.rolledOver)}` : why ? `roll over now: ${why}` : 'no roll-over due'}.`);
    return 0;
  }
  if (!cmd) {
    console.error('Usage: orchestration-clock.mjs <sessionStart | postToolUse | preCompact | agentStop> < payload.json | mark <review | rollover> [--session <id>] | status [--session <id>]');
    return 2;
  }
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  process.stdout.write(hook(cmd, raw));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
