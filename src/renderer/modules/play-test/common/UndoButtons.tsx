import { redo, undo } from '../viewStore';
import { useUndoState } from './useUndoState';

interface Props {
  className: string;
}

const UndoButtons = ({ className }: Props) => {
  const { canUndo, canRedo } = useUndoState();
  return (
    <>
      <button
        type="button"
        title="Undo (⌘/Ctrl+Z)"
        className={className}
        disabled={!canUndo}
        onClick={undo}
      >
        Undo
      </button>
      <button
        type="button"
        title="Redo (⇧⌘/Ctrl+Z)"
        className={className}
        disabled={!canRedo}
        onClick={redo}
      >
        Redo
      </button>
    </>
  );
};

export default UndoButtons;
