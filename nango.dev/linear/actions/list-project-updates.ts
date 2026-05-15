import { createAction } from 'nango';
import * as z from 'zod';
import {
    projectUpdateFieldsFragment,
    linearProjectUpdateSchema,
    mapLinearProjectUpdate,
    type LinearProjectUpdateRaw,
} from '../helpers/project-fields.js';

const listProjectUpdatesInputSchema = z.object({
    projectId: z.string().describe('Linear project UUID to list status updates for'),
    health: z
        .enum(['onTrack', 'atRisk', 'offTrack'])
        .optional()
        .describe('Filter by update health'),
    limit: z.number().optional().describe('Maximum number of updates to return (default 25, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
});

const listProjectUpdatesOutputSchema = z.object({
    updates: z.array(linearProjectUpdateSchema),
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});

interface LinearProjectUpdatesResponse {
    data: {
        projectUpdates: {
            nodes: LinearProjectUpdateRaw[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'List status updates for a Linear project, newest first',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/projects/:projectId/updates', group: 'Projects' },
    scopes: ['read'],
    input: listProjectUpdatesInputSchema,
    output: listProjectUpdatesOutputSchema,

    exec: async (nango, input) => {
        const first = Math.min(input.limit ?? 25, 100);

        const filter: Record<string, unknown> = {
            project: { id: { eq: input.projectId } },
        };
        if (input.health) filter['health'] = { eq: input.health };

        const query = `
            query ListProjectUpdates($filter: ProjectUpdateFilter, $first: Int!, $after: String) {
                projectUpdates(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
                    nodes {
                        ${projectUpdateFieldsFragment}
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearProjectUpdatesResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query,
                variables: { filter, first, after: input.after ?? null },
            },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const { nodes, pageInfo } = response.data.data.projectUpdates;

        return {
            updates: nodes.map(mapLinearProjectUpdate),
            hasNextPage: pageInfo.hasNextPage,
            endCursor: pageInfo.endCursor,
        };
    },
});

export default action;
