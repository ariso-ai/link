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
