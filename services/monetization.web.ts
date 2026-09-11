export type PurchaseProductId =
  | 'capy_booster_pack_3'
  | 'capy_triple_pack_3'
  | 'capy_unlock_all_outfits'
  | 'capy_acorns_250'
  | 'capy_acorns_1500'
  | 'capy_acorns_4000'
  | `capy_outfit_${string}`;

export async function initializeMonetization(): Promise<{ native: boolean; reason?: string; purchasesReady?: boolean; adsReady?: boolean }> {
  return { native: false as const, reason: 'web_preview' as const };
}

export async function purchaseProduct(_productId: PurchaseProductId): Promise<{ purchased: boolean; reason?: string; productId?: PurchaseProductId }> {
  return { purchased: false as const, reason: 'web_preview' as const };
}

export async function restorePurchases(): Promise<{ restored: boolean; activeProductIds: string[]; hasPurchaseHistory?: boolean }> {
  return { restored: false as const, activeProductIds: [] as string[] };
}

export async function showRewardedAd(): Promise<{ earned: boolean; reason?: string }> {
  return { earned: false as const, reason: 'web_preview' as const };
}
