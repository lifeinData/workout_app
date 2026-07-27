import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useLogin } from "@/lib/queries";
import { ApiError } from "@/lib/api";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const login = useLogin();

  const onSubmit = () => {
    setLocalError(null);
    const trimmed = username.trim();
    if (!trimmed || !password) {
      setLocalError("Username and password are required.");
      return;
    }
    login.mutate(
      { username: trimmed, password },
      {
        onSuccess: () => router.replace("/"),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            setLocalError("Invalid username or password.");
          } else {
            setLocalError("Something went wrong. Please try again.");
          }
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Welcome back. Let's get moving.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            placeholderTextColor="#8b7268"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={onSubmit}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#8b7268"
            secureTextEntry
            style={styles.input}
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        </View>

        {localError ? <Text style={styles.error}>{localError}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={login.isPending}
          style={({ pressed }) => [
            styles.submit,
            login.isPending && styles.submitDisabled,
            pressed && !login.isPending && styles.submitPressed,
          ]}
        >
          {login.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/signup")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>
            Don't have an account?{" "}
            <Text style={styles.linkTextBold}>Create one</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6f0" },
  content: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  header: { marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "700", color: "#3d2b26" },
  subtitle: { fontSize: 14, color: "#8b7268", marginTop: 4 },
  field: { gap: 6 },
  label: {
    fontSize: 12,
    color: "#8b7268",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#fdf6f0",
    borderWidth: 1,
    borderColor: "#f0d9ce",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#3d2b26",
  },
  error: { color: "#d96a5a", fontSize: 13 },
  submit: {
    backgroundColor: "#e87d6f",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitPressed: { opacity: 0.85 },
  submitText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: "#8b7268", fontSize: 14 },
  linkTextBold: { color: "#e87d6f", fontWeight: "600" },
});
