const sanitizeHtmlLib = require('sanitize-html');

// Sanitasi konten kaya (Quill editor) untuk mencegah XSS tersimpan.
// Hanya tag & atribut yang aman yang diizinkan.
const RICH_TEXT_OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'img', 'span', 'div', 'sub', 'sup',
    'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['class', 'style'],
    p: ['class', 'style'],
    div: ['class', 'style'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    '*': ['class']
  },
  // Hanya skema URL aman. javascript:, vbscript:, dan data: ditolak.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer nofollow' })
  }
};

function sanitizeRichText(value) {
  if (value === undefined || value === null) return value;
  return sanitizeHtmlLib(String(value), RICH_TEXT_OPTIONS);
}

// Untuk kolom teks biasa: buang seluruh tag HTML.
function sanitizePlainText(value) {
  if (value === undefined || value === null) return value;
  return sanitizeHtmlLib(String(value), { allowedTags: [], allowedAttributes: {} });
}

// Validasi URL agar hanya mengizinkan path internal (/...) atau protokol aman (http/https/mailto/tel/#)
function sanitizeUrl(value, fallback = '#') {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed === '#' || trimmed.startsWith('#') || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    // bukan URL valid
  }
  return fallback;
}

// Validasi khusus embed Google Maps (mencegah injeksi URL iframe berbahaya)
function sanitizeMapsEmbedUrl(value) {
  const defaultEmbed = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15777.30064560731!2d115.235!3d-8.625!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2dd23f81e36f98ef%3A0x7d06e2e5e4d!2sDenpasar%20Timur%2C%20Kota%20Denpasar%2C%20Bali!5e0!3m2!1sid!2sid!4v1700000000000';
  if (!value || typeof value !== 'string') return defaultEmbed;
  let trimmed = value.trim();
  // Jika admin menempelkan kode <iframe src="..."> utuh, ekstrak nilai src-nya
  const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1]) {
    trimmed = srcMatch[1].trim();
  }
  try {
    const parsed = new URL(trimmed);
    const validHosts = ['www.google.com', 'maps.google.com', 'google.com'];
    if (parsed.protocol === 'https:' && validHosts.includes(parsed.hostname)) {
      return trimmed;
    }
  } catch {
    // abaikan
  }
  return defaultEmbed;
}

module.exports = { sanitizeRichText, sanitizePlainText, sanitizeUrl, sanitizeMapsEmbedUrl };
