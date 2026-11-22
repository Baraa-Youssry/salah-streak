import { AppNav } from '@/components/AppNav';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ServiceWorkerRegister />
      <AppNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">
        {children}
      </main>
    </div>
  );
}
