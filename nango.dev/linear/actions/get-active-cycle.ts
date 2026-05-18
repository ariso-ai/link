import { createAction } from 'nango';
import * as z from 'zod';
import {
    cycleFieldsFragment,
    linearCycleSchema,
    mapLinearCycle,
    type LinearCycleRaw,
} from '../helpers/cycle-fields.js';

const getActiveCycleInputSchema = z.object({
    teamKey: z.string().describe('Linear team key (e.g. "ENG") whose active cycle to fetch'),
});

const getActiveCycleOutputSchema = linearCycleSchema;

interface LinearActiveCycleResponse {
    data: {
        cycles: { nodes: LinearCycleRaw[] };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'Get the currently active cycle for a Linear team by team key',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/teams/:teamKey/active-cycle', group: 'Cycles' },
    scopes: ['read'],
    input: getActiveCycleInputSchema,
    output: getActiveCycleOutputSchema,

    exec: async (nango, input) => {
        const query = `
            query GetActiveCycle($teamKey: String!) {
                cycles(
                    filter: { team: { key: { eq: $teamKey } }, isActive: { eq: true } }
                    first: 1
                ) {
                    nodes {
                        ${cycleFieldsFragment}
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearActiveCycleResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: { query, variables: { teamKey: input.teamKey } },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const cycle = response.data.data.cycles.nodes[0];
        if (!cycle) {
            throw new Error(`No active cycle found for team "${input.teamKey}"`);
        }

        return mapLinearCycle(cycle);
    },
});

export default action;
