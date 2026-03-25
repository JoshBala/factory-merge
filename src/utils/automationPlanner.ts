import type { AutomationRule, AutomationState, GameState, Machine } from '@/types/game';
import { EMPTY_UPGRADE_EFFECT_PROJECTION, type UpgradeEffectProjection } from '@/utils/upgradeEffects';
import { canMerge, getRowForSlot } from '@/utils/calculations';

export type AutomationOp =
  | {
      kind: 'MERGE';
      ruleId: string;
      sourceId: string;
      targetId: string;
      metadata: {
        sourceSlot: number;
        targetSlot: number;
        machineLevel: number;
      };
    }
  | {
      kind: 'MOVE';
      ruleId: string;
      machineId: string;
      targetSlot: number;
      metadata: {
        sourceSlot: number;
        machineLevel: number;
      };
    }
  | {
      kind: 'SKIP';
      ruleId: string;
      reason:
        | 'AUTOMATION_DISABLED'
        | 'RULE_DISABLED'
        | 'RULE_COOLDOWN'
        | 'TRIGGER_NOT_READY'
        | 'NO_ELIGIBLE_SOURCE'
        | 'NO_VALID_TARGET';
      metadata?: Record<string, number | string | boolean | null>;
    };


const sortMachinesDeterministically = (machines: Machine[]): Machine[] =>
  [...machines].sort((a, b) => {
    if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
    return a.id.localeCompare(b.id);
  });

const slotMatchesFilter = (slotIndex: number, slotFilter: number[]): boolean => {
  if (slotFilter.length === 0) return true;
  return slotFilter.includes(slotIndex);
};

const rowMatchesFilter = (slotIndex: number, rowFilter: Array<0 | 1 | 2>): boolean => {
  if (rowFilter.length === 0) return true;
  return rowFilter.includes(getRowForSlot(slotIndex));
};

const machineMatchesSource = (machine: Machine, rule: AutomationRule): boolean => {
  return (
    rowMatchesFilter(machine.slotIndex, rule.sourceRowFilter) &&
    slotMatchesFilter(machine.slotIndex, rule.sourceSlotFilter)
  );
};

const machineMatchesTarget = (machine: Machine, rule: AutomationRule): boolean => {
  return (
    rowMatchesFilter(machine.slotIndex, rule.targetRowFilter) &&
    slotMatchesFilter(machine.slotIndex, rule.targetSlotFilter)
  );
};

const isRuleCooldownReady = (rule: AutomationRule, now: number): boolean => {
  if (rule.lastTriggeredAt === null) return true;
  return now - rule.lastTriggeredAt >= Math.max(0, rule.cooldownMs);
};

const isTriggerReady = (rule: AutomationRule, machines: Machine[]): boolean => {
  if (rule.triggerType === 'interval') return true;

  if (rule.triggerType === 'slot_filled') {
    return machines.some((machine) => machineMatchesSource(machine, rule));
  }

  return machines.some((source) =>
    machines.some((target) => {
      if (!machineMatchesSource(source, rule)) return false;
      if (!machineMatchesTarget(target, rule)) return false;
      return canMerge(source, target);
    })
  );
};

const findMergeOp = (
  rule: AutomationRule,
  machines: Machine[]
): Extract<AutomationOp, { kind: 'MERGE' }> | null => {
  const sortedMachines = sortMachinesDeterministically(machines);

  for (const source of sortedMachines) {
    if (!machineMatchesSource(source, rule)) continue;

    for (const target of sortedMachines) {
      if (!machineMatchesTarget(target, rule)) continue;
      if (!canMerge(source, target)) continue;

      return {
        kind: 'MERGE',
        ruleId: rule.id,
        sourceId: source.id,
        targetId: target.id,
        metadata: {
          sourceSlot: source.slotIndex,
          targetSlot: target.slotIndex,
          machineLevel: source.level,
        },
      };
    }
  }

  return null;
};

const findMoveOp = (
  rule: AutomationRule,
  machines: Machine[]
): Extract<AutomationOp, { kind: 'MOVE' }> | null => {
  const sortedMachines = sortMachinesDeterministically(machines);
  const occupiedSlots = new Set(sortedMachines.map((machine) => machine.slotIndex));

  const targetCandidates = [...rule.targetSlotFilter].sort((a, b) => a - b);
  if (targetCandidates.length === 0) return null;

  for (const source of sortedMachines) {
    if (!machineMatchesSource(source, rule)) continue;
    if (source.disabled) continue;

    for (const targetSlot of targetCandidates) {
      if (occupiedSlots.has(targetSlot)) continue;
      if (!rowMatchesFilter(targetSlot, rule.targetRowFilter)) continue;

      return {
        kind: 'MOVE',
        ruleId: rule.id,
        machineId: source.id,
        targetSlot,
        metadata: {
          sourceSlot: source.slotIndex,
          machineLevel: source.level,
        },
      };
    }
  }

  return null;
};

export const planAutomationOps = (
  gameState: GameState,
  automationState: AutomationState,
  effects: UpgradeEffectProjection,
  now: number
): AutomationOp[] => {
  if (!automationState.enabled) {
    return automationState.rules.map((rule) => ({
      kind: 'SKIP',
      ruleId: rule.id,
      reason: 'AUTOMATION_DISABLED',
    }));
  }

  const ops: AutomationOp[] = [];
  const maxOps = Math.max(1, Math.floor(automationState.runtime.opsPerTickBudget || 1));

  for (const rule of automationState.rules) {
    if (ops.length >= maxOps) break;

    if (!rule.enabled) {
      ops.push({ kind: 'SKIP', ruleId: rule.id, reason: 'RULE_DISABLED' });
      continue;
    }

    if (!isRuleCooldownReady(rule, now)) {
      ops.push({
        kind: 'SKIP',
        ruleId: rule.id,
        reason: 'RULE_COOLDOWN',
        metadata: {
          waitMs: Math.max(0, rule.cooldownMs - (now - (rule.lastTriggeredAt ?? now))),
        },
      });
      continue;
    }

    if (!isTriggerReady(rule, gameState.machines)) {
      ops.push({ kind: 'SKIP', ruleId: rule.id, reason: 'TRIGGER_NOT_READY' });
      continue;
    }

    const mergeOp = findMergeOp(rule, gameState.machines);
    if (mergeOp) {
      ops.push(mergeOp);
      continue;
    }

    const moveOp = findMoveOp(rule, gameState.machines);
    if (moveOp) {
      ops.push(moveOp);
      continue;
    }

    const hasSource = gameState.machines.some((machine) => machineMatchesSource(machine, rule));
    ops.push({
      kind: 'SKIP',
      ruleId: rule.id,
      reason: hasSource ? 'NO_VALID_TARGET' : 'NO_ELIGIBLE_SOURCE',
      metadata: {
        automationSpeedPercent: effects.automationSpeedPercent,
      },
    });
  }

  return ops;
};

export const planAutomationOpsFromGameState = (
  gameState: GameState,
  now: number
): AutomationOp[] => {
  return planAutomationOps(
    gameState,
    gameState.automation,
    gameState.upgradeEffectProjection ?? EMPTY_UPGRADE_EFFECT_PROJECTION,
    now
  );
};
