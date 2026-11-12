import { SettingsForm } from '@/dashboard/SettingsForm';
import { serverEnv } from '@/lib/env';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <SettingsForm rootDomain={serverEnv.rootDomain} />;
}
