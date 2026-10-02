export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return <div className="state-card" role="status"><span className="spinner" />{label}</div>;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-card error-state" role="alert">
      <p>{message}</p>
      {onRetry && <button type="button" className="secondary-button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description }) {
  return (
    <div className="state-card empty-state">
      <strong>{title}</strong>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPageChange, isLoading = false }) {
  const pages = Math.max(totalPages, 1);
  return (
    <footer className="pagination-bar">
      <span className="muted">{total} result(s) · Page {page} of {pages}</span>
      <div>
        <button type="button" className="secondary-button" disabled={page <= 1 || isLoading} onClick={() => onPageChange(page - 1)}>Previous</button>
        <button type="button" className="secondary-button" disabled={page >= pages || isLoading} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </footer>
  );
}

export function StatusBadge({ children }) {
  const modifier = String(children).toLowerCase().replaceAll('_', '-');
  return <span className={`status-badge status-${modifier}`}>{String(children).replaceAll('_', ' ')}</span>;
}
