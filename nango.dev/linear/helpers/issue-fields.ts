import * as z from 'zod';

/**
 * GraphQL fragment for the issue fields we expose on every issue-returning action.
 * Shared across list-issues, get-issue, and update-issue to keep the output schema consistent.
 */
export const issueFieldsFragment = `
    id
    identifier
    title
    description
    url
    priority
    priorityLabel
    createdAt
    updatedAt
    state {
        id
        name
        type
    }
    team {
        id
        key
        name
    }
    assignee {
        id
        name
        email
    }
    creator {
        id
        name
        email
    }
    labels {
        nodes {
            id
            name
        }
    }
`;

export interface LinearIssueRaw {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    url: string;
    priority: number;
    priorityLabel: string;
    createdAt: string;
    updatedAt: string;
    state: { id: string; name: string; type: string };
    team: { id: string; key: string; name: string };
    assignee: { id: string; name: string; email: string } | null;
    creator: { id: string; name: string; email: string } | null;
    labels: { nodes: Array<{ id: string; name: string }> };
}

/**
 * Shared zod output schema for issue-returning actions. Using one shape across
 * list-issues, get-issue, and update-issue means callers can reliably chain
 * results (e.g. list -> update by labelId) without losing fields.
 */
export const linearIssueSchema = z.object({
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

export type LinearIssue = z.infer<typeof linearIssueSchema>;

/**
 * Shape the raw GraphQL issue payload into the public output schema.
 * Flattens labels.nodes -> labels and keeps nullable fields intact.
 */
export function mapLinearIssue(issue: LinearIssueRaw): LinearIssue {
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
}
