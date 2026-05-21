// app.config.js — runs at build time, has access to process.env.
// Override API URL per build:
//   EXPO_PUBLIC_API_BASE_URL=https://crisp-meadow-1234.trycloudflare.com/api/v1 npx expo start
// Or set it in eas.json profile env for cloud builds.
const DEFAULT_DEV_URL = 'http://10.0.2.2:3000/api/v1'; // Android emulator → host

module.exports = () => ({
  expo: {
    name: 'Warehouse Inventory',
    slug: 'warehouse-inventory',
    version: '1.0.0',
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/6b1d11d2-e9a9-4830-9513-386983154d89',
    },
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.warehouse.inventory',
    },
    android: {
      package: 'com.warehouse.inventory',
      adaptiveIcon: {
        backgroundColor: '#0f172a',
      },
      permissions: ['CAMERA', 'READ_EXTERNAL_STORAGE'],
    },
    web: { bundler: 'metro' },
    plugins: [
      'expo-router',
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow access to upload inventory sheets.',
          cameraPermission: 'Allow camera to capture inventory sheets.',
        },
      ],
    ],
    scheme: 'warehouse',
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_DEV_URL,
      eas: {
        projectId: '6b1d11d2-e9a9-4830-9513-386983154d89',
      },
    },
  },
});
