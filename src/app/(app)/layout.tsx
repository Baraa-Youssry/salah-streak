import { AppNav } from '@/components/AppNav';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

/**
 * min-h-dvh: full viewport without mobile-toolbar jump.
 * main pb: content clears fixed bottom bar (56px + safe-area) on mobile;
 * md+ bottom bar hidden so pb is relaxed.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ServiceWorkerRegister />
      <AppNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-5 pb-[calc(72px+env(safe-area-inset-bottom))] sm:px-4 md:pt-6 md:pb-8">
        {children}
      </main>
    </div>
  );
}
