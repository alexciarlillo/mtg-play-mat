import type { RequestHandlers } from '../../ipc';
import type SettingsStore from './SettingsStore';

type SettingsHandlers = Pick<RequestHandlers, 'getSettings' | 'updateSettings'>;

const createSettingsHandlers = ({
  settings,
}: {
  settings: SettingsStore;
}): SettingsHandlers => ({
  getSettings: () => settings.settings,
  updateSettings: (patch: unknown) => settings.update(patch),
});

export default createSettingsHandlers;
