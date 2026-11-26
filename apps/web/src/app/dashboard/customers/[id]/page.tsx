import { notFound } from 'next/navigation';
import { CustomerProfile } from '@/dashboard/customers/CustomerProfile';

export const metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <CustomerProfile customerId={id} />;
}
