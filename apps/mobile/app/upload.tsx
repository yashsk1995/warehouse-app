import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View, Alert, Pressable } from 'react-native';
import { ActivityIndicator, Button, Card, Text, IconButton, Menu, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getWarehouses, uploadSheet } from '@/services/inventory.api';
import { palette } from '@/theme/theme';
import type { ActionType } from '@warehouse/types';

export default function UploadScreen() {
  const params = useLocalSearchParams<{ actionType?: string }>();
  const actionType: ActionType = params.actionType === 'REMOVE' ? 'REMOVE' : 'ADD';
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [warehouseMenuOpen, setWarehouseMenuOpen] = useState(false);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: getWarehouses,
    staleTime: 5 * 60 * 1000, // 5 min — list rarely changes
  });

  const selectedWarehouse = warehousesQuery.data?.find((w) => w.id === warehouseId) ?? null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!imageUri) throw new Error('No image selected');
      if (!warehouseId) throw new Error('No warehouse selected');
      return uploadSheet({ uri: imageUri, actionType, warehouseId });
    },
    onSuccess: (txn) => {
      router.replace(`/transaction/${txn.id}`);
    },
    onError: (e: any) => {
      const status = e?.response?.status;
      const body = e?.response?.data;
      if (status === 422) {
        const msg = body?.message ?? 'No items detected';
        const ocr = body?.rawOcrText ? `\n\nWhat we read:\n${body.rawOcrText}` : '';
        Alert.alert('Could not read sheet', `${msg}${ocr}`);
        return;
      }
      Alert.alert('Upload failed', body?.message ?? e?.message ?? 'Unknown error');
    },
  });

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      base64: false,
      allowsEditing: false,
    });
    if (!res.canceled) await compressAndSet(res.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!res.canceled) await compressAndSet(res.assets[0].uri);
  };

  async function compressAndSet(uri: string) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 2000 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    setImageUri(result.uri);
  }

  const canUpload = !!imageUri && !!warehouseId && !mutation.isPending;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => router.back()} />
        <Text variant="titleLarge" style={{ fontWeight: '700' }}>
          {actionType === 'ADD' ? 'Add Inventory' : 'Remove Inventory'}
        </Text>
      </View>

      {/* Warehouse selector — required */}
      <Text style={styles.fieldLabel}>
        Warehouse <Text style={{ color: palette.danger }}>*</Text>
      </Text>
      <Menu
        visible={warehouseMenuOpen}
        onDismiss={() => setWarehouseMenuOpen(false)}
        anchor={
          <Pressable onPress={() => setWarehouseMenuOpen(true)} style={styles.dropdown}>
            <Text style={{ color: selectedWarehouse ? palette.text : palette.textMuted, flex: 1 }}>
              {warehousesQuery.isLoading
                ? 'Loading warehouses…'
                : selectedWarehouse
                  ? selectedWarehouse.name
                  : 'Select a warehouse'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={palette.textMuted} />
          </Pressable>
        }
        contentStyle={{ backgroundColor: palette.surface, maxHeight: 360 }}
      >
        {warehousesQuery.data?.length ? (
          warehousesQuery.data.map((w) => (
            <Menu.Item
              key={w.id}
              title={w.name + (w.isPrimary ? '  (primary)' : '')}
              leadingIcon={w.id === warehouseId ? 'check' : undefined}
              onPress={() => {
                setWarehouseId(w.id);
                setWarehouseMenuOpen(false);
              }}
            />
          ))
        ) : (
          <Menu.Item title="No warehouses available — run a Zoho sync" disabled />
        )}
      </Menu>
      {warehousesQuery.error ? (
        <Text style={styles.errText}>
          Couldn&apos;t load warehouses. Pull-to-refresh or check connection.
        </Text>
      ) : null}

      <Divider style={{ marginVertical: 16 }} />

      <Card mode="elevated" style={{ marginBottom: 16 }}>
        <Card.Content>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <Text style={{ textAlign: 'center', color: palette.textMuted, paddingVertical: 32 }}>
              Capture or pick a photo of the handwritten sheet.
            </Text>
          )}
        </Card.Content>
      </Card>

      <View style={styles.actions}>
        <Button mode="contained-tonal" icon="camera" onPress={pickFromCamera} style={styles.actionBtn}>
          Camera
        </Button>
        <Button mode="contained-tonal" icon="image" onPress={pickFromGallery} style={styles.actionBtn}>
          Gallery
        </Button>
      </View>

      <Button
        mode="contained"
        icon="upload"
        disabled={!canUpload}
        onPress={() => mutation.mutate()}
        contentStyle={{ paddingVertical: 8 }}
        style={{ marginTop: 16 }}
      >
        {mutation.isPending
          ? 'Reading inventory sheet…'
          : !warehouseId
            ? 'Select a warehouse to continue'
            : !imageUri
              ? 'Capture or pick a photo'
              : 'Upload & Parse'}
      </Button>

      {mutation.isPending ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: palette.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  preview: { width: '100%', height: 360 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1 },
  fieldLabel: { color: palette.textMuted, fontSize: 12, marginBottom: 6, marginLeft: 4 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    backgroundColor: palette.surface,
  },
  errText: { color: palette.danger, fontSize: 12, marginTop: 6 },
});
