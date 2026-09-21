import type {
  CardView,
  CommanderDamage,
  CommanderMove,
  PublicView,
  PublicZoneId,
} from '@shared/game';
import { useEffect, useState } from 'react';

export interface DamageSource {
  source: string;
  name: string;
}

const publicZones: PublicZoneId[] = [
  'command',
  'battlefield',
  'graveyard',
  'exile',
];

// Commanders the view can see, in a stable order. One in a hand or
// library is hidden from public views, so it drops out until it returns.
export const visibleCommanders = (view: PublicView): CardView[] =>
  publicZones
    .flatMap((zone) => view.zones[zone])
    .filter((card) => card.isCommander)
    .sort((a, b) =>
      a.instanceId.localeCompare(b.instanceId, undefined, { numeric: true })
    );

export const hasCommanders = (view: PublicView) =>
  view.zones.command.length > 0 || visibleCommanders(view).length > 0;

export const commanderSources = (cards: CardView[]): DamageSource[] =>
  cards.map((card) => ({
    source: card.instanceId,
    name: card.ref?.name ?? 'Commander',
  }));

// Sources still worth a row: the given ones, plus any that already dealt
// damage (e.g. an opponent who has since left).
export const damageRowsFor = (
  sources: DamageSource[],
  taken: CommanderDamage[]
): (DamageSource & { damage: number })[] => {
  const damage = new Map(taken.map((entry) => [entry.source, entry.damage]));
  const known = new Set(sources.map((s) => s.source));
  return [
    ...sources.map((s) => ({ ...s, damage: damage.get(s.source) ?? 0 })),
    ...taken.filter((entry) => !known.has(entry.source)),
  ];
};

export const logPromptError = (err: unknown) => {
  console.error('[play-test] commander prompt failed', err);
};

// Main decides when a prompt is due and keeps the list, so it survives a
// reload; this only mirrors it.
export const useCommanderPrompts = (): CommanderMove[] => {
  const [prompts, setPrompts] = useState<CommanderMove[]>([]);
  useEffect(() => {
    let fresh = true;
    const off = window.api.onCommanderPrompts((next) => {
      fresh = false;
      setPrompts(next);
    });
    window.api.getCommanderPrompts().then((initial) => {
      if (fresh) setPrompts(initial);
    }, logPromptError);
    return off;
  }, []);
  return prompts;
};
