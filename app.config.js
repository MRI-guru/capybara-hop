const IOS_TEST_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const ANDROID_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

module.exports = ({ config }) => {
  const production = process.env.EAS_BUILD_PROFILE === 'production';
  const iosAppId = process.env.ADMOB_IOS_APP_ID || IOS_TEST_APP_ID;
  const androidAppId = process.env.ADMOB_ANDROID_APP_ID || ANDROID_TEST_APP_ID;

  if (production && (!process.env.ADMOB_IOS_APP_ID || !process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY)) {
    throw new Error('Production monetization IDs are missing. Set ADMOB_IOS_APP_ID and EXPO_PUBLIC_REVENUECAT_IOS_KEY in the EAS production environment.');
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins || []).filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) !== 'react-native-google-mobile-ads'),
      ['react-native-google-mobile-ads', {
        iosAppId,
        androidAppId,
        userTrackingUsageDescription: 'Capybara Hop uses this identifier to show relevant ads and keep optional rewards free.',
      }],
    ],
  };
};
