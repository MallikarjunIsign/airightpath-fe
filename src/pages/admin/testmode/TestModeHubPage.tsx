import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Code2, MessageSquare, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { TestModeBanner } from '@/components/testmode/TestModeBanner';
import { TEST_MODE_GROUPS, testModesInGroup } from '@/config/test-mode';
import type { TestModeId } from '@/config/test-mode';

const MODE_ICON: Record<TestModeId, React.ReactNode> = {
  aptitude: <ClipboardList size={20} />,
  coding: <Code2 size={20} />,
  'interview-technical': <MessageSquare size={20} />,
  'interview-behavioral': <Users size={20} />,
};

/**
 * Landing page for Test Mode, and the fallback route for the sidebar submenu —
 * a collapsed rail cannot show the four children, so clicking the parent has to
 * arrive somewhere that lists them.
 */
export function TestModeHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Test Mode</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Walk through what a candidate sees — instructions, the proctoring check, the exam itself
          and the result screen — without assigning anything to anyone.
        </p>
      </div>

      <TestModeBanner title="Overview" />

      {TEST_MODE_GROUPS.map((group) => (
        <section key={group} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--textSecondary)]">
            {group}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {testModesInGroup(group).map((mode) => (
              <Link key={mode.id} to={mode.path} className="group block">
                <Card className="h-full transition-colors group-hover:border-[var(--primary)]">
                  <CardContent className="flex h-full items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 text-[var(--primary)]">
                      {MODE_ICON[mode.id]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text)]">{mode.label}</p>
                      <p className="mt-1 text-sm text-[var(--textSecondary)]">{mode.blurb}</p>
                    </div>
                    <ArrowRight
                      size={16}
                      className="mt-1 flex-shrink-0 text-[var(--textTertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]"
                    />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
