import classNames from 'classnames';

// The board only ever knows how many cards wait in a sideboard; their
// names stay with the owner's hand window.
const SideboardCount = ({
  count,
  testId,
  className,
}: {
  count: number | undefined;
  testId: string;
  className?: string;
}) =>
  count ? (
    <div
      data-testid={testId}
      data-count={count}
      title="Cards in the sideboard, outside the game"
      className={classNames(
        'col-span-full text-center text-xs font-medium text-slate-300',
        className
      )}
    >
      Sideboard {count}
    </div>
  ) : null;

export default SideboardCount;
