import Constants from 'expo-constants';

export type PurchaseProductId =
  | 'capy_booster_pack_3'
  | 'capy_triple_pack_3'
  | 'capy_unlock_all_outfits'
  | 'capy_remove_ads'
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
let adInitializationPromise: Promise<boolean> | null = null;
let interstitialAd: any | null = null;
let interstitialReady = false;
let interstitialLoadPromise: Promise<boolean> | null = null;

async function initializeAds() {
  if (adsReady) return true;
  if (!adInitializationPromise) {
    adInitializationPromise = (async () => {
      try {
        const ads = require('react-native-google-mobile-ads');
        // Consent can be unavailable during TestFlight testing or in some regions.
        // That should not prevent non-personalized rewarded ads from initializing.
        try {
          await ads.AdsConsent.gatherConsent();
        } catch {
          // Continue with non-personalized ad requests below.
        }
        await ads.default().initialize();
        adsReady = true;
        return true;
      } catch {
        adInitializationPromise = null;
        return false;
      }
    })();
  }
  return adInitializationPromise;
}

export async function initializeMonetization() {
  if (isExpoGo) return { native: false as const, reason: 'expo_go' as const };
  if (revenueCatKey && !purchasesReady) {
    try {
      const Purchases = require('react-native-purchases').default;
      Purchases.configure({ apiKey: revenueCatKey });
      purchasesReady = true;
    } catch {
      purchasesReady = false;
    }
  }
  await initializeAds();
  return { native: true as const, purchasesReady, adsReady };
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
    const entitlements = Object.values(customerInfo.entitlements.active ?? {})
      .map((item: any) => item.productIdentifier)
      .filter(Boolean);
    const nonSubscriptions = (customerInfo.nonSubscriptionTransactions ?? [])
      .map((item: any) => item.productIdentifier)
      .filter(Boolean);
    const active = [...new Set([...entitlements, ...nonSubscriptions])];
    const hasPurchaseHistory = active.length > 0;
    return { restored: true as const, activeProductIds: active as string[], hasPurchaseHistory };
  } catch {
    return { restored: false as const, activeProductIds: [] as string[] };
  }
}

export async function showRewardedAd() {
  if (isExpoGo) return { earned: false as const, reason: 'expo_go' as const };
  if (!adsReady && !(await initializeAds())) {
    return { earned: false as const, reason: 'not_configured' as const };
  }
  const ads = require('react-native-google-mobile-ads');
  const productionUnitId = process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID;
  const useTestAds = __DEV__ || process.env.EXPO_PUBLIC_ADMOB_USE_TEST_ADS === 'true';
  const loadRewarded = (unitId: string, timeoutMs: number) => new Promise<{ earned: boolean; reason?: string }>(resolve => {
    const rewarded = ads.RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
    let earned = false;
    let settled = false;
    let subscriptions: Array<() => void> = [];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: { earned: boolean; reason?: string }) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscriptions.forEach(unsubscribe => unsubscribe());
      resolve(result);
    };
    subscriptions = [
      rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => rewarded.show()),
      rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => finish({ earned })),
      rewarded.addAdEventListener(ads.AdEventType.ERROR, () => finish({ earned: false, reason: 'ad_failed' })),
    ];
    timeout = setTimeout(() => finish({ earned: false, reason: 'ad_load_timeout' }), timeoutMs);
    rewarded.load();
  });
  if (!useTestAds && !productionUnitId) {
    return { earned: false as const, reason: 'not_configured' as const };
  }
  return loadRewarded(useTestAds ? ads.TestIds.REWARDED : productionUnitId!, 15000);
}

export async function preloadInterstitialAd() {
  if (isExpoGo) return false;
  if (!adsReady && !(await initializeAds())) return false;
  if (interstitialReady && interstitialAd) return true;
  if (interstitialLoadPromise) return interstitialLoadPromise;
  const ads = require('react-native-google-mobile-ads');
  const productionUnitId = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID;
  const useTestAds = __DEV__ || process.env.EXPO_PUBLIC_ADMOB_USE_TEST_ADS === 'true';
  if (!useTestAds && !productionUnitId) return false;
  const unitId = useTestAds ? ads.TestIds.INTERSTITIAL : productionUnitId;
  interstitialLoadPromise = new Promise<boolean>(resolve => {
    const ad = ads.InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
    const timeout = setTimeout(() => finish(false), 15000);
    let subscriptions: Array<() => void> = [];
    const finish = (loaded: boolean) => {
      clearTimeout(timeout);
      subscriptions.forEach(unsubscribe => unsubscribe());
      interstitialLoadPromise = null;
      interstitialReady = loaded;
      interstitialAd = loaded ? ad : null;
      resolve(loaded);
    };
    subscriptions = [
      ad.addAdEventListener(ads.AdEventType.LOADED, () => finish(true)),
      ad.addAdEventListener(ads.AdEventType.ERROR, () => finish(false)),
    ];
    ad.load();
  });
  return interstitialLoadPromise;
}

export async function showInterstitialAd() {
  if (!interstitialReady || !interstitialAd) {
    const loaded = await preloadInterstitialAd();
    if (!loaded) return { shown: false as const, reason: isExpoGo ? 'expo_go' as const : 'ad_failed' as const };
  }
  const ads = require('react-native-google-mobile-ads');
  const ad = interstitialAd;
  interstitialAd = null;
  interstitialReady = false;
  return new Promise<{ shown: boolean; reason?: string }>(resolve => {
    let settled = false;
    let subscriptions: Array<() => void> = [];
    const timeout = setTimeout(() => finish({ shown: false, reason: 'ad_timeout' }), 20000);
    const finish = (result: { shown: boolean; reason?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscriptions.forEach(unsubscribe => unsubscribe());
      resolve(result);
    };
    subscriptions = [
      ad.addAdEventListener(ads.AdEventType.CLOSED, () => finish({ shown: true })),
      ad.addAdEventListener(ads.AdEventType.ERROR, () => finish({ shown: false, reason: 'ad_failed' })),
    ];
    Promise.resolve(ad.show()).catch(() => finish({ shown: false, reason: 'ad_failed' }));
  });
}
