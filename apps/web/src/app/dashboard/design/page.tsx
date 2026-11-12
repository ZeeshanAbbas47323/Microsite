import { Suspense } from 'react';
import { DesignEditor } from '@/dashboard/DesignEditor';

export const metadata = { title: 'Design' };

export default function DesignPage() {
  return (
    <Suspense>
      <DesignEditor />
    </Suspense>
  );
}
