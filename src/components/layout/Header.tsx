'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, BookOpen, Brain, GraduationCap, Star, AlertCircle, Home, Info } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/question-bank', label: '题库', icon: BookOpen },
  { href: '/quiz', label: '刷题', icon: Brain },
  { href: '/study', label: '背题', icon: GraduationCap },
  { href: '/favorites', label: '收藏', icon: Star },
  { href: '/wrong-answers', label: '错题', icon: AlertCircle },
  { href: '/about', label: '关于我们', icon: Info },
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-surface-primary/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-accent tracking-tight shrink-0">
          Zpdf-Choose
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                pathname === href || (href !== '/' && pathname.startsWith(href))
                  ? 'bg-accent/10 text-accent'
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-tertiary'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="md:hidden p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="菜单"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-surface-primary/95 backdrop-blur-xl">
          <div className="px-4 py-2 space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-accent/10 text-accent'
                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-tertiary'
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
