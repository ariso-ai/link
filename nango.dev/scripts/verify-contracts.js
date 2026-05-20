// Strict behavior-contract verification against live Linear. Every assertion
// checks WHAT the response contains, not just that the call returned. Failure
// modes are exercised. Mutations round-trip through a re-read. Schema drift
// is detected against the committed introspection fixture.
//
// LINEAR_API_KEY=lin_api_... node scripts/verify-contracts.js

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { getIntrospectionQuery } from 'graphql';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, '..', 'build');
const schemaPath = join(here, '..', 'linear', 'schema.introspection.json');

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
    console.error('LINEAR_API_KEY required');
    process.exit(1);
}

async function linearGraphQL(query, variables) {
    const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Linear HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`Linear: ${json.errors.map((e) => e.message).join('; ')}`);
    return json.data;
}

const fakeNango = {
    proxy: async ({ data }) => {
        const res = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: apiKey },
            body: JSON.stringify({ query: data.query, variables: data.variables }),
        });
        return { data: await res.json() };
    },
};

function loadAction(name) {
    return require(join(buildDir, `linear_actions_${name}.cjs`)).default;
}

async function runAction(name, input) {
    const action = loadAction(name);
    const parsedInput = action.input.parse(input);
    const result = await action.exec(fakeNango, parsedInput);
    return action.output.parse(result);
}

const results = [];
function record(name, status, note = '') {
    results.push({ name, status, note });
    const symbol = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
    console.log(`  ${symbol}  ${name}${note ? ' — ' + note : ''}`);
}

async function assertContract(name, fn) {
    try {
        const note = await fn();
        record(name, 'pass', typeof note === 'string' ? note : '');
    } catch (err) {
        record(name, 'fail', err.message);
    }
}

async function assertThrows(name, fn, pattern) {
    try {
        await fn();
        record(name, 'fail', 'expected an error but call succeeded');
    } catch (err) {
        if (pattern.test(err.message)) {
            record(name, 'pass', `threw as expected: ${err.message.slice(0, 80)}`);
        } else {
            record(name, 'fail', `wrong error: ${err.message}`);
        }
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

// Linear's API is eventually consistent across replicas. Read-after-write can lag
// by hundreds of ms. Retry with backoff so tests are robust without being slow.
async function readAfterWrite(fn, opts = { tries: 5, baseDelayMs: 200 }) {
    let lastErr;
    for (let i = 0; i < opts.tries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (i < opts.tries - 1) {
                await new Promise((r) => setTimeout(r, opts.baseDelayMs * (i + 1)));
            }
        }
    }
    throw lastErr;
}

// ===========================================================================
// Bootstrap: discover real IDs we'll round-trip against
// ===========================================================================

const bootstrap = {};

async function cleanupLeftovers() {
    // Find and archive any prior [VERIFY-TEST] or [MUTATION-TEST] projects/issues from earlier runs.
    const projects = await linearGraphQL(
        `query { projects(filter: { name: { startsWith: "[VERIFY-TEST" } }, first: 50) { nodes { id name } } }`,
    );
    for (const p of projects.projects.nodes) {
        await linearGraphQL(`mutation { projectArchive(id: "${p.id}") { success } }`, {});
    }
    const projects2 = await linearGraphQL(
        `query { projects(filter: { name: { startsWith: "[MUTATION-TEST" } }, first: 50) { nodes { id name } } }`,
    );
    for (const p of projects2.projects.nodes) {
        await linearGraphQL(`mutation { projectArchive(id: "${p.id}") { success } }`, {});
    }
    const issues = await linearGraphQL(
        `query { issues(filter: { title: { startsWith: "[VERIFY-TEST" } }, first: 50) { nodes { id identifier } } }`,
    );
    for (const i of issues.issues.nodes) {
        await linearGraphQL(`mutation { issueArchive(id: "${i.id}") { success } }`, {});
    }
    const issues2 = await linearGraphQL(
        `query { issues(filter: { title: { startsWith: "[MUTATION-TEST" } }, first: 50) { nodes { id identifier } } }`,
    );
    for (const i of issues2.issues.nodes) {
        await linearGraphQL(`mutation { issueArchive(id: "${i.id}") { success } }`, {});
    }
    const cleaned =
        projects.projects.nodes.length +
        projects2.projects.nodes.length +
        issues.issues.nodes.length +
        issues2.issues.nodes.length;
    if (cleaned > 0) {
        console.log(`Pre-test cleanup: archived ${cleaned} leftover test artifact(s) from prior runs.`);
    }
}

async function bootstrapState() {
    await cleanupLeftovers();
    console.log('Bootstrapping...');

    const teams = await runAction('list-teams', { limit: 25 });
    assert(teams.teams.length > 0, 'workspace has zero teams');
    // Prefer a team that has issues to exercise as much surface as possible.
    for (const t of teams.teams) {
        const probe = await runAction('list-issues', { teamKey: t.key, limit: 1 });
        if (probe.issues.length) {
            bootstrap.team = t;
            bootstrap.issue = probe.issues[0];
            break;
        }
    }
    assert(bootstrap.team, 'no team in workspace has any issues');
    record('bootstrap: team with issues', 'pass', `${bootstrap.team.key}`);

    const { viewer } = await linearGraphQL('query { viewer { id name email } }');
    bootstrap.viewer = viewer;
    record('bootstrap: viewer', 'pass', viewer.email);

    // Find a team with an active cycle (may not exist; we'll degrade gracefully)
    for (const t of teams.teams) {
        const r = await runAction('list-cycles', { teamKey: t.key, type: 'active', limit: 1 });
        if (r.cycles.length) {
            bootstrap.cycleTeam = t;
            bootstrap.cycle = r.cycles[0];
            break;
        }
    }
    if (bootstrap.cycleTeam) {
        record('bootstrap: team with active cycle', 'pass', bootstrap.cycleTeam.key);
    } else {
        record('bootstrap: team with active cycle', 'skip', 'no team has an active cycle');
    }
}

// ===========================================================================
// Contract: filter semantics — returned items actually match the filter
// ===========================================================================

async function filterContracts() {
    console.log('\nFilter contracts...');

    await assertContract('list-issues(teamKey=X) returns only issues from team X', async () => {
        const r = await runAction('list-issues', { teamKey: bootstrap.team.key, limit: 10 });
        for (const issue of r.issues) {
            assert(
                issue.team.key === bootstrap.team.key,
                `issue ${issue.identifier} returned with team=${issue.team.key} but filter was ${bootstrap.team.key}`,
            );
        }
        return `${r.issues.length} issues, all from ${bootstrap.team.key}`;
    });

    await assertContract('list-issues(stateType=started) returns only started issues', async () => {
        const r = await runAction('list-issues', { stateType: 'started', limit: 10 });
        for (const issue of r.issues) {
            assert(
                issue.state.type === 'started',
                `issue ${issue.identifier} has state.type=${issue.state.type}`,
            );
        }
        return `${r.issues.length} started issues`;
    });

    await assertContract('list-issues(query=X) returns only issues containing X (title or description)', async () => {
        // Use the first word of an existing issue title as the query
        const word = bootstrap.issue.title.split(/\s+/).find((w) => w.length >= 4);
        if (!word) {
            return 'skip: no usable query word from bootstrap issue';
        }
        const r = await runAction('list-issues', { query: word, limit: 10 });
        for (const issue of r.issues) {
            const haystack = `${issue.title} ${issue.description ?? ''}`.toLowerCase();
            assert(
                haystack.includes(word.toLowerCase()),
                `issue ${issue.identifier} doesn't contain "${word}"`,
            );
        }
        return `query="${word}" → ${r.issues.length} match(es), all contain the substring`;
    });

    await assertContract('list-projects(teamKey=X) returns only projects accessible to team X', async () => {
        const r = await runAction('list-projects', { teamKey: bootstrap.team.key, limit: 10 });
        for (const project of r.projects) {
            const has = project.teams.some((t) => t.key === bootstrap.team.key);
            assert(
                has,
                `project "${project.name}" returned with teams=${JSON.stringify(project.teams.map((t) => t.key))} but filter was ${bootstrap.team.key}`,
            );
        }
        return `${r.projects.length} projects, all include ${bootstrap.team.key}`;
    });

    // The above is satisfied by both `some` and `every` semantics. To distinguish them
    // (regression caught by subagent), we explicitly verify multi-team projects appear.
    await assertContract('list-projects(teamKey=X) includes multi-team projects containing X (not just X-only)', async () => {
        // Find any project that has X among multiple teams, via raw API
        const data = await linearGraphQL(
            `query($key: String!) {
                projects(filter: { accessibleTeams: { some: { key: { eq: $key } } } }, first: 50) {
                    nodes { id name teams { nodes { key } } }
                }
            }`,
            { key: bootstrap.team.key },
        );
        const multiTeam = data.projects.nodes.find(
            (p) => p.teams.nodes.length > 1 && p.teams.nodes.some((t) => t.key === bootstrap.team.key),
        );
        if (!multiTeam) {
            return 'no multi-team project in workspace, skipping completeness check';
        }
        const r = await runAction('list-projects', { teamKey: bootstrap.team.key, limit: 100 });
        const found = r.projects.some((p) => p.id === multiTeam.id);
        assert(
            found,
            `multi-team project "${multiTeam.name}" (teams: ${multiTeam.teams.nodes.map((t) => t.key).join(', ')}) was filtered out — accessibleTeams may be using "every" instead of "some"`,
        );
        return `multi-team project "${multiTeam.name}" present`;
    });

    await assertContract('list-projects(query=X) sends a valid filter and returns matching projects', async () => {
        // First find an existing project name to use as the query
        const all = await runAction('list-projects', { limit: 5 });
        if (all.projects.length === 0) return 'no projects to query';
        const sample = all.projects[0];
        const word = sample.name.split(/\s+/).find((w) => w.length >= 4) ?? sample.name.slice(0, 4);
        const r = await runAction('list-projects', { query: word, limit: 25 });
        // Must include the sample project (we know it contains the substring)
        const found = r.projects.some((p) => p.id === sample.id);
        assert(found, `query="${word}" did not return source project "${sample.name}"`);
        for (const p of r.projects) {
            assert(
                p.name.toLowerCase().includes(word.toLowerCase()),
                `project "${p.name}" returned but doesn't contain "${word}"`,
            );
        }
        return `query="${word}" → ${r.projects.length} match(es)`;
    });

    if (bootstrap.cycleTeam) {
        await assertContract('list-cycles(teamKey, type=active) returns only cycles where now is between startsAt and endsAt', async () => {
            const r = await runAction('list-cycles', { teamKey: bootstrap.cycleTeam.key, type: 'active', limit: 5 });
            const now = Date.now();
            for (const cycle of r.cycles) {
                assert(cycle.team.key === bootstrap.cycleTeam.key, `cycle has wrong team`);
                const starts = new Date(cycle.startsAt).getTime();
                const ends = new Date(cycle.endsAt).getTime();
                assert(starts <= now, `cycle ${cycle.number} starts in the future`);
                assert(now <= ends, `cycle ${cycle.number} already ended`);
            }
            return `${r.cycles.length} active cycle(s), all within their date range`;
        });

        await assertContract('get-active-cycle returns same cycle as list-cycles(active)[0]', async () => {
            const fromList = await runAction('list-cycles', { teamKey: bootstrap.cycleTeam.key, type: 'active', limit: 1 });
            const fromAction = await runAction('get-active-cycle', { teamKey: bootstrap.cycleTeam.key });
            assert(fromList.cycles[0].id === fromAction.id, `id mismatch: list=${fromList.cycles[0].id} action=${fromAction.id}`);
            assert(fromAction.team.key === bootstrap.cycleTeam.key, `team mismatch`);
            const now = Date.now();
            assert(new Date(fromAction.startsAt).getTime() <= now, 'active cycle starts in future');
            assert(now <= new Date(fromAction.endsAt).getTime(), 'active cycle already ended');
            return `cycle #${fromAction.number}`;
        });
    }

    await assertThrows(
        'get-active-cycle(nonexistent team) throws',
        () => runAction('get-active-cycle', { teamKey: 'ZZNOPE' }),
        /No active cycle found/,
    );

    await assertContract('list-users(active=true) returns only active users', async () => {
        const r = await runAction('list-users', { active: true, limit: 10 });
        for (const u of r.users) {
            assert(u.active === true, `${u.email} returned but active=${u.active}`);
        }
        return `${r.users.length} active users`;
    });

    await assertContract('list-users(admin=true) returns only admins', async () => {
        const r = await runAction('list-users', { admin: true, limit: 10 });
        for (const u of r.users) {
            assert(u.admin === true, `${u.email} returned but admin=${u.admin}`);
        }
        return `${r.users.length} admin user(s)`;
    });

    await assertContract('list-issues(stateName=X) returns only issues in that workflow state', async () => {
        // Use the bootstrap issue's state name as the query
        const stateName = bootstrap.issue.state.name;
        const r = await runAction('list-issues', { teamKey: bootstrap.team.key, stateName, limit: 5 });
        for (const issue of r.issues) {
            assert(
                issue.state.name === stateName,
                `issue ${issue.identifier} has state.name="${issue.state.name}" but filter was "${stateName}"`,
            );
        }
        return `${r.issues.length} issue(s), all in state "${stateName}"`;
    });

    await assertContract('list-issues(stateName + stateType) AND-merges (not clobbers)', async () => {
        const stateName = bootstrap.issue.state.name;
        const stateType = bootstrap.issue.state.type;
        const r = await runAction('list-issues', { teamKey: bootstrap.team.key, stateName, stateType, limit: 5 });
        for (const issue of r.issues) {
            assert(issue.state.name === stateName, `state.name mismatch`);
            assert(issue.state.type === stateType, `state.type mismatch`);
        }
        return `${r.issues.length} issue(s) matched both name="${stateName}" AND type="${stateType}"`;
    });

    await assertContract('list-issues(assigneeEmail) returns only issues assigned to that email', async () => {
        // Find an assigned issue first
        const all = await runAction('list-issues', { teamKey: bootstrap.team.key, limit: 25 });
        const assigned = all.issues.find((i) => i.assignee !== null);
        if (!assigned) return 'no assigned issues in workspace, skipping';
        const email = assigned.assignee.email;
        const r = await runAction('list-issues', { assigneeEmail: email, limit: 10 });
        for (const issue of r.issues) {
            assert(
                issue.assignee?.email === email,
                `issue ${issue.identifier} assignee=${issue.assignee?.email} but filter was ${email}`,
            );
        }
        return `${r.issues.length} issue(s) assigned to ${email}`;
    });

    await assertContract('list-users(query=<viewer email local>) includes the viewer', async () => {
        const local = bootstrap.viewer.email.split('@')[0].slice(0, 4);
        const r = await runAction('list-users', { query: local, limit: 25 });
        const found = r.users.some((u) => u.id === bootstrap.viewer.id);
        assert(found, `viewer ${bootstrap.viewer.email} not found in query="${local}" results`);
        return `viewer found among ${r.users.length} match(es)`;
    });

    await assertContract('list-users(query=<random gibberish>) returns no matches', async () => {
        const r = await runAction('list-users', { query: 'zzqq__nonexistent_user_pattern__xxyy', limit: 5 });
        assert(r.users.length === 0, `expected 0, got ${r.users.length}`);
        return 'empty as expected';
    });
}

// ===========================================================================
// Contract: identifier-vs-UUID equivalence
// ===========================================================================

async function identifierEquivalence() {
    console.log('\nIdentifier ↔ UUID equivalence...');

    await assertContract('get-team(key) === get-team(uuid)', async () => {
        const byKey = await runAction('get-team', { teamId: bootstrap.team.key });
        const byId = await runAction('get-team', { teamId: bootstrap.team.id });
        assert(byKey.id === byId.id, 'mismatched id');
        assert(byKey.key === byId.key, 'mismatched key');
        assert(byKey.name === byId.name, 'mismatched name');
        return 'identical';
    });

    await assertContract('get-issue(identifier) === get-issue(uuid)', async () => {
        const byIdent = await runAction('get-issue', { issueId: bootstrap.issue.identifier });
        const byUuid = await runAction('get-issue', { issueId: bootstrap.issue.id });
        assert(byIdent.id === byUuid.id, 'mismatched id');
        assert(byIdent.identifier === byUuid.identifier, 'mismatched identifier');
        assert(byIdent.title === byUuid.title, 'mismatched title');
        return 'identical';
    });

    await assertContract('get-issue(lowercase identifier) resolves via UUID-branch fallback', async () => {
        // Our IDENTIFIER_REGEX requires uppercase, so lowercase falls to the UUID branch.
        // Linear's issue(id: String!) is permissive about case, so this still resolves.
        const lower = bootstrap.issue.identifier.toLowerCase();
        const r = await runAction('get-issue', { issueId: lower });
        assert(r.identifier === bootstrap.issue.identifier, `${lower} → ${r.identifier}`);
        return `${lower} → ${r.identifier}`;
    });

    await assertContract('get-user(email) === get-user(uuid)', async () => {
        const byEmail = await runAction('get-user', { userId: bootstrap.viewer.email });
        const byUuid = await runAction('get-user', { userId: bootstrap.viewer.id });
        assert(byEmail.id === byUuid.id, 'mismatched id');
        assert(byEmail.email === byUuid.email, 'mismatched email');
        return 'identical';
    });

    // get-project equivalence — need both a slug and a uuid
    const projects = await runAction('list-projects', { limit: 1 });
    if (projects.projects.length) {
        const p = projects.projects[0];
        await assertContract('get-project(slug) === get-project(uuid)', async () => {
            const bySlug = await runAction('get-project', { projectId: p.slugId });
            const byUuid = await runAction('get-project', { projectId: p.id });
            assert(bySlug.id === byUuid.id, 'mismatched id');
            assert(bySlug.slugId === byUuid.slugId, 'mismatched slug');
            return 'identical';
        });
    } else {
        record('get-project equivalence', 'skip', 'no projects in workspace');
    }
}

// ===========================================================================
// Contract: pagination correctness
// ===========================================================================

async function paginationContracts() {
    console.log('\nPagination contracts...');

    await assertContract('list-issues(limit=1) returns at most 1 item, and hasNextPage:true ⇒ cursor', async () => {
        const page1 = await runAction('list-issues', { teamKey: bootstrap.team.key, limit: 1 });
        assert(page1.issues.length <= 1, `expected <=1, got ${page1.issues.length}`);
        if (page1.hasNextPage) {
            assert(page1.endCursor !== null, 'hasNextPage:true but endCursor:null');
        }
        return page1.hasNextPage ? `cursor=${page1.endCursor.slice(0, 12)}...` : 'single-page result';
    });

    await assertContract('list-issues page2 contains different items than page1', async () => {
        const page1 = await runAction('list-issues', { teamKey: bootstrap.team.key, limit: 1 });
        if (!page1.hasNextPage) return 'only one page available, skip';
        const page2 = await runAction('list-issues', { teamKey: bootstrap.team.key, limit: 1, after: page1.endCursor });
        if (!page2.issues.length) {
            throw new Error('page2 was empty despite hasNextPage:true on page1');
        }
        assert(
            page2.issues[0].id !== page1.issues[0].id,
            'page2 returned the same issue as page1',
        );
        return `page1=${page1.issues[0].identifier}, page2=${page2.issues[0].identifier}`;
    });

    await assertContract('list-issues paginated walk: no duplicates, terminates cleanly', async () => {
        const seen = new Set();
        let cursor = null;
        let pages = 0;
        const maxPages = 5;
        while (pages < maxPages) {
            const r = await runAction('list-issues', {
                teamKey: bootstrap.team.key,
                limit: 5,
                after: cursor ?? undefined,
            });
            for (const issue of r.issues) {
                assert(!seen.has(issue.id), `duplicate ${issue.identifier} across pages`);
                seen.add(issue.id);
            }
            pages++;
            if (!r.hasNextPage) {
                assert(r.endCursor === null || r.endCursor !== undefined, 'cursor shape on last page');
                return `${pages} page(s), ${seen.size} unique issues, terminated cleanly`;
            }
            assert(r.endCursor !== null, `hasNextPage:true but endCursor is null on page ${pages}`);
            cursor = r.endCursor;
        }
        return `${pages} page(s), ${seen.size} unique issues (capped at ${maxPages})`;
    });
}

// ===========================================================================
// Contract: error paths
// ===========================================================================

async function errorContracts() {
    console.log('\nError-path contracts...');

    await assertThrows(
        'get-project(nonexistent UUID) throws',
        () => runAction('get-project', { projectId: '00000000-0000-0000-0000-000000000000' }),
        /not found|GraphQL/i,
    );

    await assertThrows(
        'get-project(nonexistent slug) throws',
        () => runAction('get-project', { projectId: 'totally-fake-slug-zzz-999' }),
        /not found|GraphQL/i,
    );

    await assertThrows(
        'get-team(BOGUS_KEY) throws',
        () => runAction('get-team', { teamId: 'ZZNOPE' }),
        /not found|GraphQL/i,
    );

    await assertThrows(
        'get-user(unknown email) throws',
        () => runAction('get-user', { userId: 'nobody-zzqq@nonexistent.example' }),
        /not found|GraphQL/i,
    );

    await assertThrows(
        'update-project with no fields throws explicit error',
        () => runAction('update-project', { projectId: bootstrap.issue.id }), // any UUID, doesn't matter — throws before sending
        /No update fields|at least one/i,
    );

    await assertThrows(
        'update-issue with no fields throws explicit error',
        () => runAction('update-issue', { issueId: bootstrap.issue.id }),
        /No update fields|at least one/i,
    );

    await assertThrows(
        'add-comment(bad UUID) throws',
        () => runAction('add-comment', { issueId: '00000000-0000-0000-0000-000000000000', body: 'x' }),
        /not found|GraphQL|invalid/i,
    );

    await assertThrows(
        'update-project(priority=99) rejected by Zod before hitting Linear',
        () => runAction('update-project', { projectId: '00000000-0000-0000-0000-000000000000', priority: 99 }),
        /priority|Too big|less than/i,
    );

    await assertThrows(
        'update-issue(priority=-1) rejected by Zod before hitting Linear',
        () => runAction('update-issue', { issueId: '00000000-0000-0000-0000-000000000000', priority: -1 }),
        /priority|Too small|greater/i,
    );

    await assertThrows(
        'list-issues(limit=0) rejected by Zod (must be positive)',
        () => runAction('list-issues', { limit: 0 }),
        /Too small|positive|>\s*0/i,
    );

    await assertThrows(
        'list-issues(limit=1.5) rejected by Zod (must be integer)',
        () => runAction('list-issues', { limit: 1.5 }),
        /expected int|integer/i,
    );

    await assertThrows(
        'get-issue(definitely-bogus identifier) throws',
        () => runAction('get-issue', { issueId: 'ZZZZ-9999999' }),
        /not found|GraphQL/i,
    );
}

// ===========================================================================
// Contract: mutation round-trips — write, re-read, verify persistence
// ===========================================================================

const created = [];

async function mutationContracts() {
    console.log('\nMutation round-trip contracts (creates real records)...');

    // create-project
    let project;
    await assertContract('create-project: response reflects input', async () => {
        project = await runAction('create-project', {
            name: '[VERIFY-TEST] safe to delete',
            teamIds: [bootstrap.team.id],
            description: 'created by verify-contracts.js',
            priority: 3,
        });
        created.push({ kind: 'project', id: project.id, url: project.url });
        assert(project.name === '[VERIFY-TEST] safe to delete', `name mismatch: ${project.name}`);
        assert(project.teams.some((t) => t.id === bootstrap.team.id), 'created project missing team');
        assert(project.priority === 3, `priority mismatch: ${project.priority}`);
        return project.id;
    });

    await assertContract('create-project: get-project(id) round-trip', async () => {
        return await readAfterWrite(async () => {
            const reread = await runAction('get-project', { projectId: project.id });
            assert(reread.name === project.name, `re-read name mismatch: got "${reread.name}"`);
            assert(reread.description === project.description, `re-read description mismatch`);
            assert(reread.priority === project.priority, `re-read priority mismatch`);
            return 'name + description + priority persisted';
        });
    });

    // update-project
    await assertContract('update-project: response reflects updates', async () => {
        const updated = await runAction('update-project', {
            projectId: project.id,
            name: '[VERIFY-TEST] updated name',
            priority: 4,
            description: 'updated description',
        });
        assert(updated.name === '[VERIFY-TEST] updated name', 'name not updated in response');
        assert(updated.priority === 4, 'priority not updated in response');
        return 'response reflects update';
    });

    await assertContract('update-project: get-project(id) confirms persisted', async () => {
        return await readAfterWrite(async () => {
            const reread = await runAction('get-project', { projectId: project.id });
            assert(reread.name === '[VERIFY-TEST] updated name', `persisted name: ${reread.name}`);
            assert(reread.priority === 4, `persisted priority: ${reread.priority}`);
            assert(reread.description === 'updated description', `persisted description: ${reread.description}`);
            return 'all fields persisted';
        });
    });

    // add-project-update
    let projectUpdate;
    await assertContract('add-project-update: response is well-formed', async () => {
        projectUpdate = await runAction('add-project-update', {
            projectId: project.id,
            body: 'verify-test update body — UNIQUE_MARKER_4f7a2c',
            health: 'atRisk',
        });
        created.push({ kind: 'projectUpdate', id: projectUpdate.id, url: projectUpdate.url });
        assert(projectUpdate.body === 'verify-test update body — UNIQUE_MARKER_4f7a2c', 'body mismatch');
        assert(projectUpdate.health === 'atRisk', `health=${projectUpdate.health}`);
        assert(projectUpdate.project.id === project.id, 'project.id mismatch');
        return projectUpdate.id;
    });

    await assertContract('add-project-update: list-project-updates(project) contains it', async () => {
        return await readAfterWrite(async () => {
            const list = await runAction('list-project-updates', { projectId: project.id, limit: 10 });
            const found = list.updates.find((u) => u.id === projectUpdate.id);
            assert(found, `update ${projectUpdate.id} not in list`);
            assert(found.body.includes('UNIQUE_MARKER_4f7a2c'), `body not persisted: ${found.body}`);
            assert(found.health === 'atRisk', `health not persisted: ${found.health}`);
            return 'update persisted with body + health';
        });
    });

    // create test issue (raw API — we don't have create-issue)
    const { issueCreate } = await linearGraphQL(
        `mutation Create($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue { id identifier url title }
            }
        }`,
        {
            input: {
                teamId: bootstrap.team.id,
                title: '[VERIFY-TEST] safe to delete',
                description: 'created by verify-contracts.js',
            },
        },
    );
    const issue = issueCreate.issue;
    created.push({ kind: 'issue', id: issue.id, identifier: issue.identifier, url: issue.url });

    // add-comment
    let comment;
    await assertContract('add-comment: response is well-formed', async () => {
        comment = await runAction('add-comment', {
            issueId: issue.id,
            body: 'verify-test comment — UNIQUE_MARKER_a8e3f1',
        });
        created.push({ kind: 'comment', id: comment.id, url: comment.url });
        assert(comment.id, 'no comment id returned');
        assert(comment.url, 'no comment url returned');
        return comment.id;
    });

    await assertContract('add-comment: re-fetching issue comments contains the body', async () => {
        return await readAfterWrite(async () => {
            const reread = await linearGraphQL(
                `query($id: String!) { issue(id: $id) { comments(first: 50) { nodes { id body } } } }`,
                { id: issue.id },
            );
            const found = reread.issue.comments.nodes.find((c) => c.id === comment.id);
            assert(found, `comment ${comment.id} not on issue`);
            assert(found.body.includes('UNIQUE_MARKER_a8e3f1'), `body not persisted: ${found.body}`);
            return 'comment persisted with body';
        });
    });

    // update-issue
    await assertContract('update-issue: response reflects updates', async () => {
        const updated = await runAction('update-issue', {
            issueId: issue.id,
            title: '[VERIFY-TEST] updated title',
            priority: 4,
            description: 'updated description',
        });
        assert(updated.title === '[VERIFY-TEST] updated title', `title: ${updated.title}`);
        assert(updated.priority === 4, `priority: ${updated.priority}`);
        return 'response reflects update';
    });

    await assertContract('update-issue: get-issue(id) confirms persisted', async () => {
        return await readAfterWrite(async () => {
            const reread = await runAction('get-issue', { issueId: issue.id });
            assert(reread.title === '[VERIFY-TEST] updated title', `persisted title: ${reread.title}`);
            assert(reread.priority === 4, `persisted priority: ${reread.priority}`);
            assert(reread.description === 'updated description', `persisted description: ${reread.description}`);
            return 'all fields persisted';
        });
    });

    // ----- Round-3 additions -----

    // statusId round-trip — high-blast-radius mutation field with no prior coverage
    await assertContract('update-project(statusId): project status persists', async () => {
        const data = await linearGraphQL(
            `query { organization { projectStatuses { id name type } } }`,
        );
        const statuses = data.organization.projectStatuses;
        const current = await linearGraphQL(
            `query($id: String!) { project(id: $id) { status { id name type } } }`,
            { id: project.id },
        );
        const currentStatusId = current.project.status?.id;
        const target = statuses.find((s) => s.id !== currentStatusId);
        if (!target) return 'workspace has only one project status, skipping';
        await runAction('update-project', { projectId: project.id, statusId: target.id });
        const reread = await readAfterWrite(async () => {
            const r = await linearGraphQL(
                `query($id: String!) { project(id: $id) { status { id name } } }`,
                { id: project.id },
            );
            assert(r.project.status?.id === target.id, `status not persisted: got ${r.project.status?.id}`);
            return r.project.status;
        });
        return `status → ${reread.name}`;
    });

    // leadId: null — clear a previously-set lead
    await assertContract('update-project(leadId=null) clears the lead', async () => {
        await runAction('update-project', { projectId: project.id, leadId: bootstrap.viewer.id });
        await readAfterWrite(async () => {
            const r = await runAction('get-project', { projectId: project.id });
            assert(r.lead?.id === bootstrap.viewer.id, `lead was not set`);
            return r;
        });
        await runAction('update-project', { projectId: project.id, leadId: null });
        await readAfterWrite(async () => {
            const r = await runAction('get-project', { projectId: project.id });
            assert(r.lead === null, `expected lead null, got ${JSON.stringify(r.lead)}`);
            return r;
        });
        return 'set → cleared';
    });

    // Multi-team create-project — branch otherwise unexercised
    const teams = await runAction('list-teams', { limit: 25 });
    const secondTeam = teams.teams.find((t) => t.id !== bootstrap.team.id);
    let multiTeamProject;
    if (secondTeam) {
        await assertContract('create-project(teamIds=[A,B]) attaches both teams', async () => {
            multiTeamProject = await runAction('create-project', {
                name: '[VERIFY-TEST] multi-team safe to delete',
                teamIds: [bootstrap.team.id, secondTeam.id],
            });
            created.push({ kind: 'project', id: multiTeamProject.id, url: multiTeamProject.url });
            const ids = new Set(multiTeamProject.teams.map((t) => t.id));
            assert(ids.has(bootstrap.team.id), `missing primary team`);
            assert(ids.has(secondTeam.id), `missing second team ${secondTeam.key}`);
            return `teams: ${multiTeamProject.teams.map((t) => t.key).join(', ')}`;
        });
    } else {
        record('create-project(multi-team)', 'skip', 'workspace has only one team');
    }

    // Empty-body / empty-teamIds Zod boundary checks
    await assertThrows(
        'add-comment(body="") rejected by Zod',
        () => runAction('add-comment', { issueId: issue.id, body: '' }),
        /Too small|min|at least/i,
    );
    await assertThrows(
        'create-project(teamIds=[]) rejected by Zod',
        () => runAction('create-project', { name: 'x', teamIds: [] }),
        /Too small|min|at least/i,
    );

    // Unicode round-trip — Linear and the mapper should preserve every codepoint
    await assertContract('update-issue with unicode/emoji title round-trips byte-for-byte', async () => {
        const unicode = 'Test 🎉 Café — naïve 中文';
        await runAction('update-issue', { issueId: issue.id, title: unicode });
        await readAfterWrite(async () => {
            const r = await runAction('get-issue', { issueId: issue.id });
            assert(r.title === unicode, `unicode mangled: ${JSON.stringify(r.title)}`);
            return r;
        });
        return 'preserved';
    });

    // Concurrent writes — two parallel add-comments produce distinct IDs (no idempotency confusion)
    await assertContract('concurrent add-comment calls produce distinct comments', async () => {
        const [c1, c2] = await Promise.all([
            runAction('add-comment', { issueId: issue.id, body: 'race-A-' + Math.random() }),
            runAction('add-comment', { issueId: issue.id, body: 'race-B-' + Math.random() }),
        ]);
        created.push({ kind: 'comment', id: c1.id, url: c1.url });
        created.push({ kind: 'comment', id: c2.id, url: c2.url });
        assert(c1.id !== c2.id, `parallel add-comment returned same id`);
        return `${c1.id.slice(0, 8)} vs ${c2.id.slice(0, 8)}`;
    });

    // Cleanup: archive project + issue + multi-team project
    console.log('\nCleanup (archive via raw API)...');
    await linearGraphQL(`mutation { projectArchive(id: "${project.id}") { success } }`, {});
    await linearGraphQL(`mutation { issueArchive(id: "${issue.id}") { success } }`, {});
    if (multiTeamProject) {
        await linearGraphQL(`mutation { projectArchive(id: "${multiTeamProject.id}") { success } }`, {});
    }
    record('cleanup: archive project(s) + issue', 'pass', '');
}

// ===========================================================================
// Contract: schema drift detector
// ===========================================================================

async function schemaDriftContract() {
    console.log('\nSchema drift detector...');

    await assertContract('committed introspection matches live Linear schema', async () => {
        const live = await linearGraphQL(getIntrospectionQuery());
        const committed = JSON.parse(await readFile(schemaPath, 'utf8'));

        const liveTypes = new Set(live.__schema.types.map((t) => t.name));
        const committedTypes = new Set(committed.__schema.types.map((t) => t.name));

        const onlyCommitted = [...committedTypes].filter((n) => !liveTypes.has(n));
        if (onlyCommitted.length) {
            throw new Error(`types removed from live: ${onlyCommitted.slice(0, 5).join(', ')} (run npm run schema:refresh)`);
        }

        // Field-presence on output types we query
        const outputTypes = ['Project', 'Issue', 'Cycle', 'Team', 'User', 'ProjectUpdate'];
        for (const typeName of outputTypes) {
            const liveType = live.__schema.types.find((t) => t.name === typeName);
            const committedType = committed.__schema.types.find((t) => t.name === typeName);
            if (!liveType || !committedType) continue;
            const liveFields = new Set((liveType.fields || []).map((f) => f.name));
            const committedFields = new Set((committedType.fields || []).map((f) => f.name));
            const removed = [...committedFields].filter((n) => !liveFields.has(n));
            if (removed.length) {
                throw new Error(`${typeName} lost fields in live: ${removed.join(', ')} (run npm run schema:refresh)`);
            }
        }

        // Input-field presence on filters / inputs we send. This is what would have
        // caught the ProjectFilter.description regression (we were sending a field
        // Linear's ProjectFilter never had).
        const inputTypes = [
            'IssueFilter',
            'ProjectFilter',
            'CycleFilter',
            'UserFilter',
            'TeamFilter',
            'TeamCollectionFilter',
            'ProjectUpdateFilter',
            'ProjectCreateInput',
            'ProjectUpdateInput',
            'IssueUpdateInput',
            'CommentCreateInput',
            'ProjectUpdateCreateInput',
        ];
        for (const typeName of inputTypes) {
            const liveType = live.__schema.types.find((t) => t.name === typeName);
            const committedType = committed.__schema.types.find((t) => t.name === typeName);
            if (!liveType || !committedType) continue;
            const liveFields = new Set((liveType.inputFields || []).map((f) => f.name));
            const committedFields = new Set((committedType.inputFields || []).map((f) => f.name));
            const removed = [...committedFields].filter((n) => !liveFields.has(n));
            if (removed.length) {
                throw new Error(
                    `${typeName} lost input fields in live: ${removed.join(', ')} (run npm run schema:refresh)`,
                );
            }
        }

        return `output types + ${inputTypes.length} input types verified`;
    });

    // Belt and suspenders for the ProjectFilter.description bug class: send a query
    // that would have tripped the old filter shape and confirm Linear accepts it.
    await assertContract('list-projects(query=...) sends a filter Linear accepts (no GraphQL error)', async () => {
        // Empty result is fine; non-error is the signal.
        await runAction('list-projects', { query: 'zz-unlikely-substring-' + Math.random().toString(36).slice(2, 8), limit: 1 });
        return 'no GraphQL error from ProjectFilter';
    });
}

// ===========================================================================

async function main() {
    await bootstrapState();
    await filterContracts();
    await identifierEquivalence();
    await paginationContracts();
    await errorContracts();
    await mutationContracts();
    await schemaDriftContract();

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const skipped = results.filter((r) => r.status === 'skip').length;

    console.log(`\n=== Summary ===`);
    console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failed) {
        console.log('\nFailures:');
        for (const r of results.filter((r) => r.status === 'fail')) {
            console.log(`  ${r.name}: ${r.note}`);
        }
    }
    if (created.length) {
        console.log('\nCreated artifacts (parents archived; children attached):');
        for (const c of created) console.log(`  ${c.kind}: ${c.url || c.id}`);
    }
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('\nUnhandled failure:', err);
    if (created.length) {
        console.error('\nArtifacts created before failure (manual cleanup may be needed):');
        for (const c of created) console.error(`  ${c.kind}: ${c.url || c.id}`);
    }
    process.exit(1);
});
