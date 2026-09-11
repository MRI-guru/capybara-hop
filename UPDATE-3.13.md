# Capybara Hop! 3.13.0 / build 16

- Three weekly goals award 375 acorns total. Weekly progress starts with this update, resets Monday 00:00 UTC, and is credited at each run segment's end. Claim before reset.
- The third goal alternates weekly between power-ups and double jumps.
- Every owned outfit, including Classic, has permanent mastery rewards: level 3 = 30 acorns, level 5 = 60, level 10 = 150. Existing mastery counts. Each tier is claimable once per outfit.
- Weekly and mastery rewards are visible in Quests and the Closet. Weekly shortcut added to Home.
- No new ads, paid products, or score multipliers. First-purchase gift and permanent Passport remain intact.
- New fields use the existing progress save; no database schema migration required. Cross-device synchronization was not end-to-end tested.

## Test

`node tests/journey.test.cjs`

After extracting, keep your existing environment/account configuration, run `npm install`, then `npx expo start --clear --port 8082`. Check the 3.13 badge. Test phone layout, new/old saves, claims, and resumed runs before submitting a store build. Bundle export is not an App Store build or device playtest.
