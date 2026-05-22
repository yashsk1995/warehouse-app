import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View, Alert } from 'react-native';
import { ActivityIndicator, Button, Card, Text, IconButton } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMutation } from '@tanstack/react-query';
import { uploadSheet } from '@/services/inventory.api';
import type { ActionType } from '@warehouse/types';

export default function UploadScreen() {
  const params = useLocalSearchParams<{ actionType?: string }>();
  const actionType: ActionType = params.actionType === 'REMOVE' ? 'REMOVE' : 'ADD';
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!imageUri) throw new Error('No image selected');
      return uploadSheet({ uri: imageUri, actionType });
    },
    onSuccess: (txn) => {
      router.replace(`/transaction/${txn.id}`);
    },
    onError: (e: any) => {
      const status = e?.response?.status;
      const body = e?.response?.data;
      // 422 = parser returned no items — friendly user-facing message
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => router.back()} />
        <Text variant="titleLarge" style={{ fontWeight: '700' }}>
          {actionType === 'ADD' ? 'Add Inventory' : 'Remove Inventory'}
        </Text>
      </View>

      <Card mode="elevated" style={{ marginBottom: 16 }}>
        <Card.Content>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <Text style={{ textAlign: 'center', color: '#64748b', paddingVertical: 32 }}>
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
        disabled={!imageUri || mutation.isPending}
        onPress={() => mutation.mutate()}
        contentStyle={{ paddingVertical: 8 }}
        style={{ marginTop: 16 }}
      >
        {mutation.isPending ? 'Reading inventory sheet…' : 'Upload & Parse'}
      </Button>

      {mutation.isPending ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  preview: { width: '100%', height: 360 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1 },
});
