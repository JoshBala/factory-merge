import type { AutomationRule, GameAction, GameState } from '@/types/game';

export type AutomationLastOutcome = 'idle' | 'success' | 'blocked';

export interface CreateAutomationRuleInput {
  id: string;
  enabled?: boolean;
  triggerType: AutomationRule['triggerType'];
  sourceRowFilter?: AutomationRule['sourceRowFilter'];
  targetRowFilter?: AutomationRule['targetRowFilter'];
  sourceSlotFilter?: AutomationRule['sourceSlotFilter'];
  targetSlotFilter?: AutomationRule['targetSlotFilter'];
  cooldownMs?: number;
  lastTriggeredAt?: number | null;
}

export interface AutomationSelectors {
  canRun: boolean;
  nextRunEtaMs: number | null;
  queueLength: number;
  lastOutcome: AutomationLastOutcome;
}

export type AutomationPresetId = 'merge_any' | 'fill_empty_slots';

interface AutomationPresetDefinition {
  id: AutomationPresetId;
  label: string;
  triggerType: AutomationRule['triggerType'];
}

const AUTOMATION_PRESET_DEFINITIONS: Record<AutomationPresetId, AutomationPresetDefinition> = {
  merge_any: {
    id: 'merge_any',
    label: 'Merge any available pair',
    triggerType: 'merge_available',
  },
  fill_empty_slots: {
    id: 'fill_empty_slots',
    label: 'Move to fill empty slots',
    triggerType: 'slot_filled',
  },
};

export interface AutomationRuleSummary {
  total: number;
  enabled: number;
}

export const createAutomationRulePayload = (input: CreateAutomationRuleInput): AutomationRule => ({
  id: input.id,
  enabled: input.enabled ?? true,
  triggerType: input.triggerType,
  sourceRowFilter: input.sourceRowFilter ?? [0, 1, 2],
  targetRowFilter: input.targetRowFilter ?? [0, 1, 2],
  sourceSlotFilter: input.sourceSlotFilter ?? [],
  targetSlotFilter: input.targetSlotFilter ?? [],
  cooldownMs: Math.max(0, input.cooldownMs ?? 0),
  lastTriggeredAt: input.lastTriggeredAt ?? null,
});

export const createAddAutomationRuleIntent = (rule: AutomationRule): GameAction => ({
  type: 'ADD_AUTOMATION_RULE',
  rule,
});

export const createUpdateAutomationRuleIntent = (
  ruleId: string,
  updates: Partial<AutomationRule>
): GameAction => ({
  type: 'UPDATE_AUTOMATION_RULE',
  ruleId,
  updates,
});

export const createRemoveAutomationRuleIntent = (ruleId: string): GameAction => ({
  type: 'REMOVE_AUTOMATION_RULE',
  ruleId,
});

export const createToggleAutomationIntent = (enabled?: boolean): GameAction => ({
  type: 'TOGGLE_AUTOMATION',
  enabled,
});

export const createAutomationRuleSummary = (state: GameState): AutomationRuleSummary => {
  const total = state.automation.rules.length;
  const enabled = state.automation.rules.filter((rule) => rule.enabled).length;
  return { total, enabled };
};

export const createAddPresetAutomationRuleIntent = (
  presetId: AutomationPresetId,
  existingRuleIds: string[]
): GameAction => {
  const preset = AUTOMATION_PRESET_DEFINITIONS[presetId];
  const id = `${presetId}-${existingRuleIds.length + 1}-${Date.now()}`;

  return createAddAutomationRuleIntent(
    createAutomationRulePayload({
      id,
      triggerType: preset.triggerType,
      enabled: true,
      cooldownMs: 0,
    })
  );
};

export const createRemoveLatestAutomationRuleIntent = (
  rules: AutomationRule[]
): GameAction | null => {
  if (rules.length === 0) return null;
  const latestRule = rules[rules.length - 1];
  return createRemoveAutomationRuleIntent(latestRule.id);
};

export const listAutomationPresets = (): AutomationPresetDefinition[] =>
  Object.values(AUTOMATION_PRESET_DEFINITIONS);

const summarizeOutcome = (state: GameState): AutomationLastOutcome => {
  const metrics = state.automation.runtime.debugMetrics;
  if (!metrics || metrics.attemptedOps === 0) return 'idle';
  if (metrics.successfulOps === metrics.attemptedOps) return 'success';

  const blockedTotal =
    metrics.blockedReasons.no_match +
    metrics.blockedReasons.cooldown +
    metrics.blockedReasons.disabled +
    metrics.blockedReasons.full_grid;

  return blockedTotal > 0 ? 'blocked' : 'success';
};

let lastStateRef: GameState | null = null;
let lastIntervalMsRef: number | null = null;
let lastTimeBucketRef: number | null = null;
let lastSelectorsRef: AutomationSelectors | null = null;

export const selectAutomationSelectors = (
  state: GameState,
  automationIntervalMs: number,
  now: number = Date.now()
): AutomationSelectors => {
  const timeBucket = Math.floor(now / 100);

  if (
    lastSelectorsRef &&
    lastStateRef === state &&
    lastIntervalMsRef === automationIntervalMs &&
    lastTimeBucketRef === timeBucket
  ) {
    return lastSelectorsRef;
  }

  const hasEnabledRule = state.automation.rules.some((rule) => rule.enabled);
  const canRun =
    state.automation.enabled &&
    hasEnabledRule &&
    state.machines.length > 0 &&
    state.activeDisaster?.type !== 'powerOutage';

  const lastRunAt = state.automation.runtime.lastRunAt;
  const nextRunEtaMs = canRun
    ? lastRunAt === null
      ? 0
      : Math.max(0, lastRunAt + automationIntervalMs - now)
    : null;

  const selectors: AutomationSelectors = {
    canRun,
    nextRunEtaMs,
    queueLength: state.automation.runtime.pendingQueue.length,
    lastOutcome: summarizeOutcome(state),
  };

  lastStateRef = state;
  lastIntervalMsRef = automationIntervalMs;
  lastTimeBucketRef = timeBucket;
  lastSelectorsRef = selectors;

  return selectors;
};

export const selectCanRunAutomation = (state: GameState, automationIntervalMs: number): boolean =>
  selectAutomationSelectors(state, automationIntervalMs).canRun;

export const selectAutomationNextRunEta = (
  state: GameState,
  automationIntervalMs: number,
  now?: number
): number | null => selectAutomationSelectors(state, automationIntervalMs, now).nextRunEtaMs;

export const selectAutomationQueueLength = (state: GameState, automationIntervalMs: number): number =>
  selectAutomationSelectors(state, automationIntervalMs).queueLength;

export const selectAutomationLastOutcome = (state: GameState, automationIntervalMs: number): AutomationLastOutcome =>
  selectAutomationSelectors(state, automationIntervalMs).lastOutcome;
