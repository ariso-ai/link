import * as z from 'zod';

export const cycleFieldsFragment = `
    id
    number
    name
    description
    startsAt
    endsAt
    completedAt
    progress
    createdAt
    updatedAt
    team {
        id
        key
        name
    }
`;

export interface LinearCycleRaw {
    id: string;
    number: number;
    name: string | null;
    description: string | null;
    startsAt: string;
    endsAt: string;
    completedAt: string | null;
    progress: number;
    createdAt: string;
    updatedAt: string;
    team: { id: string; key: string; name: string };
}

export const linearCycleSchema = z.object({
    id: z.string(),
    number: z.number(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    completedAt: z.string().nullable(),
    progress: z.number(),
    team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type LinearCycle = z.infer<typeof linearCycleSchema>;

export function mapLinearCycle(cycle: LinearCycleRaw): LinearCycle {
    return {
        id: cycle.id,
        number: cycle.number,
        name: cycle.name,
        description: cycle.description,
        startsAt: cycle.startsAt,
        endsAt: cycle.endsAt,
        completedAt: cycle.completedAt,
        progress: cycle.progress,
        team: cycle.team,
        createdAt: cycle.createdAt,
        updatedAt: cycle.updatedAt,
    };
}
