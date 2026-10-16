import type { MoxfieldDeckInfo } from '@shared/moxfield';
import classNames from 'classnames';

// Marks a deck synced from Moxfield, and one no longer there.
const MoxfieldBadge = ({
  info,
  className,
}: {
  info: MoxfieldDeckInfo;
  className?: string;
}) => (
  <span className={classNames('inline-flex flex-wrap gap-1', className)}>
    <span
      data-testid="moxfield-badge"
      title={`Synced from Moxfield, by ${info.author}`}
      className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800"
    >
      Moxfield
    </span>
    {info.gone && (
      <span
        data-testid="moxfield-gone"
        className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
      >
        No longer on Moxfield
      </span>
    )}
  </span>
);

export default MoxfieldBadge;
