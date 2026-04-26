import { createAction } from 'nango';
import * as z from 'zod';
import {
    issueFieldsFragment,
    linearIssueSchema,
    mapLinearIssue,
    type LinearIssueRaw,
} from '../helpers/issue-fields.js';

// --- Input schema ---
const updateIssueInputSchema = z.object({
    issueId: z.string().describe('Linear issue UUID (not the human identifier like "ENG-123")'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description (markdown)'),
    stateId: z
        .string()
        .optional()
        .describe('New workflow state UUID. Use "list-workflow-states" to discover IDs per team.'),
    assigneeId: z
        .string()
        .nullable()
        .optional()
        .describe('New assignee user UUID, or null to unassign'),
    priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe('Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low'),
    labelIds: z.array(z.string()).optional().describe('Replace the issue label IDs with this list'),
});

// --- Output schema ---
const updateIssueOutputSchema = linearIssueSchema;

// --- Linear GraphQL response types ---
interface LinearUpdateIssueResponse {
    data: {
        issueUpdate: {
            success: boolean;
            issue: LinearIssueRaw;
        };
    };
    errors?: Array<{ message: string }>;
}

// --- Action ---
const action = createAction({
    description: 'Update a Linear issue (title, description, state, assignee, priority, labels)',
    version: '1.0.0',
    endpoint: { method: 'PATCH', path: '/linear/issues/:issueId', group: 'Issues' },
    scopes: ['write'],
    input: updateIssueInputSchema,
    output: updateIssueOutputSchema,

    exec: async (nango, input) => {
        const updateInput: Record<string, unknown> = {};
        if (input.title !== undefined) updateInput['title'] = input.title;
        if (input.description !== undefined) updateInput['description'] = input.description;
        if (input.stateId !== undefined) updateInput['stateId'] = input.stateId;
        // null is forwarded as-is to clear the assignee.
        if (input.assigneeId !== undefined) updateInput['assigneeId'] = input.assigneeId;
        if (input.priority !== undefined) updateInput['priority'] = input.priority;
        if (input.labelIds !== undefined) updateInput['labelIds'] = input.labelIds;

        if (Object.keys(updateInput).length === 0) {
            throw new Error('No update fields provided. Supply at least one of: title, description, stateId, assigneeId, priority, labelIds.');
        }

        const mutation = `
            mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
                issueUpdate(id: $id, input: $input) {
                    success
                    issue {
                        ${issueFieldsFragment}
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearUpdateIssueResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query: mutation,
                variables: { id: input.issueId, input: updateInput },
            },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const { success, issue } = response.data.data.issueUpdate;
        if (!success) {
            throw new Error('Linear reported issueUpdate as unsuccessful');
        }

        return mapLinearIssue(issue);
    },
});

export default action;
