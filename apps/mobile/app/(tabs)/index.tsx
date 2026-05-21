import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={{ marginBottom: 4 }}>
        Hi {user?.username ?? 'there'}
      </Text>
      <Text variant="bodyMedium" style={{ marginBottom: 24, color: '#475569' }}>
        What would you like to do?
      </Text>

      <BigAction
        title="Add Inventory"
        subtitle="Scan a delivery sheet to add stock"
        color="#16a34a"
        onPress={() => router.push({ pathname: '/upload', params: { actionType: 'ADD' } })}
      />
      <BigAction
        title="Remove Inventory"
        subtitle="Scan a pull sheet to remove stock"
        color="#dc2626"
        onPress={() => router.push({ pathname: '/upload', params: { actionType: 'REMOVE' } })}
      />
      <BigAction
        title="Current Inventory"
        subtitle="Browse current SKU levels"
        color="#2563eb"
        onPress={() => router.push('/(tabs)/inventory')}
      />
      <BigAction
        title="History"
        subtitle="See past uploads & approvals"
        color="#0ea5e9"
        onPress={() => router.push('/(tabs)/history')}
      />

      <View style={{ marginTop: 32 }}>
        <Button mode="outlined" onPress={logout}>Sign out</Button>
      </View>
    </ScrollView>
  );
}

function BigAction({
  title,
  subtitle,
  color,
  onPress,
}: {
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Card style={[styles.action, { borderLeftColor: color }]} onPress={onPress} mode="elevated">
      <Card.Content>
        <Text variant="titleLarge" style={{ fontWeight: '700' }}>{title}</Text>
        <Text variant="bodyMedium" style={{ color: '#64748b' }}>{subtitle}</Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 64 },
  action: { marginBottom: 14, borderLeftWidth: 6 },
});
