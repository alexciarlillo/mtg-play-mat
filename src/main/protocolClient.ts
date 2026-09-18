import path from 'node:path';

export interface ProtocolClientEnv {
  isPackaged: boolean;
  execPath: string;
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}

// What to pass to setAsDefaultProtocolClient: [] for the running executable,
// [exe, args] for a specific command, or null to leave the OS alone.
export type ProtocolClientArgs = [] | [string, string[]] | null;

export const protocolClientArgs = ({
  isPackaged,
  execPath,
  argv,
  env,
}: ProtocolClientEnv): ProtocolClientArgs => {
  if (isPackaged) {
    // A portable exe runs from a fresh temp folder on every launch, so the
    // link must point at the exe the user actually double-clicked.
    const portable = env.PORTABLE_EXECUTABLE_FILE;
    return portable ? [portable, []] : [];
  }
  if (env.MTG_PLAY_MAT_REGISTER_PROTOCOL !== '1') return null;
  // An unpackaged Electron needs the app path to relaunch this app.
  const entry = argv[1];
  return entry ? [execPath, [path.resolve(entry)]] : null;
};
