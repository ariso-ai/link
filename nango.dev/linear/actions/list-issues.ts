import { createAction } from 'nango';
import * as z from 'zod';
import { issueFieldsFragment, type LinearIssueRaw } from '../helpers/issue-fields.js';

// --- Input schema ---
const listIssuesInputSchema = z.object({
    teamKey: z.string().optional().describe('Linear team key (e.g. "ENG") to scope the search to one team'),
    stateName: z.string().optional().describe('Filter by workflow state name (e.g. "In Progress", "Done")'),
    stateType: z
        .enum(['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'])
        .optional()
        .describe('Filter by workflow state category'),
    assigneeEmail: z.string().optional().describe('Filter by assignee email'),
    query: z.string().optional().describe('Full-text search across title and description'),
    limit: z.number().optional().describe('Maximum number of issues to return (default 50, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
});

// --- Output schemas ---
const linearIssueSchema = z.object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    url: z.string(),
    priority: z.number(),
    priorityLabel: z.string(),
    state: z.object({ name: z.string(), type: z.string() }),
    team: z.object({ key: z.string(), name: z.string() }),
    assignee: z.object({ name: z.string(), email: z.string() }).nullable(),
    labels: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
});

const listIssuesOutputSchema = z.object({
    issues: z.array(linearIssueSchema),
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});

type LinearIssue = z.infer<typeof linearIssueSchema>;

// --- Linear GraphQL response types ---
interface LinearIssuesResponse {
    data: {
        issues: {
            nodes: LinearIssueRaw[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

// --- Action ---
const action = createAction({
    description: 'List issues from Linear with optional filters (team, state, assignee, text search)',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/issues', group: 'Issues' },
    scopes: ['read'],
    input: listIssuesInputSchema,
    output: listIssuesOutputSchema,

    exec: async (nango, input) => {
        const first = Math.min(input.limit ?? 50, 100);

        // Build filter object
        const filter: Record<string, unknown> = {};
        if (input.teamKey) filter['team'] = { key: { eq: input.teamKey } };
        if (input.stateName) filter['state'] = { name: { eq: input.stateName } };
        if (input.stateType) {
            filter['state'] = { ...(filter['state'] as object | undefined), type: { eq: input.stateType } };
        }
        if (input.assigneeEmail) filter['assignee'] = { email: { eq: input.assigneeEmail } };
        if (input.query) {
            filter['or'] = [
                { title: { containsIgnoreCase: input.query } },
                { description: { containsIgnoreCase: input.query } },
            ];
        }

        const query = `
            query ListIssues($filter: IssueFilter, $first: Int!, $after: String) {
                issues(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
                    nodes {
                        ${issueFieldsFragment}
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearIssuesResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query,
                variables: { filter, first, after: input.after ?? null },
            },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(`Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`);
        }

        const { nodes, pageInfo } = response.data.data.issues;

        const issues: LinearIssue[] = nodes.map((n) => ({
            id: n.id,
            identifier: n.identifier,
            title: n.title,
            description: n.description,
            url: n.url,
            priority: n.priority,
            priorityLabel: n.priorityLabel,
            state: { name: n.state.name, type: n.state.type },
            team: { key: n.team.key, name: n.team.name },
            assignee: n.assignee ? { name: n.assignee.name, email: n.assignee.email } : null,
            labels: n.labels.nodes.map((l) => l.name),
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
        }));

        return {
            issues,
            hasNextPage: pageInfo.hasNextPage,
            endCursor: pageInfo.endCursor,
        };
    },
});

export default action;
