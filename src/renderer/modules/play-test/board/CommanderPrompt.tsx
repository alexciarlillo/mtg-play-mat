import type { CommanderMove, ZoneId } from '@shared/game';

import { Modal } from '../common/Dialogs';
import { dispatch } from '../viewStore';
import { logPromptError } from './commanders';

const zoneNames: Partial<Record<ZoneId, string>> = {
  graveyard: 'the graveyard',
  exile: 'exile',
  hand: 'your hand',
  library: 'your library',
};

// Asks the owner whether a commander that just left for another zone
// goes to the command zone instead.
const CommanderPrompt = ({ prompt }: { prompt: CommanderMove }) => {
  const { instanceId, name, zone } = prompt;
  const no = () => {
    window.api.dismissCommanderPrompt(instanceId).catch(logPromptError);
  };
  const yes = () => dispatch({ type: 'moveCard', instanceId, to: 'command' });

  return (
    <Modal title="Return to command zone?" onClose={no}>
      <p className="mb-4 text-sm">
        {name} went to {zoneNames[zone] ?? zone}. Move it to the command zone
        instead?
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded px-3 py-1 text-sm font-medium ring-1 ring-slate-400"
          onClick={no}
        >
          No
        </button>
        <button
          type="button"
          autoFocus
          className="rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white ring-1 ring-slate-400"
          onClick={yes}
        >
          Yes
        </button>
      </div>
    </Modal>
  );
};

export default CommanderPrompt;
