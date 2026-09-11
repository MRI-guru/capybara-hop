const fs = require('fs');
const app = fs.readFileSync('App.tsx', 'utf8');
const moderation = fs.readFileSync('supabase/migrations/20260911190000_capybara_nickname_moderation.sql', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// The onboarding input must be a stable component; a nested component remounts on every keystroke.
assert(app.includes('function NameOnboardingModal('), 'nickname modal should be a module-level component');
assert(!app.includes('const NameOnboardingModal = () =>'), 'nickname modal must not be recreated inside GameApp');
assert(app.includes('blurOnSubmit'), 'nickname input should keep a predictable submit lifecycle');

// Saves have a recoverable backup and writes are best-effort rather than silently throwing.
assert(app.includes('BACKUP_STORAGE_KEY'), 'save backup key missing');
assert(app.includes('JSON.parse(backup)'), 'corrupt primary saves should fall back to backup');
assert(app.includes('AsyncStorage.setItem(BACKUP_STORAGE_KEY'), 'backup save write missing');

// Continue grace, boosters, double-jump gameplay and high-score end screen remain wired.
assert(app.includes('continueGracePassesRef.current = 1'), 'continue grace pass missing');
assert(app.includes('setContinueCountdown(3)'), 'continue countdown missing');
assert(app.includes('POWER-UP LOADOUT'), 'pre-run booster loadout missing');
assert(app.includes('togglePreRunBooster'), 'pre-run booster toggle missing');
assert(app.includes('continueArmedRef.current = preRunBoosters.continue'), 'pre-run continue arming missing');
assert(app.includes('setScreen(\'home\');'), 'selection screens should return to home');
assert(app.includes('nicknameIsAllowed'), 'nickname moderation missing');
assert(app.includes('Choose a different nickname'), 'blocked nickname message missing');
assert(!app.includes('RELEASE HARDENING • 3.14'), 'development version badge should not be shown above the logo');
assert(moderation.includes('capybara_name_allowed'), 'server-side nickname moderation missing');
assert(moderation.includes('Display name is not allowed'), 'server-side nickname rejection missing');
assert(app.includes('const maxJumps = tripleRunRef.current ? 3 : 2'), 'double/triple jump guard missing');
assert(app.includes('TRIPLE JUMP'), 'triple-jump active state missing');
assert(app.includes('shieldCountdown'), 'shield countdown visibility missing');
assert(app.includes('SHIELD {boosterSeconds}s'), 'shield countdown timer missing');
assert(app.includes('ENDING — GET READY'), 'shield ending warning missing');
assert(app.includes('shieldAura'), 'shield player aura missing');
assert(app.includes('Hop again'), 'hop-again gameover action missing');

// Optional ads are explicitly user-triggered and score modes distinguish any assisted run.
assert(app.includes("showRewardedAd()"), 'rewarded ad entry point missing');
assert(app.includes('boostedRunRef.current'), 'assisted-run fairness marker missing');
assert(app.includes("'boosted' : 'standard'"), 'leaderboard mode split missing');

console.log('Release hardening: nickname, save recovery, gameplay guards, optional ads and leaderboard fairness passed');
