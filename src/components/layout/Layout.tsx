import { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { Logo } from '@/components/ui/Logo';
import { ENV } from '@/config/env';

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const environment = ENV.IS_DEV ? 'dev' : 'prod';

  return (
    <div className="layout-canvas min-h-screen">
      {/* Ambient background glow — subtle depth across the canvas */}
      <div className="layout-ambient" aria-hidden="true" />

      {/* Sidebar — navigation surface, seamlessly connected */}
      <Sidebar environment={environment} />

      {/* Navbar — floating, transparent, part of the same visual system */}
      <Navbar />

      {/* Main content — fluid, spacious, continuous with the canvas */}
      <main
        className="layout-content"
        style={{
          marginLeft: 'var(--sidebar-width, 240px)',
        }}
      >
        <div className="max-w-[1400px] mx-auto animate-fade-in-up">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
}

export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="layout-canvas min-h-screen">
      <div className="layout-ambient" aria-hidden="true" />

      <header className="navbar-surface fixed top-0 left-0 right-0 h-14 z-navbar">
        <div className="h-full px-6 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center">
            <Logo className="h-9 w-auto" />
          </div>
        </div>
      </header>

      <main className="pt-14">
        {children || <Outlet />}
      </main>
    </div>
  );
}
