import { Modal } from './Dialogs';
import {
  hoverShortcutList,
  type Shortcut,
  shortcutList,
} from './useGameShortcuts';

const ShortcutTable = ({
  label,
  shortcuts,
}: {
  label: string;
  shortcuts: Shortcut[];
}) => (
  <section aria-label={label}>
    <h3 className="mb-1 text-sm font-semibold">{label}</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {shortcuts.map(({ key, description }) => (
        <div key={key} className="contents">
          <dt>
            <kbd className="rounded bg-white px-2 py-0.5 font-mono ring-1 ring-slate-400">
              {key}
            </kbd>
          </dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  </section>
);

const ShortcutHelp = ({ onClose }: { onClose(): void }) => (
  <Modal title="Keyboard shortcuts" onClose={onClose}>
    <div className="flex flex-col gap-3">
      <ShortcutTable label="Anywhere" shortcuts={shortcutList} />
      <ShortcutTable
        label="Over one of your cards"
        shortcuts={hoverShortcutList}
      />
    </div>
    <p className="mt-3 text-sm text-slate-600">
      Point at a permanent on your battlefield or a card in your hand, then
      press its key. Right-click the battlefield or use the Game menu for
      everything else.
    </p>
  </Modal>
);

export default ShortcutHelp;
