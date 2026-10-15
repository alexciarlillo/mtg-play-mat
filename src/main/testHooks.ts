// Set only by end-to-end tests. It exposes test hooks in main, and keeps
// test runs from touching the network, the desktop or the user's focus.
export const testHooksEnabled = process.env.MTG_PLAY_MAT_TEST_HOOKS === '1';
