export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400 sm:text-3xl">
            Salah Streak
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track the five daily prayers with friends
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
