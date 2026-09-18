import type { CardView } from '@shared/game';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import CardImg from './CardImg';

interface Preview {
  show(card: CardView, clientX: number): void;
  hide(instanceId: string): void;
}

const noop: Preview = { show: () => {}, hide: () => {} };

const PreviewContext = createContext<Preview>(noop);

interface Shown {
  card: CardView;
  // Which half of the window the pointer is in, so the preview can sit on
  // the other half instead of under the cursor.
  pointerLeft: boolean;
}

// A large preview of the hovered card. Each window has its own provider,
// so a preview only ever shows cards that window already renders.
export const CardPreviewProvider = ({
  children,
  reserveRight = 0,
}: {
  children: ReactNode;
  // Width of a right-hand panel the preview must not cover.
  reserveRight?: number;
}) => {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
    };
  }, []);

  const preview = useMemo<Preview>(
    () => ({
      show: (card, clientX) => {
        if (!card.ref || card.faceDown) return;
        const free = window.innerWidth - reserveRight;
        setShown({ card, pointerLeft: clientX < free / 2 });
      },
      hide: (instanceId) =>
        setShown((current) =>
          current?.card.instanceId === instanceId ? null : current
        ),
    }),
    [reserveRight]
  );

  const card = shown?.card;
  const side = shown?.pointerLeft ? { right: reserveRight + 8 } : { left: 8 };

  return (
    <PreviewContext.Provider value={preview}>
      {children}
      {card?.ref && !pressed && (
        <div
          data-testid="card-preview"
          className="fixed top-2 z-30 aspect-card h-[min(600px,calc(100vh-1rem))] pointer-events-none drop-shadow-2xl"
          style={side}
        >
          <CardImg
            scryfallId={card.ref.id}
            face={card.faceIndex}
            name={card.ref.name}
          />
        </div>
      )}
    </PreviewContext.Provider>
  );
};

export const useCardPreview = () => useContext(PreviewContext);
