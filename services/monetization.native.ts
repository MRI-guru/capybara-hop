import Constants from 'expo-constants';

export type PurchaseProductId =
  | 'capy_booster_pack_3'
  | 'capy_triple_pack_3'
  | 'capy_unlock_all_outfits'
  | 'capy_acorns_250'
  | 'capy_acorns_1500'
  | 'capy_acorns_4000'
  | `capy_outfit_${string}`;

const isExpoGo = String(Constants.executionEnvironment) === 'storeClient';
const revenueCatKey = process.env.EXPO_OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let purchasesReady = false;
let adsReady = false;

export async function initializeMonetization() {
  if (isExpoGo) return { native: false as const, reason: 'expo_go' as const };
  try {
    if (revenueCatKey && !purchasesReady) {
      const Purchases = require('react-native-purchases').default;
      Purchases.configure({ apiKey: revenueCatKey });
      purchasesReady = true;
    }
    if (!adsReady) {
      const ads = require('react-native-google-mobile-ads');
      await ads.AdsConsent.gatherConsent();
      await ads.default().initialize();
      adsReady = true;
    }
    return { native: true as const, purchasesReady, adsReady };
  } catch {
    return { native: false as const, reason: 'native_unavailable' as const };
  }
}

export async function purchaseProduct(productId: PurchaseProductId) {
  if (!purchasesReady) return { purchased: false as const, reason: isExpoGo ? 'expo_go' as const : 'not_configured' as const };
  try {
    const Purchases = require('react-native-purchases').default;
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const selected = packages.find((item: any) => item.product.identifier === productId);
    if (!selected) return { purchased: false as const, reason: 'product_unavailable' as const };
    await Purchases.purchasePackage(selected);
    return { purchased: true as const, productId };
  } catch (error: any) {
    return { purchased: false as const, reason: error?.userCancelled ? 'cancelled' as const : 'purchase_failed' as const };
  }
}

export async function restorePurchases() {
  if (!purchasesReady) return { restored: false as const, activeProductIds: [] as string[] };
  try {
    const Purchases = require('react-native-purchases').default;
    const customerInfo = await Purchases.restorePurchases();
    const active = Object.values(customerInfo.entitlements.active ?? {})
      .map((item: any) => item.productIdentifier)
      .filter(Boolean);
    const hasPurchaseHistory = active.length > 0 || (customerInfo.nonSubscriptionTransactions ?? []).length > 0;
    return { restored: true as const, activeProductIds: active as string[], hasPurchaseHistory };
  } catch {
    return { restored: false as const, activeProductIds: [] as string[] };
  }
}

export async function showRewardedAd() {
  if (!adsReady) return { earned: false as const, reason: isExpoGo ? 'expo_go' as const : 'not_configured' as const };
  const ads = require('react-native-google-mobile-ads');
  const productionUnitId = process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID;
  const loadRewarded = (unitId: string) => new Promise<{ earned: boolean; reason?: string }>(resolve => {
    const rewarded = ads.RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
    let earned = false;
    let settled = false;
    let subscriptions: Array<() => void> = [];
    const finish = (result: { earned: boolean; reason?: string }) => {
      if (settled) return;
      settled = true;
      subscriptions.forEach(unsubscribe => unsubscribe());
      resolve(result);
    };
    subscriptions = [
      rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => rewarded.show()),
      rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => finish({ earned })),
      rewarded.addAdEventListener(ads.AdEventType.ERROR, () => finish({ earned: false, reason: 'ad_failed' })),
    ];
    rewarded.load();
  });
  const result = await loadRewarded(productionUnitId || ads.TestIds.REWARDED);
  if (result.earned || !productionUnitId) return result;
  // New or TestFlight apps can have no production fill before AdMob approves the app.
  // Fall back to Google's test unit so rewarded-ad flows remain testable.
  return loadRewarded(ads.TestIds.REWARDED);
}
