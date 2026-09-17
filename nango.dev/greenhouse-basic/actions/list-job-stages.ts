import { createAction } from 'nango';
import * as z from 'zod';

const listJobStagesInputSchema = z.object({
    jobId: z.number().describe('Greenhouse job ID'),
});

const interviewSchema = z.object({
    id: z.number().describe('Interview ID — pass this as interviewId to schedule-interview'),
    name: z.string(),
    schedulable: z.boolean(),
    estimatedMinutes: z.number().nullable(),
});

const stageSchema = z.object({
    id: z.number(),
    name: z.string(),
    priority: z.number().nullable().describe('Order of the stage within the job\'s pipeline'),
    interviews: z.array(interviewSchema),
});

const listJobStagesOutputSchema = z.object({
    jobId: z.number(),
    stages: z.array(stageSchema),
});

type Stage = z.infer<typeof stageSchema>;

interface GreenhouseStage {
    id: number;
    name: string;
    priority: number | null;
    interviews: Array<{
        id: number;
        name: string;
        schedulable: boolean;
        estimated_minutes: number | null;
    }> | null;
}

const action = createAction({
    description: 'List the interview stages configured for a Greenhouse job, along with the interviews in each stage. This is where the interviewId required by schedule-interview comes from.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/greenhouse/jobs/stages', group: 'Jobs' },
    input: listJobStagesInputSchema,
    output: listJobStagesOutputSchema,

    exec: async (nango, input) => {
        const response = await nango.proxy<GreenhouseStage[]>({
            endpoint: `/v1/jobs/${input.jobId}/stages`,
            retries: 3,
        });

        const stages: Stage[] = (response.data ?? []).map((stage) => ({
            id: stage.id,
            name: stage.name,
            priority: stage.priority ?? null,
            interviews: (stage.interviews ?? []).map((interview) => ({
                id: interview.id,
                name: interview.name,
                schedulable: interview.schedulable,
                estimatedMinutes: interview.estimated_minutes ?? null,
            })),
        }));

        return {
            jobId: input.jobId,
            stages,
        };
    },
});

export default action;
