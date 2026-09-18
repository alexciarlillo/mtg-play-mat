import { type CardRef, currentFace } from '@shared/game';
import classNames from 'classnames';

import CardImg from './CardImg';

interface Props {
  // null or face-down shows the card back.
  cardRef: CardRef | null;
  faceIndex?: number;
  faceDown?: boolean;
  className?: string;
}

// A custom token has no printing, so it is drawn as a plain frame with its
// name, type, and stats instead of an image.
const CustomToken = ({ cardRef, faceIndex = 0 }: Props) => {
  if (!cardRef) return null;
  const face = currentFace(cardRef, faceIndex);
  const power = face?.power ?? cardRef.power;
  const toughness = face?.toughness ?? cardRef.toughness;
  return (
    <div
      data-testid="custom-token"
      className="flex h-full w-full flex-col justify-between rounded-lg border-4 border-slate-800 bg-gradient-to-b from-stone-100 to-stone-300 p-[6%] text-slate-900 @container"
    >
      <div className="truncate rounded bg-white/70 px-1 text-[9cqw] font-bold leading-tight">
        {face?.name ?? cardRef.name}
      </div>
      <div className="flex flex-1 items-center justify-center text-[7cqw] italic text-slate-500">
        Token
      </div>
      <div className="truncate rounded bg-white/70 px-1 text-[7cqw] leading-tight">
        {face?.typeLine || cardRef.typeLine}
      </div>
      {power !== undefined && toughness !== undefined && (
        <div className="mt-[4%] self-end rounded bg-white px-1 text-[10cqw] font-bold tabular-nums">
          {power}/{toughness}
        </div>
      )}
    </div>
  );
};

// The face a card currently shows: its image (the back when hidden or
// unknown), turned upside down for the flipped half of a flip card.
const CardArt = ({ cardRef, faceIndex = 0, faceDown, className }: Props) => {
  if (!faceDown && cardRef?.custom) {
    return <CustomToken cardRef={cardRef} faceIndex={faceIndex} />;
  }
  const hidden = faceDown || !cardRef;
  const flipped = !hidden && cardRef.layout === 'flip' && faceIndex > 0;
  return (
    <CardImg
      className={classNames(className, { 'rotate-180': flipped })}
      scryfallId={hidden ? undefined : cardRef.id}
      face={hidden || cardRef.layout === 'flip' ? 0 : faceIndex}
      name={
        hidden
          ? 'Face-down card'
          : (currentFace(cardRef, faceIndex)?.name ?? cardRef.name)
      }
    />
  );
};

export default CardArt;
