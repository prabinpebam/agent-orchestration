#!/usr/bin/env node
// @ts-check
/**
 * The session clock and guard: reviews and roll-overs are scheduled, and the hard rules are enforced, not remembered.
 *
 * Run by GitHub Copilot hooks (written by the installer): `orchestration-clock.json` (sessionStart, postToolUse,
 * preCompact, agentStop) and `orchestration-guard.json` (preToolUse, userPromptSubmitted):
 *
 *   node orchestration-clock.mjs <event>   (the hook's JSON on stdin; prints one JSON object)
 *
 * Clock: counts active time only (a gap between events counts at most AO_IDLE_MIN minutes), asks for a progress review
 * every AO_REVIEW_MIN active minutes and a roll-over after AO_ROLLOVER_MIN active minutes, AO_ROLLOVER_TOOLS tool calls
 * or AO_ROLLOVER_COMPACTIONS compactions. The main chat never rolls over; a coordinator only at its context limits
 * (tool calls, compactions); nobody while a prompt arrived in the last AO_STEER_MIN minutes.
 * Guard (preToolUse): denies shell, subagent, poll and wait tools in a session marked `main`; denies builds, tests and
 * waits in a session marked `coordinator`; denies tests, end-to-end runs, benchmarks and CI waits in the modes `design`
 * and `ux-sooner` (from `mark mode` or the file `.agent-orchestration/mode` in the working folder).
 *
 *   node orchestration-clock.mjs mark <review | rollover> [--session <id>]
 *   node orchestration-clock.mjs mark role <main | coordinator | worker>
 *   node orchestration-clock.mjs mark mode <design | ux-sooner | assumption | production-ready>
 *   node orchestration-clock.mjs status [--session <id>]
 *
 * State lives in AO_CLOCK_DIR (default: the system's temporary folder). Tool arguments are read only to recognise
 * commands; nothing from them is stored or printed. Any error prints `{}`: a broken hook must never block work.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN = 60_000;
export const ROLES = ['main', 'coordinator', 'worker'];
export const MODES = ['design', 'ux-sooner', 'assumption', 'production-ready'];
export const MODE_FILE = join('.agent-orchestration', 'mode');

/** @typedef {{ reviewMin: number, renudgeMin: number, rolloverMin: number, rolloverTools: number, rolloverCompactions: number, idleMin: number, steerMin: number, cmd: string }} Config */
/** @typedef {{ cwd: string, started: number, seen: number, active: number, tools: number, compactions: number, lastReview: number, reviewActive: number, reviewNudged: number, rolloverDue: number, rolloverNudged: number, rolloverBlocked: number, rolledOver: number, handedOverNudged: number, ownerSeen: number, role: string, mode: string }} State */

export const DEFAULTS = /** @type {Config} */ ({ reviewMin: 30, renudgeMin: 5, rolloverMin: 90, rolloverTools: 300, rolloverCompactions: 2, idleMin: 5, steerMin: 10, cmd: 'node .github/hooks/orchestration-clock.mjs' });

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
    idleMin: n('AO_IDLE_MIN', DEFAULTS.idleMin),
    steerMin: n('AO_STEER_MIN', DEFAULTS.steerMin),
    cmd: env.AO_CLOCK_CMD || DEFAULTS.cmd,
  };
}

export function fresh(/** @type {string} */ cwd, /** @type {number} */ now) {
  return /** @type {State} */ ({ cwd, started: now, seen: now, active: 0, tools: 0, compactions: 0, lastReview: now, reviewActive: 0, reviewNudged: 0, rolloverDue: 0, rolloverNudged: 0, rolloverBlocked: 0, rolledOver: 0, handedOverNudged: 0, ownerSeen: 0, role: '', mode: '' });
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

/** Why the session should roll over now, or null. Idle time never counts; the main chat never rolls over. */
export function rolloverReason(/** @type {State} */ s, /** @type {number} */ _now, /** @type {Config} */ c) {
  if (s.role === 'main') return null;
  const active = s.active ?? 0;
  if (s.role !== 'coordinator' && c.rolloverMin > 0 && active >= c.rolloverMin * MIN) return `it has been active ${mins(active)} minutes (limit ${c.rolloverMin}; idle time not counted)`;
  if (c.rolloverTools > 0 && s.tools >= c.rolloverTools) return `it has made ${s.tools} tool calls (limit ${c.rolloverTools})`;
  if (c.rolloverCompactions > 0 && s.compactions >= c.rolloverCompactions) return `its context has been compacted ${s.compactions} times (limit ${c.rolloverCompactions})`;
  return null;
}

export const rolloverSteps = (/** @type {Config} */ c) =>
  `Workers: at the next safe point, commit the verified work, write the handoff (with where the review build is) and a log line. Coordinators: hand the registry to one fresh coordinator; workers keep running. Before creating a successor, check for one already created. After the transfer, run \`${c.cmd} mark rollover\` (add \`--session <id>\` when clocks share a folder) and stop working here.`;

/** The command text of a shell tool call, or ''. */
export function commandOf(/** @type {unknown} */ toolArgs) {
  let a = toolArgs;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      return a;
    }
  }
  if (!a || typeof a !== 'object') return '';
  const o = /** @type {Record<string, unknown>} */ (a);
  return String(o.command ?? o.cmd ?? o.script ?? o.input ?? '');
}

const SHELL = new Set(['bash', 'shell', 'powershell', 'pwsh', 'run_in_terminal', 'runinterminal', 'run_terminal_command', 'terminal', 'write_powershell', 'write_bash']);
const MAIN_DENY = new Set([...SHELL, 'read_powershell', 'read_bash', 'get_terminal_output', 'await_terminal', 'task', 'runsubagent', 'run_subagent', 'read_agent', 'sleep', 'wait']);
const RUN = String.raw`(?:^|[;&|(]\s*|\b(?:npx|exec|dlx|run|uv\s+run)\s+)`;
/** Tests, end-to-end runs, captures, benchmarks and CI waits. */
export const HEAVY = new RegExp(String.raw`${RUN}(?:vitest|jest|mocha|pytest|cypress\s+run|playwright\s+test|node\s+--test)(?![\w-])|\b(?:pnpm|npm|yarn|bun)\b[^;&|\n]*?\s(?:run\s+)?(?:test|bench|e2e)(?::[\w:-]+)?(?=\s|$|["');&|])|\b(?:dotnet|cargo|go)\s+test\b|\bgh\s+run\s+watch\b|\bgh\s+pr\s+checks\b[^;&|\n]*--watch`, 'i');
const BUILD = /\b(?:pnpm|npm|yarn|bun)\b[^;&|\n]*?\s(?:run\s+)?build(?::[\w:-]+)?(?=\s|$|["');&|])|\b(?:dotnet|cargo)\s+build\b|\bmsbuild\b/i;
const WAIT = /\b(?:Start-Sleep|sleep|Wait-Process|Wait-Job)\b|\btimeout\s+\/t\b/i;
const MARK = /orchestration-clock\.mjs["']?\s+(?:mark\s+(role|mode)\s+([\w-]+)|status)\b/;

const deny = (/** @type {string} */ reason) => ({ permissionDecision: 'deny', permissionDecisionReason: `Guard (MANDATORY): ${reason}` });

/** The guard's decision for one tool call; may record a role or mode marked by this session. */
function guard(/** @type {State} */ s, /** @type {{ toolName?: string, toolArgs?: unknown, fileMode?: string }} */ input) {
  const name = String(input.toolName ?? '').toLowerCase();
  const cmd = commandOf(input.toolArgs);
  const mark = MARK.exec(cmd);
  if (mark) {
    if (mark[1] === 'role' && ROLES.includes(mark[2]) && !/--session/.test(cmd)) s.role = mark[2];
    if (mark[1] === 'mode' && MODES.includes(mark[2]) && !/--session/.test(cmd)) s.mode = mark[2];
    return {};
  }
  if (s.role === 'main' && MAIN_DENY.has(name)) return deny(`this is the owner's main chat: it never runs ${name}. Delegate it to a coordinator or worker chat and reply to the owner in one to three lines.`);
  if (!SHELL.has(name) || !cmd) return {};
  const mode = s.mode || input.fileMode || '';
  if ((mode === 'design' || mode === 'ux-sooner') && HEAVY.test(cmd)) return deny(`the mode is ${mode === 'design' ? 'strict design' : 'show me the UX sooner'}; no tests, end-to-end runs, benchmarks or CI waits before the owner approves the design. Run only the build, the type check and the static checks, and show the owner the review build.`);
  if (s.role === 'coordinator' && (HEAVY.test(cmd) || BUILD.test(cmd) || WAIT.test(cmd))) return deny('this is a coordinator: builds, tests and waits run in a worker chat. Dispatch it and end the turn.');
  return {};
}

/**
 * One hook event: the new state and what to say back. Pure, for tests.
 * @param {State | null} state
 * @param {string} event
 * @param {{ cwd?: string, toolName?: string, toolArgs?: unknown, stopHookActive?: boolean, fileMode?: string }} input
 * @param {number} now
 * @param {Config} c
 * @returns {{ state: State, output: Record<string, unknown> }}
 */
export function step(state, event, input, now, c) {
  const s = state ? { ...fresh(input.cwd ?? '', now), ...state } : fresh(input.cwd ?? '', now);
  s.active = (s.active ?? 0) + Math.min(Math.max(0, now - s.seen), c.idleMin * MIN);
  s.seen = now;
  if (event === 'sessionStart') {
    const limits = [c.rolloverMin && `${c.rolloverMin} active minutes`, c.rolloverTools && `${c.rolloverTools} tool calls`, c.rolloverCompactions && `${c.rolloverCompactions} compactions`].filter(Boolean).join(', ');
    return { state: s, output: { additionalContext: `Session clock on (agent-orchestration; mandatory): a progress review every ${c.reviewMin} active minutes; roll over after ${limits || 'no limit'} (idle time not counted; the main chat never rolls over). Mark this session's role once: \`${c.cmd} mark role main|coordinator|worker\`, and the mode with \`${c.cmd} mark mode design|ux-sooner|assumption|production-ready\`; the guard enforces both. Act on every reminder; never disable the clock or loosen its limits.` } };
  }
  if (event === 'userPromptSubmitted') {
    s.ownerSeen = now;
    return { state: s, output: {} };
  }
  if (event === 'preToolUse') return { state: s, output: guard(s, input) };
  if (event === 'preCompact') {
    s.compactions += 1;
    return { state: s, output: {} };
  }
  const steering = c.steerMin > 0 && s.ownerSeen > 0 && now - s.ownerSeen < c.steerMin * MIN;
  if (event === 'agentStop') {
    if (s.rolledOver || input.stopHookActive || steering) return { state: s, output: {} };
    const why = rolloverReason(s, now, c);
    if (!why || s.rolloverBlocked) return { state: s, output: {} };
    s.rolloverBlocked = now;
    return { state: s, output: { decision: 'block', reason: `Session clock (required): this session should roll over, because ${why}. If work remains, roll over now. ${rolloverSteps(c)}` } };
  }
  if (event !== 'postToolUse') return { state: s, output: {} };

  s.tools += 1;
  if (recognise(input.toolName ?? '', input.toolArgs) === 'review') Object.assign(s, { lastReview: now, reviewActive: s.active, reviewNudged: 0 });
  /** @type {string[]} */
  const say = [];
  const renudge = c.renudgeMin * MIN;
  if (s.rolledOver) {
    if (now - s.handedOverNudged >= Math.max(renudge, 10 * MIN)) {
      s.handedOverNudged = now;
      say.push(`Session clock: this session handed over to a new one at ${hhmm(s.rolledOver)}. Don't carry on the work here.`);
    }
    return { state: s, output: say.length ? { additionalContext: say.join('\n\n') } : {} };
  }
  const why = rolloverReason(s, now, c);
  if (why && !steering) {
    if (!s.rolloverDue) s.rolloverDue = now;
    if (now - s.rolloverNudged >= renudge) {
      s.rolloverNudged = now;
      const late = mins(now - s.rolloverDue);
      say.push(`Session clock (required): roll over to a new session as soon as possible, because ${why}${late ? `; due for ${late} minutes` : ''}. ${rolloverSteps(c)}`);
    }
  }
  const sinceReview = s.active - (s.reviewActive ?? 0);
  if (s.role !== 'main' && c.reviewMin > 0 && sinceReview >= c.reviewMin * MIN && now - s.reviewNudged >= renudge) {
    s.reviewNudged = now;
    const late = mins(sinceReview - c.reviewMin * MIN);
    say.push(`Session clock (required): progress review due (last ${hhmm(s.lastReview)}, ${mins(sinceReview)} active minutes ago${late ? `, ${late} overdue` : ''}). Before the next increment, run the throughput-reviewer agent (or the progress-review questions as a separate pass), act on its top finding and log the verdict in one line. Without the agent or the skill tool, run \`${c.cmd} mark review\` when it's done.`);
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

/** The mode written in the working folder's `.agent-orchestration/mode`, or ''. */
export function fileMode(/** @type {string} */ cwd) {
  try {
    const m = readFileSync(join(cwd, MODE_FILE), 'utf8').trim().toLowerCase();
    return MODES.includes(m) ? m : '';
  } catch {
    return '';
  }
}

/** Runs one hook event from its JSON payload; returns what to print. Never throws: a broken hook must not stop work. */
export function hook(/** @type {string} */ event, /** @type {string} */ raw, /** @type {Record<string, string | undefined>} */ env = process.env, now = Date.now()) {
  try {
    const p = /** @type {Record<string, any>} */ (raw.trim() ? JSON.parse(raw) : {});
    const id = String(p.sessionId ?? p.session_id ?? 'unknown');
    const cwd = String(p.cwd ?? process.cwd());
    const dir = clockDir(env);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${safe(id)}.json`);
    const input = { cwd, toolName: p.toolName ?? p.tool_name, toolArgs: p.toolArgs ?? p.tool_input, stopHookActive: Boolean(p.stop_hook_active ?? p.stopHookActive), fileMode: event === 'preToolUse' ? fileMode(cwd) : '' };
    const { state, output } = step(existsSync(file) ? load(file) : null, event, input, now, config(env));
    writeFileSync(file, JSON.stringify(state));
    return JSON.stringify(output);
  } catch {
    return '{}';
  }
}

function main(/** @type {string[]} */ argv) {
  const [cmd, what, value] = argv;
  const usage = 'Usage: status [--session <id>] | mark <review | rollover> [--session <id>] | mark role <main | coordinator | worker> | mark mode <design | ux-sooner | assumption | production-ready>';
  if (cmd === 'mark' || cmd === 'status') {
    const setting = cmd === 'mark' && (what === 'role' || what === 'mode');
    const rest = argv.slice(cmd === 'status' ? 1 : setting ? 3 : 2);
    if ((cmd === 'mark' && !['review', 'rollover', 'role', 'mode'].includes(what)) ||
        (setting && !(what === 'role' ? ROLES : MODES).includes(value)) ||
        (rest.length && (rest.length !== 2 || rest[0] !== '--session' || !rest[1] || rest[1].startsWith('--')))) {
      console.error(usage);
      return 2;
    }
    let found;
    try {
      found = findSession(clockDir(), process.cwd(), rest[1]);
    } catch (error) {
      if (setting) {
        console.log(`The guard hook recorded ${what} ${value} for this session.`);
        return 0;
      }
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
    if (!found) {
      if (setting && !rest[1]) {
        console.log(`The guard hook records ${what} ${value} for this session when hooks are on.`);
        return 0;
      }
      console.error('No matching session clock for this folder.');
      return 1;
    }
    const s = { ...fresh(found.state.cwd, Date.now()), ...found.state };
    const now = Date.now();
    if (cmd === 'mark') {
      if (what === 'review') Object.assign(s, { lastReview: now, reviewActive: s.active, reviewNudged: 0 });
      else if (what === 'rollover') s.rolledOver = now;
      else s[/** @type {'role' | 'mode'} */ (what)] = value;
      writeFileSync(found.file, JSON.stringify(s));
      console.log(`Marked ${setting ? `${what} ${value}` : what} at ${hhmm(now)}.`);
      return 0;
    }
    const why = rolloverReason(s, now, config());
    console.log(`Session started ${hhmm(s.started)} (${mins(s.active)} active min)${s.role ? `, role ${s.role}` : ''}${s.mode ? `, mode ${s.mode}` : ''}, ${s.tools} tool calls, ${s.compactions} compactions; last review ${hhmm(s.lastReview)}; ${s.rolledOver ? `handed over at ${hhmm(s.rolledOver)}` : why ? `roll over now: ${why}` : 'no roll-over due'}.`);
    return 0;
  }
  if (!cmd) {
    console.error(`Usage: orchestration-clock.mjs <sessionStart | userPromptSubmitted | preToolUse | postToolUse | preCompact | agentStop> < payload.json | ${usage.slice(7)}`);
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
