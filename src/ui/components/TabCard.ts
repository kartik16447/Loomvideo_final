// ScreenVault — TabCard — Generates DOM for a tab selection card

export function createTabCard(title: string, url: string, faviconUrl: string | undefined, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'tab-card';
  
  let domain = url;
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch(e) {}

  // Basic sanitization
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  btn.innerHTML = `
    ${faviconUrl ? `<img src="${faviconUrl}" class="tab-icon">` : `<div class="tab-icon" style="background:#333;"></div>`}
    <div class="tab-title">${safeTitle}</div>
    <div class="tab-domain">${domain}</div>
  `;
  
  btn.addEventListener('click', onClick);
  return btn;
}
