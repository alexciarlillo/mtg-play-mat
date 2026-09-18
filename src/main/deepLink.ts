import { DEEP_LINK_SCHEME, findJoinLink } from '@shared/net/codec';
import { app } from 'electron';

import { protocolClientArgs } from './protocolClient';

// Registration writes to OS settings, so tests never do it and dev runs
// only do it on request; packaged builds always claim the scheme.
export const registerDeepLinkScheme = (testHooks: boolean) => {
  if (testHooks) return;
  const args = protocolClientArgs({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    argv: process.argv,
    env: process.env,
  });
  if (!args) return;
  if (args.length === 0) app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  else app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, ...args);
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
