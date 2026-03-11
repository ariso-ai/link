import { createAction } from 'nango';
import * as z from 'zod';
import { getCloudId } from '../helpers/get-cloud-id.js';

// --- Input schema ---
const listIssuesInputSchema = z.object({
    project: z.string().describe('Jira project key (e.g. "PROJ")'),
    status: z.string().optional().describe('Filter by status name (e.g. "To Do", "In Progress", "Done")'),
    assignee: z.string().optional().describe('Filter by assignee account ID. Use "currentUser()" for the authenticated user.'),
    maxResults: z.number().optional().describe('Maximum number of issues to return (default 50, max 100)'),
    startAt: z.number().optional().describe('Index of the first result to return for pagination (default 0)'),
    jql: z.string().optional().describe('Raw JQL query. When provided, project/status/assignee filters are ignored.'),
});

// --- Output schemas ---
const jiraIssueSchema = z.object({
    id: z.string(),
    key: z.string(),
    summary: z.string(),
    status: z.string(),
    issueType: z.string(),
    assignee: z.string().nullable(),
    reporter: z.string().nullable(),
    priority: z.string().nullable(),
    created: z.string(),
    updated: z.string(),
    url: z.string(),
});

const listIssuesOutputSchema = z.object({
    issues: z.array(jiraIssueSchema),
    total: z.number(),
    startAt: z.number(),
    maxResults: z.number(),
});

type JiraIssue = z.infer<typeof jiraIssueSchema>;

// --- Jira API response types (v3 /search/jql) ---
interface JiraSearchResponse {
    issues: Array<{
        id: string;
        key: string;
        self: string;
        fields: {
            summary: string;
            status: { name: string };
            issuetype: { name: string };
            assignee: { displayName: string } | null;
            reporter: { displayName: string } | null;
            priority: { name: string } | null;
            created: string;
            updated: string;
        };
    }>;
    isLast: boolean;
}

// --- Action ---
const action = createAction({
    description: 'List issues from a Jira project using JQL search',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/jira/issues', group: 'Issues' },
    scopes: ['read:jira-work'],
    input: listIssuesInputSchema,
    output: listIssuesOutputSchema,

    exec: async (nango, input) => {
        const cloudId = await getCloudId(nango);

        // Build JQL query
        let jql: string;
        if (input.jql) {
            jql = input.jql;
        } else {
            const clauses: string[] = [`project = "${input.project}"`];
            if (input.status) {
                clauses.push(`status = "${input.status}"`);
            }
            if (input.assignee) {
                clauses.push(`assignee = ${input.assignee}`);
            }
            jql = clauses.join(' AND ') + ' ORDER BY created DESC';
        }

        const maxResults = Math.min(input.maxResults ?? 50, 100);
        const startAt = input.startAt ?? 0;

        const response = await nango.proxy<JiraSearchResponse>({
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `/ex/jira/${cloudId}/rest/api/3/search/jql`,
            params: {
                jql,
                maxResults: String(maxResults),
                startAt: String(startAt),
                fields: 'summary,status,issuetype,assignee,reporter,priority,created,updated',
            },
            headers: {
                'X-Atlassian-Token': 'no-check',
            },
            retries: 3,
        });

        const data = response.data;
        const issues: JiraIssue[] = data.issues.map((issue) => ({
            id: issue.id,
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            issueType: issue.fields.issuetype.name,
            assignee: issue.fields.assignee?.displayName ?? null,
            reporter: issue.fields.reporter?.displayName ?? null,
            priority: issue.fields.priority?.name ?? null,
            created: issue.fields.created,
            updated: issue.fields.updated,
            url: `https://api.atlassian.com/ex/jira/${cloudId}/browse/${issue.key}`,
        }));

        return {
            issues,
            total: issues.length,
            startAt,
            maxResults,
        };
    },
});

export default action;
