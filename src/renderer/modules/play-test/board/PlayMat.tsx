import { matImageUrl } from '@shared/mat';

import { MAT_HEIGHT, MAT_WIDTH } from './layout';

// A player's own picture under their battlefield, drawn as an object in
// the field's logical units rather than as wallpaper behind the window.
// A wider window shows more table around it, filled by the backdrop.
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

// The same art again behind the mat, enlarged, blurred and dimmed to fill
// the rest of the field. It is only ambience, so it may crop differently
// on every screen; the sharp mat is what cards are placed on.
export const MatBackdrop = ({
  id,
  testId = 'play-mat-backdrop',
}: {
  id: string | null | undefined;
  testId?: string;
}) => {
  if (!id) return null;
  return (
    <div
      data-testid={testId}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
    >
      <div
        className="absolute -inset-10 bg-cover bg-center blur-2xl brightness-75"
        style={{ backgroundImage: `url("${matImageUrl(id)}")` }}
      />
    </div>
  );
};

export default PlayMat;
