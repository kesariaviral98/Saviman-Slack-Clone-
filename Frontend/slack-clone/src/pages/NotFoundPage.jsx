import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-raised">
      <div className="text-center px-6">
        <div className="text-8xl font-bold text-sidebar-bg mb-4 select-none">404</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Page not found</h1>
        <p className="text-gray-500 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/workspaces"
          className="inline-block bg-sidebar-bg hover:bg-sidebar-hover text-white font-medium px-6 py-2.5 rounded transition-colors"
        >
          Go to your workspaces
        </Link>
      </div>
    </div>
  );
}
