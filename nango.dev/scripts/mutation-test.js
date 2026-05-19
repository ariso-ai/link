import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, '..', 'build');

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
        const result = await (async () => {
            const res = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: apiKey },
                body: JSON.stringify({ query: data.query, variables: data.variables }),
            });
            return res.json();
        })();
        return { data: result };
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

const created = [];
function log(kind, obj) {
    created.push({ kind, ...obj });
    console.log(`  CREATED  ${kind}: ${obj.url || obj.id}`);
}

async function main() {
    console.log('=== Mutation test: bootstrap ===');
    const teamsResult = await runAction('list-teams', { limit: 1 });
    const team = teamsResult.teams[0];
    console.log(`Team: ${team.key} (${team.id})`);

    const { viewer } = await linearGraphQL(`query { viewer { id name email } }`);
    console.log(`Viewer: ${viewer.email} (${viewer.id})`);

    console.log('\n=== create-project ===');
    const project = await runAction('create-project', {
        name: '[MUTATION-TEST] safe to delete',
        teamIds: [team.id],
        description: 'Created by scripts/mutation-test.js — safe to delete',
        leadId: viewer.id,
        priority: 3,
    });
    log('project', { id: project.id, url: project.url, name: project.name });

    console.log('\n=== update-project ===');
    const updatedProject = await runAction('update-project', {
        projectId: project.id,
        name: '[MUTATION-TEST] updated — cleanup pending',
        priority: 4,
        description: 'Updated via update-project action',
    });
    console.log(`  updated: name="${updatedProject.name}" priority=${updatedProject.priority}`);

    console.log('\n=== add-project-update ===');
    const projectUpdate = await runAction('add-project-update', {
        projectId: project.id,
        body: 'Test status update from mutation-test.js',
        health: 'atRisk',
    });
    log('projectUpdate', { id: projectUpdate.id, url: projectUpdate.url });

    console.log('\n=== verify with list-project-updates ===');
    const updates = await runAction('list-project-updates', { projectId: project.id, limit: 5 });
    console.log(`  found ${updates.updates.length} update(s)`);
    if (updates.updates.length === 0) throw new Error('Expected at least one project update');

    console.log('\n=== create test issue via raw API (no create-issue action exists) ===');
    const { issueCreate } = await linearGraphQL(
        `mutation Create($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue { id identifier url title }
            }
        }`,
        {
            input: {
                teamId: team.id,
                title: '[MUTATION-TEST] safe to delete',
                description: 'Created by mutation-test.js',
            },
        },
    );
    const issue = issueCreate.issue;
    log('issue', { id: issue.id, identifier: issue.identifier, url: issue.url });

    console.log('\n=== add-comment ===');
    const comment = await runAction('add-comment', {
        issueId: issue.id,
        body: 'Test comment from mutation-test.js',
    });
    log('comment', { id: comment.id, url: comment.url });

    console.log('\n=== update-issue ===');
    const updatedIssue = await runAction('update-issue', {
        issueId: issue.id,
        title: '[MUTATION-TEST] updated — cleanup pending',
        priority: 4,
        description: 'Updated via update-issue action',
    });
    console.log(`  updated: title="${updatedIssue.title}" priority=${updatedIssue.priority}`);

    console.log('\n=== Cleanup pass 1: rename via our actions (best our tools can do) ===');
    await runAction('update-project', {
        projectId: project.id,
        name: '[MUTATION-TEST-CLEANUP] DELETED',
    });
    console.log('  project renamed (our tools cannot archive)');
    await runAction('update-issue', {
        issueId: issue.id,
        title: '[MUTATION-TEST-CLEANUP] DELETED',
    });
    console.log('  issue renamed (our tools cannot archive)');

    console.log('\n=== Cleanup pass 2: archive via raw Linear API ===');
    const projArch = await linearGraphQL(
        `mutation { projectArchive(id: "${project.id}") { success } }`,
        {},
    );
    console.log(`  project archived: ${projArch.projectArchive.success}`);
    const issArch = await linearGraphQL(
        `mutation { issueArchive(id: "${issue.id}") { success } }`,
        {},
    );
    console.log(`  issue archived: ${issArch.issueArchive.success}`);

    console.log('\n=== Created artifacts (for manual review) ===');
    for (const c of created) {
        console.log(`  ${c.kind}: ${c.url || c.id}`);
    }
    console.log('\nProject + issue archived. Comment and projectUpdate remain attached to the archived parents and are not visible.');
}

main().catch((err) => {
    console.error('FAIL:', err.message);
    if (created.length) {
        console.error('\nArtifacts created before failure (manual cleanup may be required):');
        for (const c of created) console.error(`  ${c.kind}: ${c.url || c.id}`);
    }
    process.exit(1);
});
