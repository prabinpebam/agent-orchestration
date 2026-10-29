// Standalone contract engine. Keep the identical vendored copies in consuming kits in sync.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, rmSync, rmdirSync, chmodSync } from 'node:fs';
import { resolve, dirname, relative, sep, parse, join } from 'node:path';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fail = (message, code = 1) => { throw Object.assign(new Error(message), { code }); };
const stat = (file) => { try { return lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
export function safe(root, name = '') {
  if (name && (typeof name !== 'string' || name.includes('\\') || name.split('/').some((p) => !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]|[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p)))) fail(`Unsafe path: ${name}`);
  const target = resolve(root, name);
  if (relative(resolve(root), target).startsWith('..')) fail(`Path escapes the target: ${name}`);
  let at = parse(target).root;
  for (const part of target.slice(at.length).split(sep)) {
    at = join(at, part);
    const s = stat(at);
    if (s?.isSymbolicLink() || s?.isFile() && s.nlink > 1) fail(`Linked path is not allowed: ${at}`);
  }
  return target;
}
const bytesAt = (root, path) => {
  const file = safe(root, path), s = stat(file);
  if (!s) return null;
  if (!s.isFile()) fail(`Not a regular file: ${path}`);
  return readFileSync(file);
};
export function filesUnder(root, folder = '') {
  const out = [];
  for (const name of readdirSync(safe(root, folder)).sort()) {
    const path = folder ? `${folder}/${name}` : name, file = safe(root, path);
    if (stat(file).isDirectory()) out.push(...filesUnder(root, path));
    else if (stat(file).isFile()) out.push(path);
    else fail(`Not a regular source: ${path}`);
  }
  return out;
}
export function copyTree(source, folder, destination, policy = 'managed') {
  return filesUnder(source, folder).map((path) => ({ path: `${destination}/${path.slice(folder.length + 1)}`, bytes: readFileSync(safe(source, path)), policy }));
}
export function argumentsFor(argv, extra = []) {
  const out = { kinds: [] };
  const values = new Set(['for', 'templates', 'approve-plan', ...extra]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--global', '--dry-run', '--json', '--uninstall', '--yes'].includes(a)) out[a.slice(2)] = true;
    else if (a.startsWith('--') && values.has(a.slice(2))) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`Missing value: ${a}`);
      out[a.slice(2)] = argv[++i];
    } else if (a.startsWith('-') || out.target) fail(`Unknown argument: ${a}`);
    else out.target = a;
  }
  if (out.for) out.kinds = [...new Set(out.for.split(',').map((k) => ({ 'claude-code': 'claude', codex: 'agents', cursor: 'agents' })[k] ?? k))];
  if (out.kinds.some((k) => !['copilot', 'claude', 'agents'].includes(k))) fail('Choose copilot, claude, or agents.');
  return out;
}
function sectionParts(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 && b < 0) return null;
  if (a < 0 || b < a || text.indexOf(start, a + 1) >= 0 || text.indexOf(end, b + 1) >= 0) fail('Malformed or duplicate managed section.');
  return { a, b: b + end.length, text: text.slice(a, b + end.length) };
}
export function prepare({ id, root, entries, effects = [], uninstall = false, settings = {}, allowed }) {
  safe(root);
  if (!stat(root)?.isDirectory()) fail('The target folder must already exist.');
  const statePath = `.kit-state/${id}.json`, raw = bytesAt(root, statePath);
  let old = raw ? JSON.parse(raw) : { version: 1, id, files: {}, directories: [] };
  if (old.version !== 1 || old.id !== id || !old.files || !Array.isArray(old.directories)) fail('Invalid kit ownership record.');
  const permitted = (path) => path === statePath || allowed(path);
  for (const [path, record] of Object.entries(old.files)) {
    safe(root, path);
    if (!permitted(path) || !/^[a-f0-9]{64}$/.test(record.hash) || !(record.before === null || typeof record.before === 'string')) fail(`Invalid owned path: ${path}`);
  }
  for (const dir of old.directories) {
    safe(root, dir);
    if (dir !== '.kit-state' && !Object.keys(old.files).some((path) => path.startsWith(`${dir}/`))) fail(`Invalid owned directory: ${dir}`);
  }
  const desired = new Map(), collisions = new Set();
  for (const entry of entries) {
    safe(root, entry.path);
    const key = entry.path.toLowerCase();
    if (!permitted(entry.path) || collisions.has(key)) fail(`Invalid or duplicate destination: ${entry.path}`);
    collisions.add(key); desired.set(entry.path, entry);
  }
  const next = { version: 1, id, settings, files: {}, directories: [...old.directories] };
  const operations = [], conflicts = [];
  const push = (path, before, bytes) => {
    if (before && bytes && before.equals(bytes) || before === null && bytes === null) return;
    operations.push({ path, before, bytes, mode: stat(safe(root, path))?.mode });
  };
  // Uninstall touches only recorded paths; unowned files, including kept starters that already existed, are not the kit's.
  for (const path of uninstall ? Object.keys(old.files) : new Set([...Object.keys(old.files), ...desired.keys()])) {
    const previous = old.files[path], entry = uninstall ? null : desired.get(path), before = bytesAt(root, path);
    if (entry?.policy === 'keep' && before && !previous) continue;
    let after = entry?.bytes ?? null, record = previous;
    if (entry?.section) {
      const { start, end, transform } = entry.section;
      const text = before?.toString('utf8') ?? (previous?.section ? `${previous.section.installed}\n` : '');
      const current = sectionParts(text, start, end);
      const fixed = (value) => value.replace(/\r\n/g, '\n').replace(/### Project facts[\s\S]*$/, '');
      if (previous?.section && before && (!current || fixed(current.text) !== fixed(previous.section.installed))) { conflicts.push(path); continue; }
      after = Buffer.from(transform(text));
      const segment = sectionParts(after.toString('utf8'), start, end).text;
      record = { ...previous, before: previous ? previous.before : (before?.toString('base64') ?? null), section: { start, end, installed: segment, original: previous?.section ? previous.section.original : sectionParts(text, start, end)?.text ?? null } };
    } else if (previous?.section && !entry) {
      const text = before?.toString('utf8') ?? '', s = previous.section, part = sectionParts(text, s.start, s.end);
      if (part && part.text !== s.installed) { conflicts.push(path); continue; }
      // The hash vouches for the whole file only while it holds nothing but this kit's writes; otherwise remove just the section.
      if (before && digest(before) === previous.hash) after = previous.before === null ? null : Buffer.from(previous.before, 'base64');
      else if (part) {
        const head = text.slice(0, part.a), tail = text.slice(part.b);
        let rest = s.original != null ? head + s.original + tail : head.trimEnd() + (head.trim() && tail.trim() ? '\n\n' : '') + tail.trimStart();
        if (s.original == null && rest && !rest.endsWith('\n')) rest += '\n';
        after = previous.before === null && !rest.trim() ? null : Buffer.from(rest);
      }
      else after = before;
    } else if (entry?.policy === 'keep' && before && previous) {
      after = before;
    } else {
      if (before && (!previous || digest(before) !== previous.hash) && (!entry || !before.equals(after))) { conflicts.push(path); continue; }
      if (!entry && previous) after = previous.before === null ? null : Buffer.from(previous.before, 'base64');
    }
    if (entry) {
      next.files[path] = { ...record, before: previous ? previous.before : (record?.before ?? before?.toString('base64') ?? null), hash: digest(after) };
      // A section file may also hold owner text or other kits' sections; only a file still exactly as this kit left it renews the whole-file hash.
      if (entry.section && previous && !(before && digest(before) === previous.hash)) next.files[path].hash = previous.hash;
      // Keep user-edited starter files, but do not claim their edits as generated bytes.
      if (entry.policy === 'keep' && previous && before && digest(before) !== previous.hash) next.files[path].hash = previous.hash;
    }
    push(path, before, after);
  }
  for (const op of operations.filter((o) => o.bytes)) {
    let dir = op.path.split('/').slice(0, -1).join('/');
    while (dir) {
      if (!stat(safe(root, dir)) && !next.directories.includes(dir)) next.directories.push(dir);
      dir = dir.split('/').slice(0, -1).join('/');
    }
  }
  if (!stat(safe(root, '.kit-state')) && !next.directories.includes('.kit-state')) next.directories.push('.kit-state');
  next.directories.sort();
  push(statePath, raw, uninstall ? null : Buffer.from(json(next)));
  const plan = {
    contractVersion: 1, id, root: resolve(root), uninstall, effects: [...new Set(effects)], network: false,
    writes: operations.filter((o) => o.bytes).map((o) => ({ path: o.path, sha256: digest(o.bytes), before: o.before ? digest(o.before) : null })),
    deletes: operations.filter((o) => !o.bytes).map((o) => ({ path: o.path, before: digest(o.before) })),
    conflicts, settings,
  };
  plan.digest = digest(JSON.stringify(plan));
  return { plan, operations, directories: uninstall ? next.directories : [] };
}
export function apply(prepared, { beforeWrite } = {}) {
  const { plan, operations } = prepared, root = plan.root;
  if (plan.conflicts.length) fail('Local edits need a decision; no files changed.', 2);
  const mutex = safe(root, '.kit-transaction'), stage = safe(root, `.kit-stage-${randomUUID()}`);
  try { mkdirSync(mutex); } catch { fail('Another kit operation may be running. Preserve its transaction folder.'); }
  const applied = [], created = [];
  const ensure = (folder) => { if (stat(folder)) return; ensure(dirname(folder)); mkdirSync(folder); created.push(folder); };
  let failedRollback = false;
  try {
    mkdirSync(stage);
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i], now = bytesAt(root, op.path);
      if (now === null ? op.before !== null : !now.equals(op.before)) fail(`Changed since planning: ${op.path}`);
      if (op.bytes) writeFileSync(join(stage, `${i}.new`), op.bytes, { flag: 'wx' });
    }
    for (let i = 0; i < operations.length; i++) {
      beforeWrite?.(operations[i], i);
      const op = operations[i], file = safe(root, op.path), now = bytesAt(root, op.path);
      if (now === null ? op.before !== null : !now.equals(op.before)) fail(`Changed during install: ${op.path}`);
      ensure(dirname(file));
      const backup = join(stage, `${i}.old`);
      if (op.before) renameSync(file, backup);
      const record = { file, backup, op, written: false };
      applied.push(record);
      if (op.bytes) {
        renameSync(join(stage, `${i}.new`), file); record.written = true;
        if (op.mode !== undefined) chmodSync(file, op.mode);
      }
    }
  } catch (e) {
    for (const { file, backup, op, written } of applied.reverse()) {
      try {
        if (written) {
          if (!bytesAt(root, op.path)?.equals(op.bytes)) fail('Changed during rollback.');
          rmSync(file);
        }
        if (op.before) renameSync(backup, file);
      } catch { failedRollback = true; }
    }
    for (const dir of created.reverse()) { try { rmdirSync(dir); } catch {} }
    if (failedRollback) fail(`Rollback needs recovery; originals preserved at ${stage}`);
    throw e;
  } finally {
    if (!failedRollback) rmSync(stage, { recursive: true, force: true });
    rmdirSync(mutex);
  }
  for (const dir of prepared.directories.sort((a, b) => b.length - a.length)) { try { rmdirSync(safe(root, dir)); } catch {} }
}
export function finish(prepared, options, next = '') {
  const { plan } = prepared;
  const approved = !options['approve-plan'] || options['approve-plan'] === plan.digest;
  let status = plan.conflicts.length || !approved ? 'needs-decision' : 'ok';
  if (!options['dry-run'] && status === 'ok') apply(prepared);
  return { status, plan, written: options['dry-run'] || status !== 'ok' ? [] : plan.writes.map((w) => w.path), changed: plan.writes.filter((w) => w.before).map((w) => w.path), next };
}
export function output(run, argv) {
  let result;
  try { result = run(); } catch (e) { result = { status: e.code === 2 ? 'needs-decision' : 'error', message: e.message }; }
  console.log(argv.includes('--json') ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  return result.status === 'ok' ? 0 : result.status === 'needs-decision' ? 2 : 1;
}
