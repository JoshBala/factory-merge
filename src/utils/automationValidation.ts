import { BALANCE } from '@/config/balance';
import type { AutomationRule, AutomationRuntime, AutomationState, AutomationTriggerType } from '@/types/game';

const VALID_TRIGGERS: AutomationTriggerType[] = ['interval', 'slot_filled', 'merge_available'];
const VALID_ROWS = new Set([0, 1, 2]);
const MIN_BUDGET = 1;
const MAX_BUDGET = 100;

const sanitizeNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const sanitizeRowFilter = (value: unknown): Array<0 | 1 | 2> => {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is 0 | 1 | 2 => VALID_ROWS.has(row as number));
};

const sanitizeSlotFilter = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (slot): slot is number =>
      typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < BALANCE.gridSize
  );
};

const sanitizeRule = (rule: unknown): AutomationRule | null => {
  if (!rule || typeof rule !== 'object') return null;
  const candidate = rule as Partial<AutomationRule>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null;

  const triggerTypeValid = VALID_TRIGGERS.includes(candidate.triggerType as AutomationTriggerType);
  const sourceRowFilter = sanitizeRowFilter(candidate.sourceRowFilter);
  const targetRowFilter = sanitizeRowFilter(candidate.targetRowFilter);
  const sourceSlotFilter = sanitizeSlotFilter(candidate.sourceSlotFilter);
  const targetSlotFilter = sanitizeSlotFilter(candidate.targetSlotFilter);
  const cooldownMs = sanitizeNumber(candidate.cooldownMs, 0);
  const cooldownValid = Number.isInteger(cooldownMs) && cooldownMs >= 0;

  const sourceRowFilterValid = !Array.isArray(candidate.sourceRowFilter) || sourceRowFilter.length === candidate.sourceRowFilter.length;
  const targetRowFilterValid = !Array.isArray(candidate.targetRowFilter) || targetRowFilter.length === candidate.targetRowFilter.length;
  const sourceSlotFilterValid = !Array.isArray(candidate.sourceSlotFilter) || sourceSlotFilter.length === candidate.sourceSlotFilter.length;
  const targetSlotFilterValid = !Array.isArray(candidate.targetSlotFilter) || targetSlotFilter.length === candidate.targetSlotFilter.length;

  return {
    id: candidate.id,
    enabled:
      Boolean(candidate.enabled) &&
      triggerTypeValid &&
      sourceRowFilterValid &&
      targetRowFilterValid &&
      sourceSlotFilterValid &&
      targetSlotFilterValid &&
      cooldownValid,
    triggerType: triggerTypeValid ? (candidate.triggerType as AutomationTriggerType) : 'interval',
    sourceRowFilter,
    targetRowFilter,
    sourceSlotFilter,
    targetSlotFilter,
    cooldownMs: cooldownValid ? cooldownMs : 0,
    lastTriggeredAt:
      typeof candidate.lastTriggeredAt === 'number' && Number.isFinite(candidate.lastTriggeredAt)
        ? candidate.lastTriggeredAt
        : null,
  };
};

export const sanitizeAutomationRuntime = (runtime: unknown): AutomationRuntime => {
  const candidate = (runtime ?? {}) as Partial<AutomationRuntime>;
  const blockedReasons = candidate.debugMetrics?.blockedReasons;

  return {
    lastRunAt:
      typeof candidate.lastRunAt === 'number' && Number.isFinite(candidate.lastRunAt)
        ? candidate.lastRunAt
        : null,
    pendingQueue: Array.isArray(candidate.pendingQueue)
      ? candidate.pendingQueue.filter((entry): entry is string => typeof entry === 'string')
      : [],
    opsPerTickBudget: Math.min(
      MAX_BUDGET,
      Math.max(MIN_BUDGET, Math.floor(sanitizeNumber(candidate.opsPerTickBudget, 1)))
    ),
    triggerFlags: {
      afterBuyMachine: Boolean(candidate.triggerFlags?.afterBuyMachine),
      afterMergeMachines: Boolean(candidate.triggerFlags?.afterMergeMachines),
      afterScrapOrMoveMachine: Boolean(candidate.triggerFlags?.afterScrapOrMoveMachine),
    },
    debugMetrics: {
      attemptedOps: Math.max(0, Math.floor(sanitizeNumber(candidate.debugMetrics?.attemptedOps, 0))),
      successfulOps: Math.max(0, Math.floor(sanitizeNumber(candidate.debugMetrics?.successfulOps, 0))),
      blockedReasons: {
        no_match: Math.max(0, Math.floor(sanitizeNumber(blockedReasons?.no_match, 0))),
        cooldown: Math.max(0, Math.floor(sanitizeNumber(blockedReasons?.cooldown, 0))),
        disabled: Math.max(0, Math.floor(sanitizeNumber(blockedReasons?.disabled, 0))),
        full_grid: Math.max(0, Math.floor(sanitizeNumber(blockedReasons?.full_grid, 0))),
      },
    },
  };
};

export const sanitizeAutomationState = (
  automation: unknown,
  options?: { defaultEnabled?: boolean }
): AutomationState => {
  const candidate = (automation ?? {}) as Partial<AutomationState>;
  const rules = Array.isArray(candidate.rules) ? candidate.rules.map(sanitizeRule).filter((rule): rule is AutomationRule => Boolean(rule)) : [];
  const runtime = sanitizeAutomationRuntime(candidate.runtime);
  const ruleIds = new Set(rules.map((rule) => rule.id));

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : Boolean(options?.defaultEnabled),
    rules,
    runtime: {
      ...runtime,
      pendingQueue: runtime.pendingQueue.filter((ruleId) => ruleIds.has(ruleId)),
    },
  };
};
