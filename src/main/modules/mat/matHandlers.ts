import { type MatChoice } from '@shared/mat';

import type { RequestHandlers } from '../../ipc';
import { MatError } from '../../mats/matEncoding';
import type MatStore from '../../mats/MatStore';
import type SettingsStore from '../settings/SettingsStore';

type MatHandlers = Pick<RequestHandlers, 'chooseMatImage' | 'clearMatImage'>;

export interface MatHandlerDeps {
  mats: MatStore;
  settings: SettingsStore;
  // Resolves to the chosen file, or null if the player closed the
  // dialog. Injected so the flow can be driven without a real window.
  pickFile(): Promise<string | null>;
}

// A mat that could not be read is the player's problem to fix, so it is
// reported back rather than thrown: the Settings page says why.
const describe = (err: unknown): string =>
  err instanceof MatError
    ? err.message
    : 'That image could not be used. Try another file.';

const createMatHandlers = ({
  mats,
  settings,
  pickFile,
}: MatHandlerDeps): MatHandlers => ({
  chooseMatImage: async (): Promise<MatChoice> => {
    const file = await pickFile();
    if (!file) return { id: null, error: null };
    try {
      const id = await mats.importFile(file);
      const previous = settings.settings.matImage;
      settings.update({ matImage: id });
      if (previous && previous !== id) await mats.forget(previous);
      return { id, error: null };
    } catch (err) {
      return { id: null, error: describe(err) };
    }
  },

  clearMatImage: async () => {
    const previous = settings.settings.matImage;
    settings.update({ matImage: '' });
    if (previous) await mats.forget(previous);
  },
});

export default createMatHandlers;
