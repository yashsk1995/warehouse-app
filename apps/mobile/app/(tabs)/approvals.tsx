import { FlatList, Image, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getHistory } from '@/services/inventory.api';

export default function ApprovalsScreen() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['history', 'PENDING'],
    queryFn: () => getHistory({ status: 'PENDING', page: 1, pageSize: 100 }),
  });

  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 32 }} />;

  return (
    <FlatList
      data={query.data?.data ?? []}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: 12 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      ListHeaderComponent={
        <Text variant="titleMedium" style={{ marginBottom: 12 }}>
          Pending Approvals ({query.data?.total ?? 0})
        </Text>
      }
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', marginTop: 32, color: '#64748b' }}>Nothing pending — all caught up.</Text>
      }
      renderItem={({ item }) => (
        <Card style={styles.card} mode="elevated" onPress={() => router.push(`/transaction/${item.id}`)}>
          <Card.Content style={{ flexDirection: 'row', gap: 12 }}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} /> : null}
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium">{item.actionType}</Text>
              <Text variant="bodySmall" style={{ color: '#64748b' }}>
                {item.username} • {new Date(item.createdAt).toLocaleString()}
              </Text>
              <Text variant="bodySmall" style={{ marginTop: 4 }}>
                {item.items.length} item(s) awaiting review
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 10 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f1f5f9' },
});
