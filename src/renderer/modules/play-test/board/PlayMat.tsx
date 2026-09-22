import { matImageUrl } from '@shared/mat';

import { MAT_HEIGHT, MAT_WIDTH } from './layout';

// A player's own picture under their battlefield, drawn as an object in
// the field's logical units rather than as wallpaper behind the window.
// A wider window shows more table around it; it is never re-cropped.
const PlayMat = ({
  id,
  testId = 'play-mat',
}: {
  id: string | null | undefined;
  testId?: string;
}) => {
  if (!id) return null;
  return (
    <div
      data-testid={testId}
      data-mat={id}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 rounded-2xl bg-cover bg-center bg-no-repeat shadow-lg ring-1 ring-black/25"
      style={{
        width: MAT_WIDTH,
        height: MAT_HEIGHT,
        backgroundImage: `url("${matImageUrl(id)}")`,
      }}
    />
  );
};

export default PlayMat;
