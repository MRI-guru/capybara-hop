# Capybara Hop! 3.12

- Adventure Passport: six permanent obstacle milestones award 50–750 acorns each. Continued runs only add newly cleared obstacles. No ad or purchase is required.
- First successful purchase includes Berry Baker. Cancelled/failed/preview purchases grant nothing. Already-owned Berry Baker is not duplicated and has no substitute reward.
- Restore checks RevenueCat purchase history to recover the gift when that history is available. Anonymous identities do not guarantee cross-device recovery of consumed purchases; a linked customer identity and server-managed promotional entitlement are required before advertising guaranteed cross-device restoration.
- Daily refill no longer overwrites purchased booster balances. It tops empty slots up to one on launch.
- No new ad placements. All existing ads remain player-initiated.

## Testing

Run `node tests/journey.test.cjs` and `npx tsc --noEmit`.
Use TestFlight sandbox to test successful, cancelled, failed, restored and repeated purchases across all product types. Expo Go cannot verify real purchases. No production store configuration or release was performed by this update.

Keep your existing environment/account configuration when moving to this source folder. Extract the ZIP before running npm install.
