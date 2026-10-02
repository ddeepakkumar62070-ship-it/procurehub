export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  isBusy = false,
  onCancel,
  onConfirm,
  destructive = false,
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isBusy) onCancel();
    }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <div>{children}</div>
        <footer>
          <button type="button" className="secondary-button" onClick={onCancel} disabled={isBusy}>Cancel</button>
          <button
            type="button"
            className={destructive ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
