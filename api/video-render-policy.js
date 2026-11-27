export function renderCallbackPrivacyStatus() {
  // Renderer callbacks are test/automation paths; never make their uploads public.
  return 'private';
}
