import { AccountPage, systemMetadata } from '@/storefront/pages';

export const revalidate = 60;
// The page shell is cached like other system pages; account data is loaded in the browser.
export const generateStaticParams = () => [];
export const generateMetadata = systemMetadata('My account');
export default AccountPage;
