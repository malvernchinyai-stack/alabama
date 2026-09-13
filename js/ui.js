// ui.js — shared modal / confirm dialog helpers

export function openModal({ title, bodyHtml, footerHtml, onMount, centered = false, id = 'app-modal' }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop' + (centered ? ' centered' : '');
  backdrop.id = id;
  backdrop.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close" data-close-modal>&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector('[data-close-modal]').addEventListener('click', closeModal);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(backdrop);
  return backdrop;
}

export function closeModal() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.style.overflow = '';
}

export function confirmDialog(message, { confirmText = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    openModal({
      id: 'confirm-modal',
      centered: true,
      title: 'Please confirm',
      bodyHtml: `<p style="font-size:14.5px;color:var(--color-text);margin:0 0 4px;">${message}</p>`,
      footerHtml: `
        <button class="btn btn-outline btn-block" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'btn-danger-outline' : 'btn-primary'} btn-block" data-confirm>${confirmText}</button>
      `,
      onMount: (el) => {
        el.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(false); });
        el.querySelector('[data-confirm]').addEventListener('click', () => { closeModal(); resolve(true); });
      },
    });
  });
}
