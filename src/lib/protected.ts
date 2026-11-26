// One place for the anti-cheat rule (docs/ANTI-CHEAT.md): anything matching here is shown
// read-only, with no switch, checkbox or action, whatever the backend says it can do.

// Long names match anywhere (EasyAntiCheat_EOS.exe, BEService_x64.exe, RiotClientServices.exe,
// FACEITService.exe); the short service names only as whole words. Over-matching is the safe side.
const PROTECTED = /riot|vanguard|valorant|easy\s?anti\s?cheat|battleye|beservice|faceit|league of legends|\b(vgc|vgk|vgm|vgtray)\b/i;

export const PROTECTED_REASON = "Lagsmith never changes anti-cheat software";

export function isProtected(...texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => !!t && PROTECTED.test(t));
}
