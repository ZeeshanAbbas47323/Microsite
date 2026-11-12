import { ContentPage, contentMetadata } from '@/storefront/pages';

export const revalidate = 60;
// Empty list: every store/page is rendered on first request, then cached (ISR) until revalidated.
export const generateStaticParams = () => [];
export const generateMetadata = contentMetadata;
export default ContentPage;
