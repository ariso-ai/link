import { createAction } from 'nango';
import * as z from 'zod';
import {
    teamFieldsFragment,
    linearTeamSchema,
    mapLinearTeam,
    type LinearTeamRaw,
} from '../helpers/team-fields.js';

const getTeamInputSchema = z.object({
    teamId: z
        .string()
        .describe('Linear team UUID or team key (e.g. "ENG"). Both are accepted.'),
});

const getTeamOutputSchema = linearTeamSchema;

interface LinearTeamByIdResponse {
    data: { team: LinearTeamRaw | null };
    errors?: Array<{ message: string }>;
}

interface LinearTeamByKeyResponse {
    data: { teams: { nodes: LinearTeamRaw[] } };
    errors?: Array<{ message: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const action = createAction({
    description: 'Get a single Linear team by UUID or team key (e.g. "ENG")',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/teams/:teamId', group: 'Teams' },
    scopes: ['read'],
    input: getTeamInputSchema,
    output: getTeamOutputSchema,

    exec: async (nango, input) => {
        let team: LinearTeamRaw | null;

        if (UUID_REGEX.test(input.teamId)) {
            const query = `
                query GetTeam($id: String!) {
                    team(id: $id) {
                        ${teamFieldsFragment}
                    }
                }
            `;

            const response = await nango.proxy<LinearTeamByIdResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { id: input.teamId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            team = response.data.data.team;
        } else {
            const query = `
                query GetTeamByKey($key: String!) {
                    teams(filter: { key: { eq: $key } }, first: 1) {
                        nodes {
                            ${teamFieldsFragment}
                        }
                    }
                }
            `;

            const response = await nango.proxy<LinearTeamByKeyResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { key: input.teamId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            team = response.data.data.teams.nodes[0] ?? null;
        }

        if (!team) {
            throw new Error(`Linear team "${input.teamId}" not found`);
        }

        return mapLinearTeam(team);
    },
});

export default action;
