import { ProductPage, productMetadata } from '@/storefront/pages';

export const revalidate = 60;
// Empty list: every store/page is rendered on first request, then cached (ISR) until revalidated.
export const generateStaticParams = () => [];
export const generateMetadata = productMetadata;
export default ProductPage;
