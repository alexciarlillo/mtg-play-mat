import { Modal } from './Dialogs';
import { shortcutList } from './useGameShortcuts';

const ShortcutHelp = ({ onClose }: { onClose(): void }) => (
  <Modal title="Keyboard shortcuts" onClose={onClose}>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {shortcutList.map(({ key, description }) => (
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
    <p className="mt-3 text-sm text-slate-600">
      Right-click the battlefield or use the Game menu for everything else.
    </p>
  </Modal>
);

export default ShortcutHelp;
