#!/usr/bin/env node
// PreToolUse guard for Bash: only /publicar and /volver reach the live site. It blocks the
// commands that cannot be undone (force push, remote deletes, deploys from this machine).
// Publishing a version (tag push, deploy workflow, release) runs without asking: the user chose
// that Claude publishes every finished change on its own (2026-11-21). Runs on every Bash call,
// so it only parses text.

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

/** Blocks force pushes and remote deletes. Pushing version tags is allowed (it publishes). */
function checkGitPush(w) {
  const args = w.slice(w.indexOf('push') + 1);
  const options = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const refspecs = positional.slice(1);

  if (options.some((o) => o === '--force' || o === '-f' || /^-[a-z]*f/.test(o))) {
    decide('deny', 'Force push is blocked: it can erase published history.');
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
  if (options.includes('--mirror')) {
    decide('deny', '--mirror overwrites and deletes refs on the remote. Push main and the tag.');
  }
  if (refspecs.some((r) => r.startsWith('+'))) {
    decide('deny', 'A "+" refspec is a force push, which is blocked.');
  }
}

function check(segment) {
  const w = words(segment);
  const cmd = w.join(' ');

  if (/\bfirebase\b.*\b(deploy|hosting:clone|hosting:channel:delete|hosting:disable)\b/.test(cmd)) {
    decide(
      'deny',
      'Deploys only go through GitHub Actions: /publicar for live, /volver to roll back.',
    );
  }
  if (w[0] === 'git' && w.includes('push')) checkGitPush(w);

  if (w[0] === 'gh' && w[1] === 'release' && w[2] === 'delete') {
    decide('ask', 'This deletes a published release. Confirm.');
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
  for (const segment of segments(command)) check(segment);
  process.exit(0);
} catch (error) {
  // A broken guard must not lock the session: report it and fall back to the normal prompts
  process.stderr.write(
    `guard.mjs failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(0);
}
