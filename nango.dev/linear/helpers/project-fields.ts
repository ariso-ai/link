import * as z from 'zod';

export const projectFieldsFragment = `
    id
    name
    slugId
    description
    url
    state
    priority
    priorityLabel
    progress
    scope
    startDate
    targetDate
    startedAt
    completedAt
    canceledAt
    color
    icon
    createdAt
    updatedAt
    lead {
        id
        name
        email
    }
    creator {
        id
        name
        email
    }
    teams {
        nodes {
            id
            key
            name
        }
    }
`;

export interface LinearProjectRaw {
    id: string;
    name: string;
    slugId: string;
    description: string | null;
    url: string;
    state: string;
    priority: number;
    priorityLabel: string;
    progress: number;
    scope: number;
    startDate: string | null;
    targetDate: string | null;
    startedAt: string | null;
    completedAt: string | null;
    canceledAt: string | null;
    color: string | null;
    icon: string | null;
    createdAt: string;
    updatedAt: string;
    lead: { id: string; name: string; email: string } | null;
    creator: { id: string; name: string; email: string } | null;
    teams: { nodes: Array<{ id: string; key: string; name: string }> };
}

export const linearProjectSchema = z.object({
    id: z.string(),
    name: z.string(),
    slugId: z.string(),
    description: z.string().nullable(),
    url: z.string(),
    state: z.string(),
    priority: z.number(),
    priorityLabel: z.string(),
    progress: z.number(),
    scope: z.number(),
    startDate: z.string().nullable(),
    targetDate: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    canceledAt: z.string().nullable(),
    color: z.string().nullable(),
    icon: z.string().nullable(),
    lead: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
    creator: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
    teams: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type LinearProject = z.infer<typeof linearProjectSchema>;

export function mapLinearProject(project: LinearProjectRaw): LinearProject {
    return {
        id: project.id,
        name: project.name,
        slugId: project.slugId,
        description: project.description,
        url: project.url,
        state: project.state,
        priority: project.priority,
        priorityLabel: project.priorityLabel,
        progress: project.progress,
        scope: project.scope,
        startDate: project.startDate,
        targetDate: project.targetDate,
        startedAt: project.startedAt,
        completedAt: project.completedAt,
        canceledAt: project.canceledAt,
        color: project.color,
        icon: project.icon,
        lead: project.lead,
        creator: project.creator,
        teams: project.teams.nodes,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}

export const projectUpdateFieldsFragment = `
    id
    body
    health
    url
    createdAt
    updatedAt
    user {
        id
        name
        email
    }
    project {
        id
        name
    }
`;

export interface LinearProjectUpdateRaw {
    id: string;
    body: string;
    health: string | null;
    url: string;
    createdAt: string;
    updatedAt: string;
    user: { id: string; name: string; email: string } | null;
    project: { id: string; name: string };
}

export const linearProjectUpdateSchema = z.object({
    id: z.string(),
    body: z.string(),
    health: z.string().nullable(),
    url: z.string(),
    user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
    project: z.object({ id: z.string(), name: z.string() }),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type LinearProjectUpdate = z.infer<typeof linearProjectUpdateSchema>;

export function mapLinearProjectUpdate(update: LinearProjectUpdateRaw): LinearProjectUpdate {
    return {
        id: update.id,
        body: update.body,
        health: update.health,
        url: update.url,
        user: update.user,
        project: update.project,
        createdAt: update.createdAt,
        updatedAt: update.updatedAt,
    };
}
