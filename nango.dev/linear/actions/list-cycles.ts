import { createAction } from 'nango';
import * as z from 'zod';
import {
    cycleFieldsFragment,
    linearCycleSchema,
    mapLinearCycle,
    type LinearCycleRaw,
} from '../helpers/cycle-fields.js';

const listCyclesInputSchema = z.object({
    teamKey: z.string().optional().describe('Linear team key (e.g. "ENG") to scope cycles to one team'),
    type: z
        .enum(['active', 'next', 'previous', 'future', 'past'])
        .optional()
        .describe('Only return active / next / previous / future / past cycles'),
    limit: z.number().optional().describe('Maximum number of cycles to return (default 25, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
});

const listCyclesOutputSchema = z.object({
    cycles: z.array(linearCycleSchema),
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});

interface LinearCyclesResponse {
    data: {
        cycles: {
            nodes: LinearCycleRaw[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'List cycles from Linear with optional filters (team, active/next/past)',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/cycles', group: 'Cycles' },
    scopes: ['read'],
    input: listCyclesInputSchema,
    output: listCyclesOutputSchema,

    exec: async (nango, input) => {
        const first = Math.min(input.limit ?? 25, 100);

        const filter: Record<string, unknown> = {};
        if (input.teamKey) filter['team'] = { key: { eq: input.teamKey } };
        if (input.type === 'active') filter['isActive'] = { eq: true };
        if (input.type === 'next') filter['isNext'] = { eq: true };
        if (input.type === 'previous') filter['isPrevious'] = { eq: true };
        if (input.type === 'future') filter['isFuture'] = { eq: true };
        if (input.type === 'past') filter['isPast'] = { eq: true };

        const query = `
            query ListCycles($filter: CycleFilter, $first: Int!, $after: String) {
                cycles(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
                    nodes {
                        ${cycleFieldsFragment}
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearCyclesResponse>({
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

        const { nodes, pageInfo } = response.data.data.cycles;

        return {
            cycles: nodes.map(mapLinearCycle),
            hasNextPage: pageInfo.hasNextPage,
            endCursor: pageInfo.endCursor,
        };
    },
});

export default action;
