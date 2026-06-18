// SPDX-License-Identifier: BUSL-1.1

export type LearnerPersona = 'teen' | 'adult';
export type ExpertiseTier = 'beginner' | 'intermediate' | 'advanced';
export type TopicRisk = 'fundamental' | 'advanced';

export interface CurriculumTopic {
  readonly id: string;
  readonly order: number;
  readonly risk: TopicRisk;
  readonly prerequisites: readonly string[];
}

export interface BeginnerModeInput {
  readonly age: number;
  readonly persona: LearnerPersona;
  readonly expertiseTier: ExpertiseTier;
  readonly optedInAdvancedTopicIds: readonly string[];
  readonly completedTopicIds: readonly string[];
}

export interface BeginnerModeDecision {
  readonly eligibleTopicIds: readonly string[];
  readonly copyToken: 'teen-beginner' | 'adult-beginner' | 'standard';
}

export function decideBeginnerCurriculum(
  topics: readonly CurriculumTopic[],
  input: BeginnerModeInput,
): BeginnerModeDecision {
  const completed = new Set(input.completedTopicIds);
  const eligibleTopicIds = [...topics]
    .sort((a, b) => a.order - b.order)
    .filter((topic) => topic.prerequisites.every((id) => completed.has(id)))
    .filter((topic) => {
      if (topic.risk === 'fundamental') return true;
      if (input.expertiseTier !== 'beginner') return true;
      return input.optedInAdvancedTopicIds.includes(topic.id);
    })
    .map((topic) => topic.id);
  const copyToken =
    input.persona === 'teen' || input.age < 18
      ? 'teen-beginner'
      : input.expertiseTier === 'beginner'
        ? 'adult-beginner'
        : 'standard';
  return { eligibleTopicIds, copyToken };
}
