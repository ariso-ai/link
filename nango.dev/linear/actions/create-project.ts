import { createAction } from 'nango';
import * as z from 'zod';
import {
    projectFieldsFragment,
    linearProjectSchema,
    mapLinearProject,
    type LinearProjectRaw,
} from '../helpers/project-fields.js';

const createProjectInputSchema = z.object({
    name: z.string().min(1).describe('Project name'),
    teamIds: z
        .array(z.string())
        .min(1)
        .describe('UUIDs of the teams this project belongs to. At least one is required.'),
    description: z.string().optional().describe('Short project description'),
    content: z.string().optional().describe('Full project content as markdown'),
    leadId: z.string().optional().describe('UUID of the user who leads the project'),
    memberIds: z.array(z.string()).optional().describe('UUIDs of users to add as project members'),
    statusId: z
        .string()
        .optional()
        .describe('UUID of the workspace project status. Omit to use the default for the first team.'),
    priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe('Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low'),
    startDate: z.string().optional().describe('Planned start date (YYYY-MM-DD)'),
    targetDate: z.string().optional().describe('Planned target date (YYYY-MM-DD)'),
    color: z.string().optional().describe('Hex color (e.g. "#4cb782")'),
    icon: z.string().optional().describe('Icon name'),
});

const createProjectOutputSchema = linearProjectSchema;

interface LinearProjectCreateResponse {
    data: {
        projectCreate: {
            success: boolean;
            project: LinearProjectRaw;
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'Create a new project in Linear',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/linear/projects', group: 'Projects' },
    scopes: ['write'],
    input: createProjectInputSchema,
    output: createProjectOutputSchema,

    exec: async (nango, input) => {
        const createInput: Record<string, unknown> = {
            name: input.name,
            teamIds: input.teamIds,
        };
        if (input.description !== undefined) createInput['description'] = input.description;
        if (input.content !== undefined) createInput['content'] = input.content;
        if (input.leadId !== undefined) createInput['leadId'] = input.leadId;
        if (input.memberIds !== undefined) createInput['memberIds'] = input.memberIds;
        if (input.statusId !== undefined) createInput['statusId'] = input.statusId;
        if (input.priority !== undefined) createInput['priority'] = input.priority;
        if (input.startDate !== undefined) createInput['startDate'] = input.startDate;
        if (input.targetDate !== undefined) createInput['targetDate'] = input.targetDate;
        if (input.color !== undefined) createInput['color'] = input.color;
        if (input.icon !== undefined) createInput['icon'] = input.icon;

        const mutation = `
            mutation CreateProject($input: ProjectCreateInput!) {
                projectCreate(input: $input) {
                    success
                    project {
                        ${projectFieldsFragment}
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearProjectCreateResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query: mutation,
                variables: { input: createInput },
            },
            retries: 0,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const { success, project } = response.data.data.projectCreate;
        if (!success) {
            throw new Error('Linear reported projectCreate as unsuccessful');
        }

        return mapLinearProject(project);
    },
});

export default action;
