import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { TransactionStatus, ZohoSyncStatus } from '@warehouse/types';

const COLORS: Record<TransactionStatus | ZohoSyncStatus, string> = {
  PENDING: '#f59e0b',
  APPROVED: '#16a34a',
  REJECTED: '#dc2626',
  NOT_SYNCED: '#94a3b8',
  SUCCESS: '#16a34a',
  FAILED: '#dc2626',
};

export function StatusBadge({ status }: { status: TransactionStatus | ZohoSyncStatus }) {
  const color = COLORS[status] ?? '#475569';
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={{ color, fontWeight: '600', fontSize: 11 }}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
});
