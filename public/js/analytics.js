// Google Analytics 4. Quebec's Law 25 wants tracking off by default, so the Google tag loads only after
// the visitor clicks "Accept" in the consent bar (consent.js). Choosing "Essential only" later stops it
// and removes its cookies. Ads features stay off either way.
import { hasConsent } from './consent.js';

export const GA_ID = 'G-P0GFWB3X3R';
let loaded = false;

window.dataLayer = window.dataLayer || [];
// The Google tag reads `arguments`, so this can't be an arrow function with rest parameters.
function gtag() { window.dataLayer.push(arguments); }

function start() {
  window[`ga-disable-${GA_ID}`] = false;
  if (loaded) {
    gtag('consent', 'update', { analytics_storage: 'granted' });
    return;
  }
  loaded = true;
  gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date());
  gtag('config', GA_ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.append(s);
}

function stop() {
  window[`ga-disable-${GA_ID}`] = true;
  if (loaded) gtag('consent', 'update', { analytics_storage: 'denied' });
  // Google sets _ga and _ga_<id> on the widest domain it can, so try each level of the host name.
  const names = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n.startsWith('_ga'));
  const labels = location.hostname.split('.');
  const domains = ['', ...labels.slice(0, -1).map((_, i) => `; domain=.${labels.slice(i).join('.')}`)];
  for (const name of names) for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d}`;
}

/** A page view after site.js shows the other page in place of this one (the title and address have changed). */
export function trackPageView() {
  if (loaded && hasConsent('optional')) gtag('event', 'page_view', { page_title: document.title, page_location: location.href });
}

if (hasConsent('optional')) start();
window.addEventListener('consentchange', () => (hasConsent('optional') ? start() : stop()));
