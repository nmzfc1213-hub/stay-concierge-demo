import { initialLanguage } from './i18n.js';

let storage;
try { storage = localStorage; } catch { storage = null; }
let language = initialLanguage(location.search, storage, navigator.language);
const titles = Object.fromEntries([...document.querySelectorAll('h1[data-language]')]
  .map(element => [element.dataset.language, element.textContent]));

function render() {
  document.documentElement.lang = language;
  document.title = `${titles[language] || titles.ja} | ${language === 'ja' ? '館内案内' : 'Guest guide'}`;
  document.querySelectorAll('[data-language]').forEach(element => { element.hidden = element.dataset.language !== language; });
  document.querySelectorAll('[data-lang]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.lang === language));
  });
}

document.querySelectorAll('[data-lang]').forEach(button => {
  button.addEventListener('click', () => {
    language = button.dataset.lang;
    try { storage?.setItem('sc-language', language); } catch { /* optional language only */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', language);
    history.replaceState(null, '', url);
    render();
  });
});
render();
