import { useMemo, useRef, useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { toast } from '@/hooks/use-toast';
import { GAME_VERSION } from '@/config/version';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { createSaveData, saveGame } from '@/utils/storage';
import { createInitialState } from '@/utils/state';
import { migrateGameState } from '@/utils/migrations';
import { GameState } from '@/types/game';

const formatPlaytime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
};

const normalizeImportedState = (data: unknown): GameState | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const base = createInitialState();
  const partial = data as Partial<GameState>;

  const normalized: GameState = {
    ...base,
    ...partial,
    currency: typeof partial.currency === 'number' ? partial.currency : base.currency,
    machines: Array.isArray(partial.machines) ? partial.machines : base.machines,
    rowModules: Array.isArray(partial.rowModules) ? partial.rowModules : base.rowModules,
    activeDisaster: partial.activeDisaster ?? base.activeDisaster,
    selectedMachineId:
      typeof partial.selectedMachineId === 'string' || partial.selectedMachineId === null
        ? partial.selectedMachineId
        : base.selectedMachineId,
    lastTickTime: typeof partial.lastTickTime === 'number' ? partial.lastTickTime : base.lastTickTime,
    totalPlayTime: typeof partial.totalPlayTime === 'number' ? partial.totalPlayTime : base.totalPlayTime,
    stats: {
      ...base.stats,
      ...(partial.stats ?? {}),
    },
    saveVersion: typeof partial.saveVersion === 'number' ? partial.saveVersion : base.saveVersion,
  };

  return migrateGameState(normalized);
};

export const GameMenuModal = () => {
  const { state, dispatch } = useGame();
  const [open, setOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [resetText, setResetText] = useState('');
  const exportRef = useRef<HTMLTextAreaElement | null>(null);

  const exportText = useMemo(() => JSON.stringify(createSaveData(state)), [state]);

  const handleSaveNow = () => {
    saveGame(state);
    toast({ title: 'Saved' });
  };

  const handleCopySave = async () => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(exportText);
        toast({ title: 'Copied save' });
        return;
      } catch {
        // Fall through to manual copy.
      }
    }

    if (exportRef.current) {
      exportRef.current.focus();
      exportRef.current.select();
      toast({ title: 'Select and copy the save text below.' });
    } else {
      toast({ title: 'Copy failed', description: 'Please copy the save text manually.' });
    }
  };

  const handleImport = () => {
    setImportError('');
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportError('Paste a save first.');
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      const normalized = normalizeImportedState(parsed);
      if (!normalized) {
        setImportError('That does not look like a valid save.');
        return;
      }

      dispatch({ type: 'LOAD_GAME', state: normalized });
      setOpen(false);
      toast({ title: 'Imported' });
    } catch {
      setImportError('Invalid JSON. Please double-check the save text.');
    }
  };

  const handleReset = () => {
    dispatch({ type: 'RESET_GAME' });
    setOpen(false);
    toast({ title: 'Reset' });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setImportText('');
      setImportError('');
      setResetText('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Menu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Menu</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Save</h3>
              <p className="text-xs text-muted-foreground">Save your current progress right now.</p>
            </div>
            <Button onClick={handleSaveNow}>Save now</Button>
          </section>

          <Separator />

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Export / Import</h3>
              <p className="text-xs text-muted-foreground">
                Export a save string or paste one to overwrite your current run.
              </p>
            </div>
            <div className="space-y-2">
              <Button variant="outline" onClick={handleCopySave}>
                Copy save
              </Button>
              <Textarea ref={exportRef} readOnly value={exportText} className="min-h-[120px]" />
            </div>
            <div className="space-y-2">
              <Textarea
                placeholder="Paste save JSON here..."
                value={importText}
                onChange={event => setImportText(event.target.value)}
                className="min-h-[120px]"
              />
              {importError && <p className="text-xs text-destructive">{importError}</p>}
              <Button onClick={handleImport}>Import</Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Reset</h3>
              <p className="text-xs text-muted-foreground">
                Type RESET to enable the button. This clears your current save.
              </p>
            </div>
            <div className="space-y-2">
              <Input
                value={resetText}
                onChange={event => setResetText(event.target.value)}
                placeholder="Type RESET to confirm"
              />
              <Button variant="destructive" onClick={handleReset} disabled={resetText !== 'RESET'}>
                Reset game
              </Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">About</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Version: {GAME_VERSION}</p>
              <p>Total playtime: {formatPlaytime(state.totalPlayTime)}</p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
