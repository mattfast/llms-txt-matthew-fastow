import { Logo } from "@/components/Logo";
import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="px-6 py-5">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 -mt-10">
        <div className="card w-full max-w-sm p-7 animate-fade-slide-up">
          <h1 className="text-xl font-semibold tracking-tight mb-1">{title}</h1>
          <p className="text-foreground-muted text-sm mb-6">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
