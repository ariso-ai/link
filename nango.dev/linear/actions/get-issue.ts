import { createAction } from 'nango';
import * as z from 'zod';
import { issueFieldsFragment, type LinearIssueRaw } from '../helpers/issue-fields.js';

// --- Input schema ---
const getIssueInputSchema = z.object({
    issueId: z
        .string()
        .describe('Linear issue UUID or human identifier (e.g. "ENG-123"). Both are accepted.'),
});

// --- Output schema ---
const getIssueOutputSchema = z.object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    url: z.string(),
    priority: z.number(),
    priorityLabel: z.string(),
    state: z.object({ id: z.string(), name: z.string(), type: z.string() }),
    team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
    assignee: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
    creator: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
    labels: z.array(z.object({ id: z.string(), name: z.string() })),
    createdAt: z.string(),
    updatedAt: z.string(),
});

// --- Linear GraphQL response types ---
interface LinearGetByIdResponse {
    data: { issue: LinearIssueRaw | null };
    errors?: Array<{ message: string }>;
}

interface LinearGetByIdentifierResponse {
    data: {
        issues: { nodes: LinearIssueRaw[] };
    };
    errors?: Array<{ message: string }>;
}

// Linear identifiers look like "ENG-123" (team key + hyphen + number).
const IDENTIFIER_REGEX = /^([A-Z][A-Z0-9]*)-(\d+)$/;

// --- Action ---
const action = createAction({
    description: 'Get a single Linear issue by its UUID or human identifier (e.g. "ENG-123")',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/issues/:issueId', group: 'Issues' },
    scopes: ['read'],
    input: getIssueInputSchema,
    output: getIssueOutputSchema,

    exec: async (nango, input) => {
        const identifierMatch = input.issueId.match(IDENTIFIER_REGEX);

        let issue: LinearIssueRaw | null;

        if (identifierMatch) {
            const teamKey = identifierMatch[1]!;
            const issueNumber = Number(identifierMatch[2]!);

            const query = `
                query GetIssueByIdentifier($teamKey: String!, $number: Float!) {
                    issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }, first: 1) {
                        nodes {
                            ${issueFieldsFragment}
                        }
                    }
                }
            `;

            const response = await nango.proxy<LinearGetByIdentifierResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { teamKey, number: issueNumber } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            issue = response.data.data.issues.nodes[0] ?? null;
        } else {
            const query = `
                query GetIssue($id: String!) {
                    issue(id: $id) {
                        ${issueFieldsFragment}
                    }
                }
            `;

            const response = await nango.proxy<LinearGetByIdResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { id: input.issueId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            issue = response.data.data.issue;
        }

        if (!issue) {
            throw new Error(`Linear issue "${input.issueId}" not found`);
        }

        return {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            url: issue.url,
            priority: issue.priority,
            priorityLabel: issue.priorityLabel,
            state: issue.state,
            team: issue.team,
            assignee: issue.assignee,
            creator: issue.creator,
            labels: issue.labels.nodes,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
        };
    },
});

export default action;
