import { useMemo, useState } from 'react';
import { Bot, Settings2 } from 'lucide-react';
import { useGame } from '@/contexts/GameContext';
import { FEATURE_FLAGS } from '@/config/featureFlags';
import { resolveGameEffects } from '@/utils/calculations';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createAutomationRuleSummary, listAutomationPresets, selectAutomationSelectors } from '@/services/automationService';

const BLOCKED_REASON_LABELS: Record<string, string> = {
  no_match: 'No matching merge/move',
  cooldown: 'Rule cooldown',
  disabled: 'System disabled',
  full_grid: 'Grid full',
};

export const AutomationPanel = () => {
  const { state, actions } = useGame();
  const [open, setOpen] = useState(false);

  const gridEffects = resolveGameEffects(state.gridUpgrade, state);
  const automationSummary = createAutomationRuleSummary(state);
  const presets = listAutomationPresets();
  const selectors = selectAutomationSelectors(state, gridEffects.automationIntervalMs);
  const blockedReasons = state.automation.runtime.debugMetrics.blockedReasons;

  const blockedReasonEntries = useMemo(
    () => Object.entries(blockedReasons)
      .sort(([, left], [, right]) => right - left)
      .filter(([, count]) => count > 0),
    [blockedReasons]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="lg" className="h-12 px-5 text-base font-semibold shadow-sm">
          <Bot className="mr-2 h-5 w-5" />
          Automation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Settings2 className="h-5 w-5" />
            Automation Control Center
          </DialogTitle>
          <DialogDescription className="space-y-1 text-xs leading-relaxed text-muted-foreground">
            <p>Automation executes configured merge and move rules for you each cycle.</p>
            <p>
              It follows normal rule matching, per-rule cooldowns, and disabled/blocked states, and it pauses during power outages.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">System status</p>
              <p className="text-xs text-muted-foreground">
                {automationSummary.enabled}/{automationSummary.total} rules enabled
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Master</span>
              <Switch
                checked={state.automation.enabled}
                onCheckedChange={(checked) => actions.toggleAutomation(checked)}
                aria-label="Toggle automation"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded bg-background/70 p-2">
              <p className="text-muted-foreground">Queue</p>
              <p className="font-medium text-foreground">{selectors.queueLength} pending</p>
            </div>
            <div className="rounded bg-background/70 p-2">
              <p className="text-muted-foreground">Execution</p>
              <p className="font-medium text-foreground">
                {selectors.canRun
                  ? selectors.nextRunEtaMs === null
                    ? 'Ready now'
                    : `Next pass in ${(selectors.nextRunEtaMs / 1000).toFixed(1)}s`
                  : 'Blocked'}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-medium text-foreground">Blocked reasons</p>
            {blockedReasonEntries.length > 0 ? (
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {blockedReasonEntries.map(([reason, count]) => (
                  <li key={reason} className="flex items-center justify-between rounded bg-background/60 px-2 py-1">
                    <span>{BLOCKED_REASON_LABELS[reason] ?? reason}</span>
                    <span className="font-medium text-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No recent automation blocks.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={actions.addAutomationPresetRule}>
            + Add preset rule
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={actions.removeLatestAutomationRule}
            disabled={automationSummary.total === 0}
          >
            − Remove latest rule
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Default preset: {presets[0].label}
        </p>

        {FEATURE_FLAGS.automationAdvancedEditor ? (
          <Button variant="ghost" size="sm" className="h-7 w-fit px-2 text-xs">
            Open advanced rule editor
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Advanced editor is temporarily disabled while balancing stabilizes.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
