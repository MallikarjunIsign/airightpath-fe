import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-bold text-[var(--primary)] mb-4">404</h1>
        <h2 className="text-2xl font-bold text-[var(--text)] mb-2">Page Not Found</h2>
        <p className="text-[var(--textSecondary)] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to={ROUTES.PUBLIC.HOME}>
          <Button variant="primary" size="lg">
            <Home size={18} className="mr-2" /> Go Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
