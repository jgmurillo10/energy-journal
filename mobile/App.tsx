import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DashboardScreen from './src/DashboardScreen';
import OnboardingScreen from './src/OnboardingScreen';
import SettingsScreen from './src/SettingsScreen';
import { getProfile, type Profile } from './src/api';

type Screen = 'journal' | 'settings';

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<Screen>('journal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { profile: loaded } = await getProfile();
      setProfile(loaded);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the journal');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LinearGradient colors={['#05070d', '#0b1220', '#05070d']} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.root}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#34d399" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : !profile ? (
          <OnboardingScreen onDone={setProfile} />
        ) : screen === 'settings' ? (
          <SettingsScreen
            profile={profile}
            onProfile={setProfile}
            onClose={() => setScreen('journal')}
            onRedo={() => {
              setProfile(null);
              setScreen('journal');
            }}
            onSwitchedJournal={() => {
              setScreen('journal');
              void load();
            }}
          />
        ) : (
          <DashboardScreen profile={profile} onOpenSettings={() => setScreen('settings')} />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#fb7185', textAlign: 'center' },
});
