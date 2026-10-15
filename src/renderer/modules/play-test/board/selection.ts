import type { CardView, InstanceId } from '@shared/game';
import { createContext, useContext, useSyncExternalStore } from 'react';

export interface Offset {
  dx: number;
  dy: number;
}

interface GroupDrag {
  leader: InstanceId;
  ids: ReadonlySet<InstanceId>;
  offset: Offset;
  // Set on drop: the views the offset still applies to, so dropped cards
  // hold their place until main's update, then follow the new view.
  dropped: ReadonlyMap<InstanceId, CardView> | null;
}

const none: ReadonlySet<InstanceId> = new Set();

const sameSet = (a: ReadonlySet<InstanceId>, b: ReadonlySet<InstanceId>) =>
  a.size === b.size && [...a].every((id) => b.has(id));

// Which of the player's own permanents are selected. It lives in the
// board window only: never game state, never sent anywhere.
export class SelectionStore {
  ids: ReadonlySet<InstanceId> = none;

  private battlefield: CardView[] = [];

  private drag: GroupDrag | null = null;

  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private setIds(ids: ReadonlySet<InstanceId>) {
    if (sameSet(ids, this.ids)) return;
    this.ids = ids;
    this.emit();
  }

  // Called with every view of the player's own battlefield, so a card
  // that leaves it, or goes to another controller, drops out at once.
  sync(battlefield: CardView[]) {
    this.battlefield = battlefield;
    const present = new Set(battlefield.map((card) => card.instanceId));
    this.setIds(new Set([...this.ids].filter((id) => present.has(id))));
  }

  has(id: InstanceId) {
    return this.ids.has(id);
  }

  toggle(id: InstanceId) {
    const next = new Set(this.ids);
    if (!next.delete(id)) next.add(id);
    this.setIds(next);
  }

  set(ids: Iterable<InstanceId>) {
    this.setIds(new Set(ids));
  }

  clear() {
    this.setIds(none);
  }

  // The selected cards in stacking order, bottom first.
  selected(): CardView[] {
    return this.battlefield.filter((card) => this.ids.has(card.instanceId));
  }

  // A group acts together only when the card under the pointer is in it.
  groupOf(card: CardView): CardView[] | null {
    if (!this.ids.has(card.instanceId) || this.ids.size < 2) return null;
    const cards = this.selected();
    return cards.length > 1 ? cards : null;
  }

  startDrag(leader: InstanceId) {
    this.drag = {
      leader,
      ids: new Set(this.ids),
      offset: { dx: 0, dy: 0 },
      dropped: null,
    };
    this.emit();
  }

  moveDrag(offset: Offset) {
    if (!this.drag) return;
    this.drag = { ...this.drag, offset };
    this.emit();
  }

  // Keeps the followers at their dropped place until a newer view of
  // each arrives.
  dropDrag(offset: Offset) {
    if (!this.drag) return;
    const { ids } = this.drag;
    const dropped = new Map(
      this.battlefield
        .filter((card) => ids.has(card.instanceId))
        .map((card) => [card.instanceId, card])
    );
    this.drag = { ...this.drag, offset, dropped };
    this.emit();
  }

  endDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.emit();
  }

  // How far a follower of the group drag is shifted; the leader moves on
  // its own. Stable between changes, as useSyncExternalStore needs.
  offsetOf(card: CardView): Offset | null {
    const { drag } = this;
    const id = card.instanceId;
    if (!drag || drag.leader === id || !drag.ids.has(id)) return null;
    if (drag.offset.dx === 0 && drag.offset.dy === 0) return null;
    if (drag.dropped && drag.dropped.get(id) !== card) return null;
    return drag.offset;
  }
}

export const SelectionContext = createContext<SelectionStore | null>(null);

const noSubscribe = () => () => {};

export const useSelection = () => useContext(SelectionContext);

// The whole set, so every card re-renders when the selection changes and
// its menu and group stay current.
export const useSelectedIds = (): ReadonlySet<InstanceId> => {
  const store = useSelection();
  return useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    () => store?.ids ?? none
  );
};

export const useGroupOffset = (card: CardView): Offset | null => {
  const store = useSelection();
  return useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    () => store?.offsetOf(card) ?? null
  );
};
