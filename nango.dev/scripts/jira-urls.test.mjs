import './ts-resolve.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: listIssues } = await import('../jira/actions/list-issues.ts');
const { default: listProjects } = await import('../jira/actions/list-projects.ts');

const CLOUD_ID = '11111111-2222-3333-4444-555555555555';
const SITE_URL = 'https://acme.atlassian.net';

// Minimal stand-in for the Nango action context: routes proxy calls by endpoint.
function fakeNango(routes) {
    return {
        proxy: async (config) => {
            const route = Object.entries(routes).find(([suffix]) => config.endpoint.endsWith(suffix));
            if (!route) {
                throw new Error(`Unexpected proxy call: ${config.endpoint}`);
            }
            return { data: route[1] };
        },
    };
}

const accessibleResources = [{ id: CLOUD_ID, url: SITE_URL, name: 'acme', scopes: [] }];

test('jira list-issues returns browsable site URLs for each issue', async () => {
    const nango = fakeNango({
        '/oauth/token/accessible-resources': accessibleResources,
        '/rest/api/3/search/jql': {
            isLast: true,
            issues: [
                {
                    id: '10001',
                    key: 'KAN-1',
                    self: `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3/issue/10001`,
                    fields: {
                        summary: 'First',
                        status: { name: 'To Do' },
                        issuetype: { name: 'Task' },
                        assignee: null,
                        reporter: null,
                        priority: null,
                        created: '2026-01-01T00:00:00.000+0000',
                        updated: '2026-01-01T00:00:00.000+0000',
                    },
                },
            ],
        },
    });

    const result = await listIssues.exec(nango, { project: 'KAN' });

    assert.equal(result.issues[0].url, 'https://acme.atlassian.net/browse/KAN-1');
});

test('jira list-projects returns browsable site URLs for each project', async () => {
    const nango = fakeNango({
        '/oauth/token/accessible-resources': accessibleResources,
        '/rest/api/3/project/search': {
            total: 1,
            startAt: 0,
            maxResults: 50,
            isLast: true,
            values: [
                {
                    id: '10000',
                    key: 'KAN',
                    name: 'Kanban',
                    projectTypeKey: 'software',
                    self: `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3/project/10000`,
                },
            ],
        },
    });

    const result = await listProjects.exec(nango, {});

    assert.equal(result.projects[0].url, 'https://acme.atlassian.net/browse/KAN');
});

test('trailing slash on the site URL does not produce a double slash', async () => {
    const nango = fakeNango({
        '/oauth/token/accessible-resources': [{ id: CLOUD_ID, url: `${SITE_URL}/` }],
        '/rest/api/3/project/search': {
            total: 1,
            startAt: 0,
            maxResults: 50,
            isLast: true,
            values: [{ id: '10000', key: 'KAN', name: 'Kanban', projectTypeKey: 'software', self: '' }],
        },
    });

    const result = await listProjects.exec(nango, {});

    assert.equal(result.projects[0].url, 'https://acme.atlassian.net/browse/KAN');
});
