import { createAction } from 'nango';
import * as z from 'zod';
import {
    projectUpdateFieldsFragment,
    linearProjectUpdateSchema,
    mapLinearProjectUpdate,
    type LinearProjectUpdateRaw,
} from '../helpers/project-fields.js';

const addProjectUpdateInputSchema = z.object({
    projectId: z.string().describe('Linear project UUID to add the status update to'),
    body: z.string().min(1).describe('Update body in markdown'),
    health: z
        .enum(['onTrack', 'atRisk', 'offTrack'])
        .optional()
        .describe('Project health at the time of the update'),
});

const addProjectUpdateOutputSchema = linearProjectUpdateSchema;

interface LinearProjectUpdateCreateResponse {
    data: {
        projectUpdateCreate: {
            success: boolean;
            projectUpdate: LinearProjectUpdateRaw;
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'Add a status update to a Linear project (body + optional health)',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/linear/projects/:projectId/updates', group: 'Projects' },
    scopes: ['write'],
    input: addProjectUpdateInputSchema,
    output: addProjectUpdateOutputSchema,

    exec: async (nango, input) => {
        const createInput: Record<string, unknown> = {
            projectId: input.projectId,
            body: input.body,
        };
        if (input.health !== undefined) createInput['health'] = input.health;

        const mutation = `
            mutation AddProjectUpdate($input: ProjectUpdateCreateInput!) {
                projectUpdateCreate(input: $input) {
                    success
                    projectUpdate {
                        ${projectUpdateFieldsFragment}
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearProjectUpdateCreateResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query: mutation,
                variables: { input: createInput },
            },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const { success, projectUpdate } = response.data.data.projectUpdateCreate;
        if (!success) {
            throw new Error('Linear reported projectUpdateCreate as unsuccessful');
        }

        return mapLinearProjectUpdate(projectUpdate);
    },
});

export default action;
