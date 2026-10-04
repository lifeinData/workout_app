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
import { useSignup } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { colors, elevation, radius, space, type } from "@/lib/theme";

export default function SignupScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [initials, setInitials] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const initialsRef = useRef<TextInput>(null);
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
      onSuccess: () => router.replace("/training"),
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
          <View style={styles.mark}>
            <Dumbbell size={26} color={colors.secondaryForeground} strokeWidth={2} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={styles.title} accessibilityRole="header">
            Create your account
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>
            Track lifts, hit PRs, build streaks.
          </Text>
        </View>

        <View style={styles.form}>
          <AuthField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="pick a username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <AuthField
            ref={passwordRef}
            label="Password"
            hint="At least 8 characters."
            value={password}
            onChangeText={setPassword}
            placeholder="create a password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => displayNameRef.current?.focus()}
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

          <View style={styles.divider} />

          <View style={styles.optionalHeader}>
            <Text maxFontSizeMultiplier={1.3} style={styles.optionalTitle}>
              Profile
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.hint}>
              Optional. You can skip this.
            </Text>
          </View>

          <View style={styles.row}>
            <View style={styles.rowGrow}>
              <AuthField
                ref={displayNameRef}
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="What should we call you?"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => initialsRef.current?.focus()}
              />
            </View>
            <View style={styles.rowFixed}>
              <AuthField
                ref={initialsRef}
                label="Initials"
                value={initials}
                onChangeText={setInitials}
                placeholder="JD"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={4}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
            </View>
          </View>

          {localError ? <ErrorNote message={localError} /> : null}

          <Button
            label="Create account"
            onPress={onSubmit}
            loading={signup.isPending}
            disabled={signup.isPending}
            style={styles.submit}
          />
        </View>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="link"
          style={styles.linkBtn}
        >
          <Text maxFontSizeMultiplier={1.3} style={styles.linkText}>
            Already have an account? <Text style={styles.linkTextStrong}>Sign in</Text>
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
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  optionalHeader: { gap: space.xs },
  optionalTitle: { ...type.heading, color: colors.foreground },
  row: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  rowGrow: { flex: 1 },
  rowFixed: { width: 96 },
});
