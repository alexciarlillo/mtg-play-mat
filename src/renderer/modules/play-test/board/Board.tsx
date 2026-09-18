import type { PublicView } from '@shared/game';
import type { MouseEvent } from 'react';

import { useContextMenu } from '../../../ui/ContextMenuProvider';
import { useView, type ViewStore } from '../viewStore';
import BattlefieldCard from './BattlefieldCard';
import Graveyard from './Graveyard';
import Library from './Library';

const Board = ({ store }: { store: ViewStore<PublicView> }) => {
  const view = useView(store);
  const menu = useContextMenu();

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    menu.open({
      specs: [{ title: 'Add Token', action: null }],
      x: e.pageX,
      y: e.pageY,
    });
  };

  return (
    <div
      className="h-screen w-screen bg-slate-300 relative flex"
      onContextMenu={handleContextMenu}
    >
      <div className="w-4/5 h-full bg-neutral-400 px-12 py-8">
        {/* Positions are relative to this box, which also bounds drags. */}
        <div data-testid="battlefield" className="relative h-full w-full">
          {view?.zones.battlefield.map((card) => (
            <BattlefieldCard key={card.instanceId} card={card} />
          ))}
        </div>
      </div>
      <div className="w-1/5 h-full">
        <div className="h-1/2 bg-zinc-300">
          <Library playerId={view?.playerId} count={view?.libraryCount ?? 0} />
        </div>
        <div className="h-1/2 bg-slate-800">
          <Graveyard cards={view?.zones.graveyard ?? []} />
        </div>
      </div>
    </div>
  );
};

export default Board;
