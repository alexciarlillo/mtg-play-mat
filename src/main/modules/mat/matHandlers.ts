import { CARD_BACK_GALLERY_URL, type MatChoice } from '@shared/mat';

import type { RequestHandlers } from '../../ipc';
import { MatError } from '../../mats/matEncoding';
import type MatStore from '../../mats/MatStore';
import type { TableImageKind } from '../../mats/MatStore';
import type SettingsStore from '../settings/SettingsStore';

type MatHandlers = Pick<
  RequestHandlers,
  | 'chooseMatImage'
  | 'clearMatImage'
  | 'chooseCardBack'
  | 'clearCardBack'
  | 'openCardBackGallery'
>;

export interface MatHandlerDeps {
  mats: MatStore;
  settings: SettingsStore;
  // Resolves to the chosen file, or null if the player closed the
  // dialog. Injected so the flow can be driven without a real window.
  pickFile(kind: TableImageKind): Promise<string | null>;
  openExternal(url: string): Promise<void>;
}

// Which setting holds each kind of picture.
const settingFor = {
  mat: 'matImage',
  back: 'cardBack',
} as const satisfies Record<TableImageKind, string>;

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
  openExternal,
}: MatHandlerDeps): MatHandlers => {
  // The store's files are shared by id, so one still named by the other
  // setting is kept.
  const forget = async (id: string) => {
    const { matImage, cardBack } = settings.settings;
    if (id && id !== matImage && id !== cardBack) await mats.forget(id);
  };

  const choose = (kind: TableImageKind) => async (): Promise<MatChoice> => {
    const file = await pickFile(kind);
    if (!file) return { id: null, error: null };
    try {
      const id = await mats.importFile(file, kind);
      const previous = settings.settings[settingFor[kind]];
      settings.update({ [settingFor[kind]]: id });
      if (previous !== id) await forget(previous);
      return { id, error: null };
    } catch (err) {
      return { id: null, error: describe(err) };
    }
  };

  const clear = (kind: TableImageKind) => async () => {
    const previous = settings.settings[settingFor[kind]];
    settings.update({ [settingFor[kind]]: '' });
    await forget(previous);
  };

  return {
    chooseMatImage: choose('mat'),
    clearMatImage: clear('mat'),
    chooseCardBack: choose('back'),
    clearCardBack: clear('back'),
    openCardBackGallery: () => openExternal(CARD_BACK_GALLERY_URL),
  };
};

export default createMatHandlers;
