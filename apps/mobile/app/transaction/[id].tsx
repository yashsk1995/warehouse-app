import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  IconButton,
  Text,
  TextInput,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveTransaction,
  getTransaction,
  rejectTransaction,
} from '@/services/inventory.api';
import { useIsAdmin } from '@/store/auth.store';

export default function TransactionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => getTransaction(String(id)),
    enabled: !!id,
  });

  const [editedQty, setEditedQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (query.data) {
      const initial: Record<string, number> = {};
      for (const it of query.data.items) initial[it.sku] = it.quantityApproved;
      setEditedQty(initial);
    }
  }, [query.data]);

  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const approveMut = useMutation({
    mutationFn: () => {
      const items = Object.entries(editedQty).map(([sku, qty]) => ({
        sku,
        quantityApproved: Number.isFinite(qty) ? qty : 0,
      }));
      console.log('[APPROVE] sending', { id, items, note: note?.trim() || undefined });
      return approveTransaction(String(id), items, note.trim() || undefined);
    },
    onSuccess: (data) => {
      console.log('[APPROVE] success', data?.status, data?.zohoSyncStatus);
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transaction', id] });
      setBanner({ kind: 'success', text: 'Approved. Inventory updated, Zoho sync queued.' });
      // Defer navigation so banner is visible and any render of refreshed data settles first
      setTimeout(() => router.back(), 800);
    },
    onError: (e: any) => {
      const status = e?.response?.status;
      const body = e?.response?.data;
      const detail = `status: ${status ?? 'n/a'}\nmessage: ${body?.message ?? e?.message ?? 'unknown'}\nbody: ${
        body ? JSON.stringify(body).slice(0, 300) : 'n/a'
      }`;
      console.log('[APPROVE] error', detail);
      setBanner({ kind: 'error', text: 'Approve failed.\n' + detail });
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectTransaction(String(id), note.trim() || 'Rejected by admin'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['transaction', id] });
      setBanner({ kind: 'success', text: 'Rejected.' });
      setTimeout(() => router.back(), 800);
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.message ?? e?.message ?? 'unknown';
      setBanner({ kind: 'error', text: 'Reject failed: ' + detail });
    },
  });

  if (query.isLoading || !query.data) return <ActivityIndicator style={{ marginTop: 32 }} />;
  const tx = query.data;
  const canActOnIt = isAdmin && tx.status === 'PENDING';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => router.back()} />
        <Text variant="titleLarge" style={{ fontWeight: '700' }}>
          {tx.actionType} • {tx.status}
        </Text>
      </View>

      {tx.imageUrl ? <Image source={{ uri: tx.imageUrl }} style={styles.image} resizeMode="contain" /> : null}

      <Card style={{ marginTop: 12 }} mode="outlined">
        <Card.Content>
          {tx.warehouseName ? (
            <>
              <Text variant="labelSmall" style={{ color: '#64748b' }}>Warehouse</Text>
              <Text style={{ fontWeight: '600' }}>{tx.warehouseName}</Text>
              <Divider style={styles.divider} />
            </>
          ) : null}
          <Text variant="labelSmall" style={{ color: '#64748b' }}>Uploaded</Text>
          <Text>
            {tx.username} • {new Date(tx.createdAt).toLocaleString()}
          </Text>
          {tx.approvedByUsername ? (
            <>
              <Divider style={styles.divider} />
              <Text variant="labelSmall" style={{ color: '#64748b' }}>
                {tx.status === 'APPROVED' ? 'Approved by' : 'Rejected by'}
              </Text>
              <Text>
                {tx.approvedByUsername} • {tx.approvedAt ? new Date(tx.approvedAt).toLocaleString() : ''}
              </Text>
            </>
          ) : null}
          <Divider style={styles.divider} />
          <Text variant="labelSmall" style={{ color: '#64748b' }}>Zoho sync</Text>
          <Text>
            {tx.zohoSyncStatus}
            {tx.zohoSyncError ? `  —  ${tx.zohoSyncError}` : ''}
          </Text>
        </Card.Content>
      </Card>

      <Text variant="titleMedium" style={styles.sectionTitle}>Parsed items</Text>
      {tx.items.map((it) => {
        const delta = editedQty[it.sku] ?? it.quantityApproved;
        const isAdd = tx.actionType === 'ADD';
        const computedAfter = isAdd ? it.quantityBefore + delta : it.quantityBefore - delta;
        const deltaColor = isAdd ? '#16a34a' : '#dc2626';
        return (
          <Card key={it.id} style={styles.itemCard} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={{ fontWeight: '700' }}>{it.sku}</Text>
              {it.productName ? (
                <Text variant="bodySmall" style={{ color: '#64748b', marginTop: 2 }}>{it.productName}</Text>
              ) : null}
              <View style={styles.qtyRow}>
                <View style={styles.qtyCell}>
                  <Text style={styles.qtyLabel}>BEFORE</Text>
                  <Text style={styles.qtyValue}>{it.quantityBefore}</Text>
                </View>
                <Text style={styles.qtyArrow}>{isAdd ? '+' : '−'}</Text>
                <View style={styles.qtyCell}>
                  <Text style={[styles.qtyLabel, { color: deltaColor }]}>
                    {isAdd ? 'ADDING' : 'REMOVING'}
                  </Text>
                  {canActOnIt ? (
                    <TextInput
                      keyboardType="number-pad"
                      value={String(delta)}
                      mode="outlined"
                      dense
                      onChangeText={(v) =>
                        setEditedQty((s) => ({ ...s, [it.sku]: Math.max(0, parseInt(v || '0', 10) || 0) }))
                      }
                      style={styles.qtyInput}
                      contentStyle={styles.qtyInputContent}
                      outlineColor={deltaColor}
                      activeOutlineColor={deltaColor}
                    />
                  ) : (
                    <Text style={[styles.qtyValue, { color: deltaColor }]}>{delta}</Text>
                  )}
                </View>
                <Text style={styles.qtyArrow}>=</Text>
                <View style={styles.qtyCell}>
                  <Text style={styles.qtyLabel}>AFTER</Text>
                  <Text style={[styles.qtyValue, styles.qtyAfter]}>{computedAfter}</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        );
      })}

      {tx.rawOcrText ? (
        <Card style={{ marginTop: 16 }} mode="outlined">
          <Card.Content>
            <Text variant="labelSmall" style={{ color: '#64748b' }}>Raw OCR</Text>
            <Text style={{ fontFamily: 'monospace', marginTop: 4 }}>{tx.rawOcrText}</Text>
          </Card.Content>
        </Card>
      ) : null}

      {tx.comments.length ? (
        <>
          <Text variant="titleMedium" style={styles.sectionTitle}>Timeline</Text>
          {tx.comments.map((c) => (
            <Card key={c.id} style={styles.itemCard} mode="outlined">
              <Card.Content>
                <Text variant="labelSmall" style={{ color: '#64748b' }}>
                  {c.username} • {new Date(c.createdAt).toLocaleString()}
                </Text>
                <Text>{c.comment}</Text>
              </Card.Content>
            </Card>
          ))}
        </>
      ) : null}

      {canActOnIt ? (
        <>
          <TextInput
            label="Note (optional)"
            mode="outlined"
            multiline
            value={note}
            onChangeText={setNote}
            style={{ marginTop: 16 }}
          />
          {banner ? (
            <View
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: banner.kind === 'success' ? '#dcfce7' : '#fee2e2',
                borderColor: banner.kind === 'success' ? '#16a34a' : '#dc2626',
              }}
            >
              <Text
                selectable
                style={{ color: banner.kind === 'success' ? '#166534' : '#991b1b', fontSize: 12 }}
              >
                {banner.text}
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              icon="close"
              onPress={() => {
                setBanner(null);
                rejectMut.mutate();
              }}
              loading={rejectMut.isPending}
              disabled={rejectMut.isPending || approveMut.isPending}
              style={styles.actionBtn}
              textColor="#dc2626"
            >
              Reject
            </Button>
            <Button
              mode="contained"
              icon="check"
              onPress={() => {
                setBanner(null);
                approveMut.mutate();
              }}
              loading={approveMut.isPending}
              disabled={approveMut.isPending || rejectMut.isPending}
              style={styles.actionBtn}
            >
              Approve
            </Button>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 64 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  image: { width: '100%', height: 320, backgroundColor: '#f1f5f9', borderRadius: 8 },
  divider: { marginVertical: 8 },
  sectionTitle: { marginTop: 20, marginBottom: 8, fontWeight: '700' },
  itemCard: { marginBottom: 8 },
  qtyRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
  qtyCell: { alignItems: 'center', flex: 1 },
  qtyLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, color: '#64748b', marginBottom: 4 },
  qtyValue: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  qtyAfter: { color: '#1d4ed8' },
  qtyArrow: { fontSize: 18, fontWeight: '600', color: '#94a3b8', paddingHorizontal: 4, marginTop: 14 },
  qtyInput: { width: 72, height: 40, backgroundColor: '#fff' },
  qtyInputContent: { textAlign: 'center', fontSize: 18, fontWeight: '700', paddingHorizontal: 0 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: { flex: 1 },
});
