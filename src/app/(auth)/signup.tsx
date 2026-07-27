import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useSignup } from "@/lib/queries";
import { ApiError } from "@/lib/api";

export default function SignupScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [initials, setInitials] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const signup = useSignup();

  const onSubmit = () => {
    setLocalError(null);
    const trimmedUsername = username.trim();
    const trimmedDisplay = displayName.trim();
    const trimmedInitials = initials.trim().toUpperCase();

    if (!trimmedUsername) {
      setLocalError("Username is required.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (trimmedInitials && trimmedInitials.length > 4) {
      setLocalError("Initials must be 4 characters or fewer.");
      return;
    }

    const body = {
      username: trimmedUsername,
      password,
      display_name: trimmedDisplay || null,
      initials: trimmedInitials || null,
    };

    signup.mutate(body, {
      onSuccess: () => router.replace("/"),
      onError: (err) => {
        if (err instanceof ApiError) {
          if (err.status === 409) {
            setLocalError("That username is taken. Try another.");
          } else if (err.status === 422) {
            setLocalError("Please check the form and try again.");
          } else {
            setLocalError("Something went wrong. Please try again.");
          }
        } else {
          setLocalError("Something went wrong. Please try again.");
        }
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Track lifts, hit PRs, build streaks.
          </Text>
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
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="at least 8 characters"
            placeholderTextColor="#8b7268"
            secureTextEntry
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Display name (optional)</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="What should we call you?"
            placeholderTextColor="#8b7268"
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Initials (optional)</Text>
          <TextInput
            value={initials}
            onChangeText={setInitials}
            placeholder="JD"
            placeholderTextColor="#8b7268"
            autoCapitalize="characters"
            maxLength={4}
            style={styles.input}
          />
        </View>

        {localError ? <Text style={styles.error}>{localError}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={signup.isPending}
          style={({ pressed }) => [
            styles.submit,
            signup.isPending && styles.submitDisabled,
            pressed && !signup.isPending && styles.submitPressed,
          ]}
        >
          {signup.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>Create account</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>
            Already have an account?{" "}
            <Text style={styles.linkTextBold}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6f0" },
  content: { padding: 24, paddingTop: 48, gap: 16 },
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
