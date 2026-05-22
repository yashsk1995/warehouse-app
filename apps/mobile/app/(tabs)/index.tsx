import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { palette } from '@/theme/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.greeting}>
          Hi {user?.username ?? 'there'}
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          What would you like to do today?
        </Text>
      </View>

      <BigAction
        title="Add Inventory"
        subtitle="Scan a delivery sheet to add stock"
        icon="plus-box"
        color={palette.success}
        onPress={() => router.push({ pathname: '/upload', params: { actionType: 'ADD' } })}
      />
      <BigAction
        title="Remove Inventory"
        subtitle="Scan a pull sheet to remove stock"
        icon="minus-box"
        color={palette.danger}
        onPress={() => router.push({ pathname: '/upload', params: { actionType: 'REMOVE' } })}
      />
      <BigAction
        title="Current Inventory"
        subtitle="Browse current SKU levels"
        icon="package-variant-closed"
        color={palette.primary}
        onPress={() => router.push('/(tabs)/inventory')}
      />
      <BigAction
        title="History"
        subtitle="See past uploads & approvals"
        icon="history"
        color={palette.secondary}
        onPress={() => router.push('/(tabs)/history')}
      />

      <View style={{ marginTop: 32 }}>
        <Button mode="outlined" icon="logout" onPress={logout} textColor={palette.textMuted}>
          Sign out
        </Button>
      </View>
    </ScrollView>
  );
}

function BigAction({
  title,
  subtitle,
  icon,
  color,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  onPress: () => void;
}) {
  return (
    <Card style={styles.action} onPress={onPress} mode="elevated">
      <Card.Content style={styles.actionContent}>
        <View style={[styles.iconBadge, { backgroundColor: color + '1A' }]}>
          <MaterialCommunityIcons name={icon} size={28} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={styles.actionTitle}>
            {title}
          </Text>
          <Text variant="bodySmall" style={styles.actionSubtitle}>
            {subtitle}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={palette.textMuted} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 64, backgroundColor: palette.background },
  header: { marginBottom: 20 },
  greeting: { fontWeight: '700', color: palette.text, marginBottom: 4 },
  subtitle: { color: palette.textMuted },
  action: {
    marginBottom: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionContent: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontWeight: '700', color: palette.text },
  actionSubtitle: { color: palette.textMuted, marginTop: 2 },
});
