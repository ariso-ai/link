import { createAction } from 'nango';
import * as z from 'zod';
import {
    teamFieldsFragment,
    linearTeamSchema,
    mapLinearTeam,
    type LinearTeamRaw,
} from '../helpers/team-fields.js';

const listTeamsInputSchema = z.object({
    query: z.string().optional().describe('Filter teams whose name contains this string (case-insensitive)'),
    limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of teams to return (default 50, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
});

const listTeamsOutputSchema = z.object({
    teams: z.array(linearTeamSchema),
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});

interface LinearTeamsResponse {
    data: {
        teams: {
            nodes: LinearTeamRaw[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'List all teams in the Linear workspace',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/teams', group: 'Teams' },
    scopes: ['read'],
    input: listTeamsInputSchema,
    output: listTeamsOutputSchema,

    exec: async (nango, input) => {
        const first = Math.min(input.limit ?? 50, 100);

        const filter: Record<string, unknown> = {};
        if (input.query) filter['name'] = { containsIgnoreCase: input.query };

        const query = `
            query ListTeams($filter: TeamFilter, $first: Int!, $after: String) {
                teams(filter: $filter, first: $first, after: $after) {
                    nodes {
                        ${teamFieldsFragment}
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearTeamsResponse>({
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

        const { nodes, pageInfo } = response.data.data.teams;

        return {
            teams: nodes.map(mapLinearTeam),
            hasNextPage: pageInfo.hasNextPage,
            endCursor: pageInfo.endCursor,
        };
    },
});

export default action;
