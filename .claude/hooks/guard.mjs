#!/usr/bin/env node
// PreToolUse guard for Bash: keeps every change on the safe path (branch → PR → green CI → beta
// → /publicar → live). It blocks the shortcuts around that path and asks the user before the
// steps that reach real users. Runs on every Bash call, so it only parses text, except for one
// `gh pr view` when a merge is about to happen.
import { execFileSync } from 'node:child_process';

const PROTECTED = 'main';

/** Reads the hook input Claude Code sends on stdin. */
async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

/** Prints the decision and exits; with no decision the normal permission flow continues. */
function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

/** Splits a shell line into simple commands on &&, ||, ;, | and newlines. */
function segments(command) {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Splits one command into words, honouring single and double quotes. */
function words(segment) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(segment))) out.push(match[1] ?? match[2] ?? match[3]);
  return out;
}

/** The branch checked out in a directory, or '' when it cannot be read. */
function currentBranch(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** The head branch of a pull request, or '' when it cannot be read. */
function prHeadBranch(prArgs) {
  try {
    return execFileSync(
      'gh',
      ['pr', 'view', ...prArgs, '--json', 'headRefName', '-q', '.headRefName'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15000,
      },
    ).trim();
  } catch {
    return '';
  }
}

/** Blocks pushes that reach main, force or delete; asks before pushing version tags. */
function checkGitPush(w, dir) {
  const pushAt = w.indexOf('push');
  const cIndex = w.indexOf('-C');
  const where = cIndex > -1 && cIndex < pushAt ? w[cIndex + 1] : dir;
  const args = w.slice(pushAt + 1);
  const options = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const refspecs = positional.slice(1);

  if (options.some((o) => o === '--force' || o === '-f' || /^-[a-z]*f/.test(o))) {
    decide('deny', 'Force push is blocked. Use --force-with-lease, and only on your own branch.');
  }
  if (
    options.includes('--delete') ||
    options.includes('-d') ||
    refspecs.some((r) => r.startsWith(':'))
  ) {
    decide(
      'deny',
      'Deleting branches or tags on the remote is blocked. Ask the user to do it by hand.',
    );
  }
  if (options.includes('--mirror') || options.includes('--all')) {
    decide('deny', '--mirror/--all would push main. Push your own branch only.');
  }
  const targets = refspecs.map((r) =>
    r
      .replace(/^\+/, '')
      .split(':')
      .pop()
      .replace(/^refs\/heads\//, ''),
  );
  if (
    targets.includes(PROTECTED) ||
    (refspecs.length === 0 && currentBranch(where) === PROTECTED)
  ) {
    decide(
      'deny',
      `Direct pushes to ${PROTECTED} are blocked. Push a branch and open a PR (skill /dev); main only changes through merged PRs.`,
    );
  }
  if (options.includes('--tags') || targets.some((t) => /^(refs\/tags\/)?(v\d|stable-)/.test(t))) {
    decide(
      'ask',
      'Pushing a version tag: tags mark what can go to production. Confirm it is intended.',
    );
  }
}

function check(segment, dir) {
  const w = words(segment);
  const cmd = w.join(' ');

  if (/\bfirebase\b.*\b(deploy|hosting:clone|hosting:channel:delete|hosting:disable)\b/.test(cmd)) {
    decide(
      'deny',
      'Deploys only go through GitHub Actions: /publicar for live, /volver to roll back.',
    );
  }
  if (w[0] === 'git' && w.includes('push')) checkGitPush(w, dir);

  if (w[0] === 'gh' && w[1] === 'pr' && w[2] === 'merge') {
    if (w.includes('--admin'))
      decide('deny', '--admin skips the CI checks. Wait for green CI instead.');
    const prArgs = w
      .slice(3)
      .filter((a) => !a.startsWith('-'))
      .slice(0, 1);
    if (prHeadBranch(prArgs).startsWith('release-please--')) {
      decide(
        'ask',
        'PRODUCTION: merging the release PR publishes a new version to every user. Confirm.',
      );
    }
  }
  if (w[0] === 'gh' && w[1] === 'workflow' && w[2] === 'run' && /firebase/.test(w[3] ?? '')) {
    decide('ask', 'PRODUCTION: this deploys a version to the live site. Confirm the version.');
  }
  if (w[0] === 'gh' && w[1] === 'release' && ['create', 'delete', 'edit'].includes(w[2])) {
    decide(
      'ask',
      'Releases are made by release-please through /publicar. Confirm this manual change.',
    );
  }
  if (w[0] === 'gh' && w[1] === 'api' && /branches\/main\/protection|rulesets/.test(cmd)) {
    if (/-X\s*(DELETE|PUT|PATCH)|--method\s*(DELETE|PUT|PATCH)/i.test(cmd)) {
      decide('ask', 'This changes the protection of main. Confirm it is intended.');
    }
  }
}

try {
  const input = await readInput();
  if (input.tool_name !== 'Bash') process.exit(0);
  const command = String(input.tool_input?.command ?? '');
  let dir = input.cwd ?? process.cwd();
  for (const segment of segments(command)) {
    const cd = /^cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(segment);
    if (cd) dir = cd[1] ?? cd[2] ?? cd[3];
    check(segment, dir);
  }
  process.exit(0);
} catch (error) {
  // A broken guard must not lock the session: report it and fall back to the normal prompts
  process.stderr.write(
    `guard.mjs failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(0);
}
