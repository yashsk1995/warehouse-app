import { useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Card, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getHistory } from '@/services/inventory.api';
import type { TransactionStatus } from '@warehouse/types';
import { palette } from '@/theme/theme';

const STATUS_FILTERS: Array<{ key: TransactionStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

export default function HistoryScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<TransactionStatus | 'ALL'>('ALL');

  const query = useQuery({
    queryKey: ['history', status],
    queryFn: () => getHistory({ status: status === 'ALL' ? undefined : status, page: 1, pageSize: 50 }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.key}
            selected={status === f.key}
            onPress={() => setStatus(f.key)}
            style={styles.chip}
          >
            {f.label}
          </Chip>
        ))}
      </View>
      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={query.data?.data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 32, color: '#64748b' }}>No transactions yet</Text>
          }
          renderItem={({ item }) => (
            <Card style={styles.card} mode="elevated" onPress={() => router.push(`/transaction/${item.id}`)}>
              <Card.Content style={{ flexDirection: 'row', gap: 12 }}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: '#e2e8f0' }]} />
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.headerRow}>
                    <Text variant="titleMedium" style={{ flex: 1 }}>{item.actionType}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text variant="bodySmall" style={{ color: '#64748b' }}>
                    {item.username} • {new Date(item.createdAt).toLocaleString()}
                  </Text>
                  <Text variant="bodySmall" style={{ marginTop: 4 }}>
                    {item.items.length} items • Zoho: {item.zohoSyncStatus}
                  </Text>
                  {item.approvedByUsername ? (
                    <Text variant="bodySmall" style={{ color: '#64748b' }}>
                      {item.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {item.approvedByUsername}
                    </Text>
                  ) : null}
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  const colors: Record<TransactionStatus, string> = {
    PENDING: '#f59e0b',
    APPROVED: '#16a34a',
    REJECTED: '#dc2626',
  };
  return (
    <View style={[styles.badge, { backgroundColor: colors[status] + '20', borderColor: colors[status] }]}>
      <Text style={{ color: colors[status], fontWeight: '600', fontSize: 11 }}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', padding: 12, gap: 6, flexWrap: 'wrap' },
  chip: { marginRight: 4 },
  card: {
    marginBottom: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: palette.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
});
