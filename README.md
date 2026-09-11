# Capybara Hop!

A one-tap endless runner built with Expo and React Native.

## Included

- Responsive double-jump controls and collision physics
- Increasing obstacle speed and persistent best score
- Acorns earned each run
- Eighteen total outfits with expanded earned and premium collections
- Full-body dressed character sprites replace accessory emoji badges
- Running/jumping motion cycle and corrected ground contact
- Native-driven gameplay movement with cross-faded running frames
- Ten-hop obstacle scoring with exact 1.25x, 1.5x, and 2x outfit rewards
- Forgiving collision boxes, earlier warnings, and protected spacing after hard obstacles
- Score bounce, landing dust, crash shake, and iOS/Android haptic feedback
- Random tall variants of logs, rocks, and stumps after score 4
- Taller stacked obstacles that require the second jump
- Outfit ownership and selection saved locally
- First-launch nickname setup with quick suggestions and cloud persistence
- Distinct outfit perks including extra acorns, bonus-item odds, longer power-ups, and slower jaguars
- Home-screen daily reward and next-world progress make return goals easy to find
- Rewarded-ad preview flow
- Custom capybara-and-orange store icon
- Public high-score leaderboard backed by Supabase
- Four daily boosters: 10-second shield, 10-second slow time, crash continue, and full-run 3x hops
- Shield-cleared obstacles award a hop automatically
- Continue asks for confirmation and gives a three-second restart countdown
- Empty booster slots offer optional rewarded ads for one refill
- Purchasable three-of-each booster refill preview
- EAS development, preview, and production profiles
- Five unlockable, freely selectable worlds with individual records, star ratings, terrain, obstacles, speed, and music
- A rotating featured world pays 50% bonus run acorns, and each world's first star opens a one-time prize chest
- Rotating daily missions, seven-day streak rewards, achievements, and outfit mastery
- Three-step first-run tutorial plus music, sound, and haptics settings
- Original effects plus individual forest, beach, jungle, snow, and volcano music loops
- Secure anonymous cloud saves and server-validated run submissions
- Weekly/all-time leaderboards split between standard and boosted outfits
- Supabase gameplay analytics and an app-level crash fallback
- Native RevenueCat purchases, Restore Purchases, and player-chosen rewarded ads only
- Full-run 3x Hop booster with one free daily and purchasable refills
- Original illustrated melon, flying-legume, and phase-strawberry power-ups
- Ready-to-host privacy policy and support pages

## Run

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go for gameplay testing. Live store purchases and AdMob require a development build with account IDs; see `MONETIZATION.md`.

In Supabase Dashboard, open Authentication → Providers → Anonymous Sign-Ins and enable it. This gives each installation a private cloud-save identity without asking players for an email address.

## Verify

```bash
npx tsc --noEmit
npx expo export --platform web
```
