import { Tabs } from 'expo-router';
import { useIsAdmin } from '@/store/auth.store';

export default function TabsLayout() {
  const isAdmin = useIsAdmin();
  return (
    <Tabs screenOptions={{ headerShown: true, tabBarLabelStyle: { fontSize: 12 } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', href: isAdmin ? '/approvals' : null }} />
    </Tabs>
  );
}
