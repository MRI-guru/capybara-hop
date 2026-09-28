// TypeScript fallback. Expo resolves monetization.native.ts on iOS/Android and
// monetization.web.ts in browsers, keeping native ad code out of the web bundle.
export * from './monetization.web';
