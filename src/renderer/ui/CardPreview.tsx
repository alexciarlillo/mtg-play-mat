import type { CardView } from '@shared/game';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import CardArt from './CardArt';
import type { HoverKey, HoverKeyHandler } from './hoverKeys';

// Read when a key is pressed, so it always holds the card's latest view.
export type HoverKeysRef = RefObject<HoverKeyHandler | undefined>;

interface Preview {
  // reveal lets the owner preview their own face-down card.
  show(card: CardView, clientX: number, reveal?: boolean): void;
  hide(instanceId: string): void;
  // Tracks the hovered card even when it shows no preview (face down).
  hover(keys: HoverKeysRef): void;
  unhover(keys: HoverKeysRef): void;
  // Hands a key to the hovered card; false when no card took it.
  pressHoverKey(key: HoverKey): boolean;
}

const noop: Preview = {
  show: () => {},
  hide: () => {},
  hover: () => {},
  unhover: () => {},
  pressHoverKey: () => false,
};

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
  // Keys don't re-render anything, so the hovered card isn't state.
  const hovered = useRef<HoverKeysRef | null>(null);

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
      show: (card, clientX, reveal = false) => {
        if (!card.ref || (card.faceDown && !reveal)) return;
        const free = window.innerWidth - reserveRight;
        setShown({ card, pointerLeft: clientX < free / 2 });
      },
      hide: (instanceId) =>
        setShown((current) =>
          current?.card.instanceId === instanceId ? null : current
        ),
      hover: (keys) => {
        hovered.current = keys;
      },
      unhover: (keys) => {
        if (hovered.current === keys) hovered.current = null;
      },
      pressHoverKey: (key) => {
        const handler = hovered.current?.current;
        if (!handler) return false;
        return handler(key) !== false;
      },
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
          className="fixed top-2 z-45 aspect-card h-[min(600px,calc(100vh-1rem))] pointer-events-none drop-shadow-2xl"
          style={side}
        >
          <CardArt cardRef={card.ref} faceIndex={card.faceIndex} />
        </div>
      )}
    </PreviewContext.Provider>
  );
};

export const useCardPreview = () => useContext(PreviewContext);

// Hover keys for whatever element takes the returned mouse handlers. An
// element without a handler never takes the hover from one that has one,
// such as a card inside a wrapper that also covers its badges.
export const useHoverKeys = (handler: HoverKeyHandler | undefined) => {
  const preview = useCardPreview();
  const keys = useRef(handler);
  useEffect(() => {
    keys.current = handler;
  });
  // An element removed while hovered never gets mouseleave.
  useEffect(() => () => preview.unhover(keys), [preview]);
  return {
    onMouseEnter: () => {
      if (keys.current) preview.hover(keys);
    },
    onMouseLeave: () => preview.unhover(keys),
  };
};
