import { Suspense } from 'react';
import SignInForm from './SignInForm';

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
