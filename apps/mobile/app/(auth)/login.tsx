import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { login } from '@/services/auth.api';
import { useAuthStore } from '@/store/auth.store';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);

  const setTokens = useAuthStore((s) => s.setTokens);
  const mutation = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: async (res) => {
      await setTokens(res.accessToken, res.refreshToken, res.user);
      router.replace('/(tabs)');
    },
    onError: (e: any) => {
      setError(e?.response?.data?.message ?? 'Login failed');
    },
  });

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text variant="headlineMedium" style={styles.title}>
          Warehouse Inventory
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Sign in to upload or approve inventory sheets.
        </Text>
        <TextInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          mode="outlined"
          style={styles.input}
        />
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
        <Button
          mode="contained"
          loading={mutation.isPending}
          disabled={mutation.isPending || !username || !password}
          onPress={() => mutation.mutate()}
          contentStyle={{ paddingVertical: 6 }}
        >
          Sign In
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0f172a' },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 16 },
  title: { textAlign: 'center', marginBottom: 4, fontWeight: '700' },
  subtitle: { textAlign: 'center', marginBottom: 24, color: '#475569' },
  input: { marginBottom: 12 },
});
