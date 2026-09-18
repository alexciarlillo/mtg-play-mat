import type { CardView } from '@shared/game';

import CardArt from '../../../ui/CardArt';
import { Modal } from '../common/Dialogs';
import { dispatch } from '../viewStore';

// Picks the permanent an aura or equipment goes on. Cards already
// attached to the one being moved are left out, since that would loop.
const AttachDialog = ({
  card,
  battlefield,
  onClose,
}: {
  card: CardView;
  battlefield: CardView[];
  onClose(): void;
}) => {
  const riders = new Set([card.instanceId]);
  let grew = true;
  while (grew) {
    grew = false;
    battlefield.forEach((other) => {
      if (
        other.attachedTo &&
        riders.has(other.attachedTo) &&
        !riders.has(other.instanceId)
      ) {
        riders.add(other.instanceId);
        grew = true;
      }
    });
  }
  const targets = battlefield.filter((other) => !riders.has(other.instanceId));

  return (
    <Modal title="Attach to…" onClose={onClose} wide>
      {targets.length === 0 ? (
        <p className="text-sm">There is nothing else on the battlefield.</p>
      ) : (
        <div className="grid max-h-[60vh] grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 overflow-y-auto p-1">
          {targets.map((target) => (
            <button
              key={target.instanceId}
              type="button"
              data-testid="attach-target"
              data-instance-id={target.instanceId}
              className="flex flex-col items-center gap-1 rounded-lg p-1 text-xs hover:bg-sky-200"
              onClick={() => {
                dispatch({
                  type: 'attach',
                  instanceId: card.instanceId,
                  to: target.instanceId,
                });
                onClose();
              }}
            >
              <div className="aspect-card w-full">
                <CardArt
                  cardRef={target.ref}
                  faceIndex={target.faceIndex}
                  faceDown={target.faceDown}
                />
              </div>
              <span className="w-full truncate font-medium">
                {target.faceDown ? 'Face-down card' : target.ref?.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default AttachDialog;
