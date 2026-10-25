// The ✕ on the Terms and Privacy pages: back to the page the reader came from. Without this script
// (or when the reader came from another site) it is a plain link to the home page.
const close = document.querySelector('[data-legal-close]');

close?.addEventListener('click', (e) => {
  if (!document.referrer || new URL(document.referrer).origin !== location.origin) return;
  e.preventDefault();
  if (history.length > 1) {
    history.back();
    return;
  }
  // Opened in a new tab (the links in the sign-in window): close it. If the browser refuses, go home.
  window.close();
  setTimeout(() => location.assign(close.href), 300);
});
