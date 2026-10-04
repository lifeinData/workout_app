import { forwardRef, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AlertCircle, Dumbbell, Eye, EyeOff } from "lucide-react-native";
import { useLogin } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { colors, elevation, radius, space, type } from "@/lib/theme";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.mark}>
            <Dumbbell size={26} color={colors.secondaryForeground} strokeWidth={2} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={styles.title} accessibilityRole="header">
            Welcome back
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>
            Sign in to pick up where you left off.
          </Text>
        </View>

        <View style={styles.form}>
          <AuthField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="your username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <AuthField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            trailing={
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={8}
                style={styles.reveal}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.mutedForeground} />
                ) : (
                  <Eye size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            }
          />

          {localError ? <ErrorNote message={localError} /> : null}

          <Button
            label="Sign in"
            onPress={onSubmit}
            loading={login.isPending}
            disabled={login.isPending}
            style={styles.submit}
          />
        </View>

        <Pressable
          onPress={() => router.push("/signup")}
          accessibilityRole="link"
          style={styles.linkBtn}
        >
          <Text maxFontSizeMultiplier={1.3} style={styles.linkText}>
            New here? <Text style={styles.linkTextStrong}>Create an account</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

interface AuthFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  trailing?: ReactNode;
}

/**
 * Filled input, no idle border; focus swaps in a 1.5dp `ring` outline
 * (DESIGN.md §3.1 field grammar). Border width is constant so focus never
 * shifts layout.
 */
const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, hint, trailing, onFocus, onBlur, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>
        {label}
      </Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TextInput
          ref={ref}
          {...inputProps}
          maxFontSizeMultiplier={1.3}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          style={styles.input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {trailing}
      </View>
      {hint ? (
        <Text maxFontSizeMultiplier={1.3} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <AlertCircle size={16} color={colors.destructive} />
      <Text maxFontSizeMultiplier={1.3} style={styles.errorText}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    paddingVertical: space.xxxl,
    gap: space.xxl,
  },
  header: { gap: space.sm },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  title: { ...type.display, color: colors.foreground },
  subtitle: { ...type.body, fontWeight: "400", color: colors.mutedForeground },
  form: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.lg,
    ...elevation.e1,
  },
  field: { gap: space.sm },
  label: { ...type.label, fontWeight: "600", color: colors.foreground },
  hint: { ...type.caption, color: colors.mutedForeground },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    backgroundColor: colors.inputBackground,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inputBackground,
    paddingHorizontal: space.md,
  },
  inputWrapFocused: { borderColor: colors.ring, backgroundColor: colors.card },
  input: {
    flex: 1,
    ...type.body,
    color: colors.foreground,
    paddingVertical: space.md,
  },
  reveal: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  errorText: { ...type.label, color: colors.secondaryForeground, flex: 1 },
  submit: { marginTop: space.xs, alignSelf: "stretch" },
  linkBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: { ...type.label, color: colors.mutedForeground },
  linkTextStrong: { fontWeight: "600", color: colors.foreground },
});
