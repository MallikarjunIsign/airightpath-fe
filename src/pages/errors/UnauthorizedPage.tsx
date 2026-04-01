import { Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';

export function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md animate-fade-in-up">
        <div className="w-20 h-20 bg-[var(--warningLight)] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Lock size={36} className="text-[var(--warning)]" />
        </div>
        <h1 className="text-5xl font-bold gradient-text mb-2 font-heading">401</h1>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2 font-heading">Unauthorized</h2>
        <p className="text-[var(--textSecondary)] mb-8">
          Please log in to access this page.
        </p>
        <Link to={ROUTES.PUBLIC.LOGIN}>
          <Button variant="primary" size="lg" leftIcon={<ArrowLeft size={18} />}>
            Go to Login
          </Button>
        </Link>
      </div>
    </div>
  );
}
