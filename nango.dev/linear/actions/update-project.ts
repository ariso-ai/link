import { createAction } from 'nango';
import * as z from 'zod';
import {
    projectFieldsFragment,
    linearProjectSchema,
    mapLinearProject,
    type LinearProjectRaw,
} from '../helpers/project-fields.js';

const updateProjectInputSchema = z.object({
    projectId: z.string().describe('Linear project UUID (not the slug)'),
    name: z.string().optional().describe('New project name'),
    description: z.string().optional().describe('New short description'),
    content: z.string().optional().describe('New full content (markdown)'),
    leadId: z.string().nullable().optional().describe('New lead user UUID, or null to clear'),
    statusId: z.string().optional().describe('New project status UUID'),
    priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe('Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low'),
    startDate: z.string().nullable().optional().describe('Planned start date (YYYY-MM-DD), or null to clear'),
    targetDate: z.string().nullable().optional().describe('Planned target date (YYYY-MM-DD), or null to clear'),
    color: z.string().optional().describe('Hex color (e.g. "#4cb782")'),
    icon: z.string().optional().describe('Icon name'),
    memberIds: z.array(z.string()).optional().describe('Replace project members with this list of user UUIDs'),
});

const updateProjectOutputSchema = linearProjectSchema;

interface LinearProjectUpdateResponse {
    data: {
        projectUpdate: {
            success: boolean;
            project: LinearProjectRaw;
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'Update a Linear project (name, description, lead, status, priority, dates, members)',
    version: '1.0.0',
    endpoint: { method: 'PATCH', path: '/linear/projects/:projectId', group: 'Projects' },
    scopes: ['write'],
    input: updateProjectInputSchema,
    output: updateProjectOutputSchema,

    exec: async (nango, input) => {
        const updateInput: Record<string, unknown> = {};
        if (input.name !== undefined) updateInput['name'] = input.name;
        if (input.description !== undefined) updateInput['description'] = input.description;
        if (input.content !== undefined) updateInput['content'] = input.content;
        if (input.leadId !== undefined) updateInput['leadId'] = input.leadId;
        if (input.statusId !== undefined) updateInput['statusId'] = input.statusId;
        if (input.priority !== undefined) updateInput['priority'] = input.priority;
        if (input.startDate !== undefined) updateInput['startDate'] = input.startDate;
        if (input.targetDate !== undefined) updateInput['targetDate'] = input.targetDate;
        if (input.color !== undefined) updateInput['color'] = input.color;
        if (input.icon !== undefined) updateInput['icon'] = input.icon;
        if (input.memberIds !== undefined) updateInput['memberIds'] = input.memberIds;

        if (Object.keys(updateInput).length === 0) {
            throw new Error(
                'No update fields provided. Supply at least one of: name, description, content, leadId, statusId, priority, startDate, targetDate, color, icon, memberIds.',
            );
        }

        const mutation = `
            mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
                projectUpdate(id: $id, input: $input) {
                    success
                    project {
                        ${projectFieldsFragment}
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearProjectUpdateResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query: mutation,
                variables: { id: input.projectId, input: updateInput },
            },
            retries: 0,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const { success, project } = response.data.data.projectUpdate;
        if (!success) {
            throw new Error('Linear reported projectUpdate as unsuccessful');
        }

        return mapLinearProject(project);
    },
});

export default action;
