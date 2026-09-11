# Capybara Hop! monetization setup (v3.9.2)

The native purchase and ad adapters are implemented. Expo Go/web stays in preview mode because those clients cannot load custom native billing or AdMob modules. Use an EAS development build or TestFlight for real sandbox testing.

## Product catalog

Create these products in App Store Connect, Google Play Console, and RevenueCat. Product IDs must match exactly.

| Product ID | Type | App display | Price |
| --- | --- | --- | --- |
| `capy_booster_pack_3` | Consumable | +3 Shield, Slow, and Continue | $0.99 |
| `capy_triple_pack_3` | Consumable | +3 Triple Hop boosters | $0.99 |
| `capy_acorns_250` | Consumable | 250 acorns | $0.99 |
| `capy_acorns_1500` | Consumable | 1,500 acorns | $4.99 |
| `capy_acorns_4000` | Consumable | 4,000 acorns | $9.99 |
| `capy_unlock_all_outfits` | Non-consumable | Unlock every outfit | $19.99 |
| `capy_outfit_strawberry` | Non-consumable | Berry Baker | $1.99 |
| `capy_outfit_wizard` | Non-consumable | Cappy Wizard | $2.99 |
| `capy_outfit_bee` | Non-consumable | Honey Baker | $2.99 |
| `capy_outfit_unicorn` | Non-consumable | Unicorn Cappy | $3.99 |
| `capy_outfit_mermaid` | Non-consumable | Mer-Cappy | $3.99 |
| `capy_outfit_dinosaur` | Non-consumable | Ocean Explorer | $3.99 |
| `capy_outfit_champion` | Non-consumable | Golden Champion | $4.99 |

Add every product to RevenueCat's current Offering. Attach the non-consumable products to entitlements so Restore Purchases can recover them. Consumable acorns and boosters intentionally do not restore.

## Ad placements

- Rewarded: user opts in for 25 acorns or one selected booster.
- There are no automatic interstitial or banner ads.
- Store rewards are limited to three acorn ads and three booster ads per day.
- Crash continues and empty-booster refills are always initiated by the player.

Google UMP consent runs before the mobile ads SDK initializes. Requests currently use non-personalized ads. Test IDs are the default outside a production EAS build.

## Required environment variables

Add these to the EAS `production` environment, not to a committed `.env` file:

- `ADMOB_IOS_APP_ID`
- `ADMOB_ANDROID_APP_ID` when shipping Android
- `EXPO_PUBLIC_ADMOB_REWARDED_ID`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` when shipping Android

Example:

```powershell
eas env:create --environment production --name ADMOB_IOS_APP_ID --value "ca-app-pub-...~..." --visibility sensitive
eas env:create --environment production --name EXPO_PUBLIC_ADMOB_REWARDED_ID --value "ca-app-pub-.../..." --visibility sensitive
```

## Release checklist

1. Create all products above and an active RevenueCat Offering.
2. Create one rewarded AdMob ad unit. No interstitial unit is used.
3. Add the EAS environment variables and enable anonymous sign-ins in Supabase Authentication.
4. Host `public/privacy.html` and `public/support.html`; enter both URLs in App Store Connect/Play Console.
5. Build with the test/sandbox accounts and verify purchase, restore, rewarded-ad, and consent flows.
6. Capture final screenshots and complete App Privacy/Data Safety disclosures.
7. Run `eas build -p ios --profile production`, then `eas submit -p ios --latest`.
