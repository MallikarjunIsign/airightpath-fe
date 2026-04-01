import { Link } from 'react-router-dom';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';

export function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md animate-fade-in-up">
        <div className="w-20 h-20 bg-[var(--errorLight)] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
          <ShieldOff size={36} className="text-[var(--error)]" />
        </div>
        <h1 className="text-5xl font-bold gradient-text mb-2 font-heading">403</h1>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2 font-heading">Access Forbidden</h2>
        <p className="text-[var(--textSecondary)] mb-8">
          You don't have permission to access this page. Contact your administrator if you believe this is an error.
        </p>
        <Link to={ROUTES.PUBLIC.HOME}>
          <Button variant="primary" size="lg" leftIcon={<ArrowLeft size={18} />}>
            Go Back
          </Button>
        </Link>
      </div>
    </div>
  );
}
