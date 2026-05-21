import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Card, Searchbar, Text } from 'react-native-paper';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getCurrentInventory } from '@/services/inventory.api';

export default function CurrentInventoryScreen() {
  const [search, setSearch] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['inventory', search],
    queryFn: ({ pageParam = 1 }) => getCurrentInventory(search || undefined, pageParam, 20),
    getNextPageParam: (last, all) => {
      const fetched = all.reduce((acc, p) => acc + p.data.length, 0);
      return fetched < last.total ? all.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <View style={styles.root}>
      <Searchbar
        placeholder="Search SKU or product"
        value={search}
        onChangeText={setSearch}
        style={{ margin: 12 }}
      />
      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
          }
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 32, color: '#64748b' }}>
              No inventory items yet
            </Text>
          }
          renderItem={({ item }) => (
            <Card style={styles.card} mode="elevated">
              <Card.Content>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{item.sku}</Text>
                    <Text variant="bodySmall" style={{ color: '#64748b' }}>{item.productName}</Text>
                  </View>
                  <Text variant="headlineSmall" style={{ fontWeight: '700' }}>
                    {item.quantity}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
