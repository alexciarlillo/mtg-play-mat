import path from 'node:path';

import { DEEP_LINK_SCHEME, findJoinLink } from '@shared/net/codec';
import { app } from 'electron';

// Registration writes to OS settings, so tests never do it and dev runs
// only do it on request; packaged builds always claim the scheme.
export const registerDeepLinkScheme = (testHooks: boolean) => {
  if (testHooks) return;
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  } else if (process.env.MTG_PLAY_MAT_REGISTER_PROTOCOL === '1') {
    // An unpackaged Electron needs the app path to relaunch this app.
    const entry = process.argv[1];
    if (entry) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
        path.resolve(entry),
      ]);
    }
  }
};

// null means another launch happened without a link: just come forward.
type LinkHandler = (link: string | null) => void;

// macOS delivers links through open-url (possibly before ready); Windows
// and Linux start a second instance with the link in argv, which the
// single-instance lock forwards here. Links wait until a handler exists.
export const watchDeepLinks = () => {
  let handler: LinkHandler | null = null;
  const queued: string[] = [];

  const deliver = (link: string | null) => {
    if (handler) handler(link);
    else if (link) queued.push(link);
  };

  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliver(findJoinLink([url]));
  });
  app.on('second-instance', (_event, argv) => {
    deliver(findJoinLink(argv));
  });
  const initial = findJoinLink(process.argv);
  if (initial) queued.push(initial);

  return (next: LinkHandler) => {
    handler = next;
    queued.splice(0).forEach(next);
  };
};
