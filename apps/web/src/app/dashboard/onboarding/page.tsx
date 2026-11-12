import { OnboardingWizard } from '@/dashboard/OnboardingWizard';
import { serverEnv } from '@/lib/env';

export const metadata = { title: 'Create your store' };

export default function OnboardingPage() {
  return <OnboardingWizard rootDomain={serverEnv.rootDomain} />;
}
