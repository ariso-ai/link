import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, '..', 'build');

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
    console.error('LINEAR_API_KEY is required. Get one from https://linear.app/settings/account/security');
    console.error('Then: export LINEAR_API_KEY=lin_api_... && npm -w nango.dev run test:integration');
    process.exit(1);
}

async function linearGraphQL(query, variables) {
    const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        throw new Error(`Linear API HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

const fakeNango = {
    proxy: async ({ data }) => {
        const result = await linearGraphQL(data.query, data.variables);
        return { data: result };
    },
};

function loadAction(name) {
    const mod = require(join(buildDir, `linear_actions_${name}.cjs`));
    return mod.default;
}

async function runAction(name, input) {
    const action = loadAction(name);
    const parsedInput = action.input.parse(input);
    const result = await action.exec(fakeNango, parsedInput);
    return action.output.parse(result);
}

const results = [];

async function check(name, fn) {
    try {
        const value = await fn();
        const note = typeof value === 'string' ? value : '';
        results.push({ name, status: 'pass', note });
        console.log(`  PASS  ${name}${note ? ' — ' + note : ''}`);
    } catch (err) {
        results.push({ name, status: 'fail', error: err.message });
        console.log(`  FAIL  ${name}: ${err.message}`);
    }
}

async function checkExpectedError(name, fn, allowedPattern) {
    try {
        await fn();
        results.push({ name, status: 'pass', note: '' });
        console.log(`  PASS  ${name}`);
    } catch (err) {
        if (allowedPattern.test(err.message)) {
            results.push({ name, status: 'skip', note: 'expected: ' + err.message });
            console.log(`  SKIP  ${name} — expected: ${err.message}`);
        } else {
            results.push({ name, status: 'fail', error: err.message });
            console.log(`  FAIL  ${name}: ${err.message}`);
        }
    }
}

async function main() {
    let teamKey, teamId, userEmail, userId, projectId, projectSlug, issueIdentifier, issueUuid;

    console.log('Bootstrapping...');
    await check('list-teams', async () => {
        const r = await runAction('list-teams', { limit: 3 });
        if (!r.teams.length) throw new Error('No teams in workspace');
        teamKey = r.teams[0].key;
        teamId = r.teams[0].id;
        return `team=${teamKey}`;
    });

    await check('list-users', async () => {
        const r = await runAction('list-users', { active: true, limit: 3 });
        if (!r.users.length) throw new Error('No active users in workspace');
        userEmail = r.users[0].email;
        userId = r.users[0].id;
        return `user=${userEmail}`;
    });

    await check('list-projects', async () => {
        const r = await runAction('list-projects', teamKey ? { teamKey, limit: 3 } : { limit: 3 });
        if (r.projects.length) {
            projectId = r.projects[0].id;
            projectSlug = r.projects[0].slugId;
            return `found ${r.projects.length} project(s); first slug=${projectSlug}`;
        }
        return 'no projects';
    });

    await check('list-issues', async () => {
        const r = await runAction('list-issues', teamKey ? { teamKey, limit: 3 } : { limit: 3 });
        if (r.issues.length) {
            issueIdentifier = r.issues[0].identifier;
            issueUuid = r.issues[0].id;
            return `found ${r.issues.length} issue(s); first=${issueIdentifier}`;
        }
        return 'no issues';
    });

    console.log('\nRead actions...');

    if (teamId) {
        await check('get-team (by UUID)', async () => {
            const r = await runAction('get-team', { teamId });
            return r.key;
        });
        await check('get-team (by key)', async () => {
            const r = await runAction('get-team', { teamId: teamKey });
            return r.id;
        });
    }

    if (userId) {
        await check('get-user (by UUID)', async () => {
            const r = await runAction('get-user', { userId });
            return r.email;
        });
        await check('get-user (by email)', async () => {
            const r = await runAction('get-user', { userId: userEmail });
            return r.id;
        });
        await check('list-users (query filter)', async () => {
            // Use the local part of the email to confirm the or-filter (name/displayName/email contains)
            // is accepted by Linear's UserFilter.
            const local = userEmail.split('@')[0].slice(0, 4);
            const r = await runAction('list-users', { query: local, limit: 5 });
            return `${r.users.length} match(es) for "${local}"`;
        });
    }

    if (projectId) {
        await check('get-project (by UUID)', async () => {
            const r = await runAction('get-project', { projectId });
            return r.slugId;
        });
        await check('get-project (by slug)', async () => {
            const r = await runAction('get-project', { projectId: projectSlug });
            return r.id;
        });
        await check('list-project-updates', async () => {
            const r = await runAction('list-project-updates', { projectId, limit: 3 });
            return `${r.updates.length} update(s)`;
        });
    } else {
        console.log('  SKIP  project-specific tests — no projects in workspace');
    }

    if (issueIdentifier) {
        await check('get-issue (by identifier)', async () => {
            const r = await runAction('get-issue', { issueId: issueIdentifier });
            return r.id;
        });
        await check('get-issue (by UUID)', async () => {
            const r = await runAction('get-issue', { issueId: issueUuid });
            return r.identifier;
        });
    }

    if (teamKey) {
        await check('list-cycles (bootstrap team)', async () => {
            const r = await runAction('list-cycles', { teamKey, limit: 3 });
            return `${r.cycles.length} cycle(s)`;
        });

        // Find a team that actually has an active cycle so we exercise the happy path.
        // Falls back to the expected-error path only if no team in the workspace runs cycles.
        const teamsResult = await runAction('list-teams', { limit: 25 });
        let teamWithActiveCycle = null;
        for (const t of teamsResult.teams) {
            const r = await runAction('list-cycles', { teamKey: t.key, type: 'active', limit: 1 });
            if (r.cycles.length) {
                teamWithActiveCycle = t.key;
                break;
            }
        }

        if (teamWithActiveCycle) {
            await check(`get-active-cycle (${teamWithActiveCycle}, happy path)`, async () => {
                const r = await runAction('get-active-cycle', { teamKey: teamWithActiveCycle });
                return `cycle #${r.number} ends ${r.endsAt}`;
            });
        } else {
            await checkExpectedError(
                'get-active-cycle (no team has an active cycle)',
                () => runAction('get-active-cycle', { teamKey }),
                /No active cycle found/,
            );
        }
    }

    const failed = results.filter((r) => r.status === 'fail').length;
    const passed = results.filter((r) => r.status === 'pass').length;
    const skipped = results.filter((r) => r.status === 'skip').length;

    console.log(`\n=== Summary ===`);
    console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('\nMutations (create-project, update-project, update-issue, add-comment, add-project-update) not exercised.');
    console.log('They would create real records in your workspace; run them manually if needed.');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
