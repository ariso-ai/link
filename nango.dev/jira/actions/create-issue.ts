import { createAction } from 'nango';
import * as z from 'zod';
import { getCloudId } from '../helpers/get-cloud-id.js';

// --- Input schema ---
const createIssueInputSchema = z.object({
    project: z.string().describe('Jira project key (e.g. "KAN")'),
    summary: z.string().describe('Issue title/summary'),
    issueType: z.string().describe('Issue type name (e.g. "Task", "Bug", "Story")'),
    description: z.string().optional().describe('Plain text description (converted to Atlassian Document Format)'),
    assignee: z.string().optional().describe('Assignee account ID'),
    labels: z.array(z.string()).optional().describe('Array of label strings'),
    priority: z.string().optional().describe('Priority name (e.g. "High", "Medium", "Low")'),
});

// --- Output schema ---
const createIssueOutputSchema = z.object({
    id: z.string(),
    key: z.string(),
    self: z.string(),
});

// --- Jira API types ---
interface JiraCreateIssueResponse {
    id: string;
    key: string;
    self: string;
}

/**
 * Convert plain text to Atlassian Document Format (ADF).
 * Jira REST API v3 requires ADF for the description field.
 */
function toADF(text: string) {
    return {
        type: 'doc',
        version: 1,
        content: text.split('\n\n').map((paragraph) => ({
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: paragraph,
                },
            ],
        })),
    };
}

// --- Action ---
const action = createAction({
    description: 'Create an issue in Jira',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/jira/issues', group: 'Issues' },
    scopes: ['write:jira-work'],
    input: createIssueInputSchema,
    output: createIssueOutputSchema,

    exec: async (nango, input) => {
        const cloudId = await getCloudId(nango);

        // Build the fields object in the format Jira API v3 expects
        const fields: Record<string, unknown> = {
            project: { key: input.project },
            summary: input.summary,
            issuetype: { name: input.issueType },
        };

        if (input.description) {
            fields['description'] = toADF(input.description);
        }

        if (input.assignee) {
            fields['assignee'] = { accountId: input.assignee };
        }

        if (input.labels && input.labels.length > 0) {
            fields['labels'] = input.labels;
        }

        if (input.priority) {
            fields['priority'] = { name: input.priority };
        }

        const response = await nango.proxy<JiraCreateIssueResponse>({
            method: 'POST',
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `/ex/jira/${cloudId}/rest/api/3/issue`,
            headers: {
                'X-Atlassian-Token': 'no-check',
            },
            data: { fields },
            retries: 3,
        });

        return response.data;
    },
});

export default action;
