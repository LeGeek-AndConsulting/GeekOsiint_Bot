import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import axios from 'axios';
import dns from 'dns/promises';
import { parsePhoneNumber, isValidPhoneNumber, getNumberType } from 'libphonenumber-js';

config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ─── SET BOT BIO & COMMANDS ──────────────────────────────────

async function setupBot() {
  try {
    await bot.telegram.setMyDescription(
      '🔍 GeekOSINT — Moteur De Recherche OSINT\n\n' +
      'Recherche D\'Informations Sur Des Sources Ouvertes:\n' +
      '📧 Email · 📍 IP · 🌐 Domaine · 📞 Téléphone · 👤 Username\n\n' +
      '⚠️ Usage Éthique Uniquement. Informations Publiques Seulement.'
    );
    await bot.telegram.setMyShortDescription('🔍 Bot OSINT — Email, IP, Domaine, Téléphone, Username');
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Menu Principal' },
      { command: 'help', description: 'Guide D\'Utilisation' },
      { command: 'ip', description: 'Analyser Une IP — /ip 8.8.8.8' },
      { command: 'email', description: 'Analyser Un Email — /email user@ex.com' },
      { command: 'domain', description: 'Analyser Un Domaine — /domain exemple.com' },
      { command: 'phone', description: 'Analyser Un Téléphone — /phone +14385551234' },
      { command: 'user', description: 'Rechercher Un Username — /user monpseudo' },
    ]);
    console.log('✅ Bio et commandes configurées');
  } catch (e) {
    console.error('Setup error:', e.message);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────

function esc(text) {
  return String(text ?? '?').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function detectInput(text) {
  const t = text.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(t) || /^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/.test(t)) return 'ip';
  if (/^\+\d{7,15}$/.test(t)) return 'phone';
  if (/^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}\.[a-zA-Z]{2,}$/.test(t)) return 'domain';
  if (/^[a-zA-Z0-9_\.]{3,30}$/.test(t)) return 'username';
  return 'unknown';
}

async function loading(ctx, text) {
  return ctx.reply(`⏳ ${text}`, { parse_mode: 'Markdown' });
}

async function updateMsg(ctx, msg, text) {
  try {
    await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null, text, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    });
  } catch {
    await ctx.reply(text, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });
  }
}

// ─── START ───────────────────────────────────────────────────

bot.start((ctx) => {
  ctx.reply(
    `🔍 *GeekOSINT Bot*\n\n` +
    `Moteur De Recherche OSINT — Informations Publiques\\.\n\n` +
    `*📌 Envoie Directement:*\n` +
    `┣ 📧 \`user@exemple\\.com\` — Réputation \\+ Fuites\n` +
    `┣ 📍 \`1\\.2\\.3\\.4\` — Géo \\+ ISP \\+ Abus\n` +
    `┣ 🌐 \`exemple\\.com\` — WHOIS \\+ DNS \\+ SSL\n` +
    `┣ 📞 \`\\+14385551234\` — Pays \\+ Opérateur\n` +
    `┗ 👤 \`username\` — 20\\+ Plateformes\n\n` +
    `*🛠️ Ou Via Commandes:*\n` +
    `/ip · /email · /domain · /phone · /user\n\n` +
    `⚠️ _Usage Éthique Uniquement\\. Sources Ouvertes Seulement\\._`,
    { parse_mode: 'MarkdownV2' }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `📖 *Aide GeekOSINT*\n\n` +
    `*Commandes:*\n` +
    `\`/ip 8\\.8\\.8\\.8\` — Analyser Une IP\n` +
    `\`/email user@ex\\.com\` — Analyser Un Email\n` +
    `\`/domain exemple\\.com\` — Analyser Un Domaine\n` +
    `\`/phone \\+14385551234\` — Analyser Un Téléphone\n` +
    `\`/user monpseudo\` — Chercher Un Username\n\n` +
    `_Ou Envoie Directement La Valeur, Le Bot Détecte Automatiquement\\._`,
    { parse_mode: 'MarkdownV2' }
  );
});

// ─── COMMANDES DIRECTES ───────────────────────────────────────

bot.command('ip',     ctx => handleIP(ctx,       ctx.message.text.split(' ').slice(1).join(' ').trim()));
bot.command('email',  ctx => handleEmail(ctx,    ctx.message.text.split(' ').slice(1).join(' ').trim()));
bot.command('domain', ctx => handleDomain(ctx,   ctx.message.text.split(' ').slice(1).join(' ').trim()));
bot.command('phone',  ctx => handlePhone(ctx,    ctx.message.text.split(' ').slice(1).join(' ').trim()));
bot.command('user',   ctx => handleUsername(ctx, ctx.message.text.split(' ').slice(1).join(' ').trim()));

// ─── AUTO-DETECT ──────────────────────────────────────────────

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  const type = detectInput(text);
  if (type === 'email')    return handleEmail(ctx, text);
  if (type === 'ip')       return handleIP(ctx, text);
  if (type === 'domain')   return handleDomain(ctx, text);
  if (type === 'phone')    return handlePhone(ctx, text);
  if (type === 'username') return handleUsername(ctx, text);
  ctx.reply('❓ Format Non Reconnu\\. Envoie Un Email, IP, Domaine, Téléphone Ou Username\\.', { parse_mode: 'MarkdownV2' });
});

// ═══════════════════════════════════════════════════════════════
// 📧 EMAIL
// ═══════════════════════════════════════════════════════════════

async function handleEmail(ctx, email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return ctx.reply('❌ Email Invalide\\. Ex: `user@exemple\\.com`', { parse_mode: 'MarkdownV2' });
  }

  const msg = await loading(ctx, 'Analyse Email...');

  // Parallel: emailrep + HIBP
  const [repRes, hibpRes] = await Promise.allSettled([
    axios.get(`https://emailrep.io/${encodeURIComponent(email)}`, {
      headers: { 'User-Agent': 'GeekOSINT-Bot' },
      timeout: 8000,
      validateStatus: s => s < 500
    }),
    process.env.HIBP_API_KEY
      ? axios.get(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`, {
          headers: { 'hibp-api-key': process.env.HIBP_API_KEY, 'user-agent': 'GeekOSINT-Bot' },
          timeout: 8000, validateStatus: s => s < 500
        })
      : Promise.resolve(null)
  ]);

  const rep = repRes.status === 'fulfilled' && repRes.value?.data;
  const hibp = hibpRes.status === 'fulfilled' && hibpRes.value?.data;
  const breaches = Array.isArray(hibp) ? hibp : [];

  const domain = email.split('@')[1];
  let reply = `📧 *Analyse Email*\n\`${esc(email)}\`\n\n`;

  // Réputation emailrep.io
  if (rep && rep.email) {
    const r = rep;
    const score = r.reputation || 'none';
    const scoreEmoji = { high: '🟢', medium: '🟡', low: '🔴', none: '⚪' }[score] || '⚪';
    reply += `🎯 *Réputation*\n`;
    reply += `┣ ${scoreEmoji} Score: ${esc(score.toUpperCase())}\n`;
    reply += `┣ 🔍 Sources: ${esc(r.references ?? 0)}\n`;
    if (r.details) {
      const d = r.details;
      reply += `┣ 📭 Jetable: ${d.disposable ? '⚠️ Oui' : '✅ Non'}\n`;
      reply += `┣ 🆓 Gratuit: ${d.free_provider ? 'Oui' : 'Non'}\n`;
      reply += `┣ 🤖 Spam: ${d.suspicious_tld || d.spam ? '⚠️ Détecté' : '✅ Non'}\n`;
      if (d.profiles?.length) {
        reply += `┣ 🌐 Profils: ${esc(d.profiles.slice(0, 4).join(', '))}\n`;
      }
      reply += `┣ 📬 Actif: ${d.deliverable ? '✅ Oui' : '❓ Inconnu'}\n`;
      if (d.first_seen) reply += `┗ 📅 Vu La 1ère Fois: ${esc(d.first_seen)}\n`;
    }
    reply += '\n';
  }

  // Fuites HIBP
  if (process.env.HIBP_API_KEY) {
    if (breaches.length === 0) {
      reply += `🔐 *Fuites De Données*\n┗ ✅ Aucune Fuite Connue\n\n`;
    } else {
      reply += `🚨 *${breaches.length} Fuite\\(s\\) Détectée\\(s\\)*\n`;
      breaches.slice(0, 8).forEach(b => {
        const count = b.PwnCount ? `${(b.PwnCount / 1e6).toFixed(1)}M` : '?';
        reply += `┣ 🔴 *${esc(b.Name)}* \\(${esc(b.BreachDate?.slice(0, 7))}\\) · ${esc(count)}\n`;
        if (b.DataClasses?.length) {
          reply += `┃  📋 ${esc(b.DataClasses.slice(0, 3).join(', '))}\n`;
        }
      });
      if (breaches.length > 8) reply += `┗ _\\.\\.\\. \\+${breaches.length - 8} autres_\n`;
      reply += '\n🔐 *Conseil:* Change Tes Mots De Passe\\.\n';
    }
  } else {
    reply += `ℹ️ _Clé HIBP Non Configurée — Fuites Non Vérifiées_\n`;
  }

  reply += `\n🌐 *Domaine Email:* \`${esc(domain)}\``;

  await updateMsg(ctx, msg, reply);
}

// ═══════════════════════════════════════════════════════════════
// 📍 IP
// ═══════════════════════════════════════════════════════════════

async function handleIP(ctx, ip) {
  if (!ip) return ctx.reply('❌ Spécifie une IP\\. Ex: `/ip 8\\.8\\.8\\.8`', { parse_mode: 'MarkdownV2' });

  const msg = await loading(ctx, 'Analyse IP...');

  const [geoRes, abuseRes] = await Promise.allSettled([
    axios.get(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,proxy,hosting,mobile,query`, { timeout: 6000 }),
    process.env.ABUSEIPDB_API_KEY
      ? axios.get(`https://api.abuseipdb.com/api/v2/check`, {
          params: { ipAddress: ip, maxAgeInDays: 90, verbose: true },
          headers: { 'Key': process.env.ABUSEIPDB_API_KEY, 'Accept': 'application/json' },
          timeout: 6000
        })
      : axios.get(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
          timeout: 6000, validateStatus: s => true
        }).catch(() => null)
  ]);

  const geo = geoRes.status === 'fulfilled' ? geoRes.value.data : null;
  const abuse = abuseRes.status === 'fulfilled' ? abuseRes.value?.data?.data : null;

  if (!geo || geo.status !== 'success') {
    return updateMsg(ctx, msg, '❌ IP Invalide Ou Inaccessible\\.');
  }

  const flag = countryFlag(geo.countryCode);
  let reply = `📍 *Analyse IP*\n\`${esc(geo.query)}\`\n\n`;

  // Localisation
  reply += `${flag} *Localisation*\n`;
  reply += `┣ 🌍 Pays: ${esc(geo.country)} \\(${esc(geo.countryCode)}\\)\n`;
  reply += `┣ 🏙️ Ville: ${esc(geo.city)}, ${esc(geo.regionName)}\n`;
  reply += `┣ 📮 Code Postal: ${esc(geo.zip || '?')}\n`;
  reply += `┣ 🌐 Coordonnées: ${esc(geo.lat)}, ${esc(geo.lon)}\n`;
  reply += `┗ 🕐 Fuseau: ${esc(geo.timezone)}\n\n`;

  // Réseau
  reply += `🌐 *Réseau*\n`;
  reply += `┣ 🏢 ISP: ${esc(geo.isp)}\n`;
  reply += `┣ 🔗 Organisation: ${esc(geo.org)}\n`;
  reply += `┣ 📡 AS: ${esc(geo.as)}\n`;
  reply += `┗ 📛 AS Name: ${esc(geo.asname || '?')}\n\n`;

  // Type de connexion
  reply += `🔌 *Type De Connexion*\n`;
  reply += `┣ 🏠 Résidentielle: ${(!geo.proxy && !geo.hosting) ? '✅ Oui' : '❌ Non'}\n`;
  reply += `┣ 🛡️ VPN/Proxy: ${geo.proxy ? '⚠️ Détecté' : '✅ Non'}\n`;
  reply += `┣ 🖥️ Hébergeur: ${geo.hosting ? '⚠️ Oui' : '✅ Non'}\n`;
  reply += `┗ 📱 Mobile: ${geo.mobile ? '✅ Oui' : 'Non'}\n\n`;

  // Abus
  if (abuse) {
    const score = abuse.abuseConfidenceScore ?? 0;
    const scoreEmoji = score > 50 ? '🔴' : score > 10 ? '🟡' : '🟢';
    reply += `⚠️ *Réputation \\(AbuseIPDB\\)*\n`;
    reply += `┣ ${scoreEmoji} Score D'Abus: ${esc(score)}%\n`;
    reply += `┣ 📊 Signalements: ${esc(abuse.totalReports ?? 0)}\n`;
    reply += `┣ 👥 Utilisateurs: ${esc(abuse.numDistinctUsers ?? 0)}\n`;
    reply += `┗ 📅 Dernier Rapport: ${esc(abuse.lastReportedAt?.slice(0, 10) ?? 'Jamais')}\n\n`;
  }

  reply += `📌 [Voir Sur La Carte](https://www.google.com/maps?q=${geo.lat},${geo.lon})`;

  await updateMsg(ctx, msg, reply);
}

// ═══════════════════════════════════════════════════════════════
// 🌐 DOMAIN
// ═══════════════════════════════════════════════════════════════

async function handleDomain(ctx, domain) {
  if (!domain) return ctx.reply('❌ Spécifie Un Domaine\\. Ex: `/domain google\\.com`', { parse_mode: 'MarkdownV2' });

  const msg = await loading(ctx, 'Analyse Du Domaine...');

  const [whoisRes, aRes, mxRes, nsRes, txtRes, crtRes] = await Promise.allSettled([
    axios.get(`https://api.whoisjsonapi.com/whoisserver/WhoisService?domainName=${domain}&outputFormat=json`, {
      timeout: 8000, validateStatus: s => s < 500
    }),
    dns.resolve4(domain).catch(() => []),
    dns.resolveMx(domain).catch(() => []),
    dns.resolveNs(domain).catch(() => []),
    dns.resolveTxt(domain).catch(() => []),
    axios.get(`https://crt.sh/?q=%.${domain}&output=json`, { timeout: 8000 }).catch(() => null)
  ]);

  const w = whoisRes.status === 'fulfilled' ? (whoisRes.value?.data?.WhoisRecord || {}) : {};
  const ips = aRes.value || [];
  const mx = mxRes.value || [];
  const ns = nsRes.value || [];
  const txt = txtRes.value || [];
  const crt = crtRes.status === 'fulfilled' && crtRes.value?.data;

  const registrar = w.registrarName || '?';
  const created = w.createdDate || w.creationDate || '?';
  const expires = w.expiresDate || w.expirationDate || '?';
  const registrant = w.registrant?.organization || w.registrant?.name || '?';
  const status = w.status || '?';

  let reply = `🌐 *Analyse Domaine*\n\`${esc(domain)}\`\n\n`;

  // WHOIS
  reply += `📋 *WHOIS*\n`;
  reply += `┣ 🏢 Registrar: ${esc(String(registrar).slice(0, 35))}\n`;
  reply += `┣ 👤 Propriétaire: ${esc(String(registrant).slice(0, 30))}\n`;
  reply += `┣ 📅 Créé: ${esc(String(created).slice(0, 20))}\n`;
  reply += `┣ ⏳ Expire: ${esc(String(expires).slice(0, 20))}\n`;
  reply += `┗ 🔒 Statut: ${esc(String(status).split('\n')[0].slice(0, 40))}\n\n`;

  // DNS A
  if (ips.length) {
    reply += `🖥️ *Adresses IP \\(A\\)*\n`;
    ips.slice(0, 4).forEach(ip => { reply += `┣ \`${esc(ip)}\`\n`; });
    reply += '\n';
  }

  // Nameservers
  if (ns.length) {
    reply += `📡 *Nameservers*\n`;
    ns.slice(0, 4).forEach(n => { reply += `┣ \`${esc(n)}\`\n`; });
    reply += '\n';
  }

  // MX
  if (mx.length) {
    reply += `📧 *Serveurs Mail \\(MX\\)*\n`;
    mx.sort((a, b) => a.priority - b.priority).slice(0, 3).forEach(m => {
      reply += `┣ \`${esc(m.exchange)}\` \\(prio ${m.priority}\\)\n`;
    });
    reply += '\n';
  }

  // TXT (SPF, DMARC, etc.)
  const spf = txt.find(r => r.join('').startsWith('v=spf'));
  const dmarc = txt.find(r => r.join('').startsWith('v=DMARC'));
  if (spf || dmarc) {
    reply += `🔐 *Sécurité Email*\n`;
    if (spf) reply += `┣ ✅ SPF Configuré\n`;
    if (dmarc) reply += `┣ ✅ DMARC Configuré\n`;
    reply += '\n';
  }

  // Sous-domaines via crt.sh
  if (crt && Array.isArray(crt)) {
    const subs = [...new Set(
      crt.map(c => c.name_value?.split('\n')).flat()
        .filter(s => s && s.endsWith(domain) && s !== domain && !s.startsWith('*'))
    )].slice(0, 10);

    if (subs.length) {
      reply += `🔍 *Sous\\-Domaines \\(SSL/crt\\.sh\\)*\n`;
      subs.forEach(s => { reply += `┣ \`${esc(s)}\`\n`; });
      reply += `┗ _${esc(crt.length)} certificats trouvés_\n`;
    }
  }

  await updateMsg(ctx, msg, reply);
}

// ═══════════════════════════════════════════════════════════════
// 📞 PHONE
// ═══════════════════════════════════════════════════════════════

async function handlePhone(ctx, phone) {
  if (!phone) return ctx.reply('❌ Spécifie Un Numéro\\. Ex: `/phone \\+14385551234`', { parse_mode: 'MarkdownV2' });

  const msg = await loading(ctx, 'Analyse Du Numéro...');

  try {
    const parsed = parsePhoneNumber(phone);
    if (!parsed) throw new Error('Invalid');

    const isValid = isValidPhoneNumber(phone);
    const type = parsed.getType() || '❓ Inconnu';

    const typeLabels = {
      'MOBILE': '📱 Mobile',
      'FIXED_LINE': '📞 Fixe',
      'FIXED_LINE_OR_MOBILE': '📞📱 Fixe Ou Mobile',
      'TOLL_FREE': '🆓 Numéro Gratuit',
      'PREMIUM_RATE': '💰 Premium',
      'VOIP': '🌐 VOIP',
      'PAGER': '📟 Pager',
      'SHARED_COST': '📲 Coût Partagé',
      'UAN': '🏢 UAN',
    };

    const intlFormat = parsed.formatInternational();
    const natFormat = parsed.formatNational();
    const e164Format = parsed.format('E.164');
    const country = parsed.country;
    const countryCode = parsed.countryCallingCode;
    const nationalNum = parsed.nationalNumber;

    // Lookup opérateur
    let carrierInfo = '';
    try {
      const numRes = await axios.get(
        `https://api.hlr-lookups.com/json/free/msisdn/${encodeURIComponent(e164Format.replace('+', ''))}`,
        { timeout: 5000, validateStatus: s => s < 500 }
      );
      if (numRes.data?.operator) carrierInfo = numRes.data.operator;
    } catch {}

    let reply = `📞 *Analyse Téléphone*\n\`${esc(phone)}\`\n\n`;
    reply += `${isValid ? '✅' : '⚠️'} *Numéro ${isValid ? 'Valide' : 'Non Vérifié'}*\n\n`;

    reply += `📋 *Formats*\n`;
    reply += `┣ 🌐 International: \`${esc(intlFormat)}\`\n`;
    reply += `┣ 🏠 National: \`${esc(natFormat)}\`\n`;
    reply += `┗ 📟 E164: \`${esc(e164Format)}\`\n\n`;

    reply += `📡 *Informations*\n`;
    reply += `┣ 🌍 Pays: ${countryFlag(country)} ${esc(country || '?')}\n`;
    reply += `┣ ☎️ Indicatif: \\+${esc(countryCode)}\n`;
    reply += `┣ 🔢 Numéro National: ${esc(nationalNum)}\n`;
    reply += `┗ 📱 Type: ${esc(typeLabels[type] || type)}\n`;

    if (carrierInfo) reply += `\n🏢 *Opérateur*\n┗ ${esc(carrierInfo)}\n`;

    await updateMsg(ctx, msg, reply);

  } catch {
    await updateMsg(ctx, msg, `❌ Numéro Invalide\\. Utilise Le Format: \`\\+14385551234\``);
  }
}

// ═══════════════════════════════════════════════════════════════
// 👤 USERNAME
// ═══════════════════════════════════════════════════════════════

const PLATFORMS = [
  // Social
  { name: 'Instagram',   url: 'https://instagram.com/{}',              cat: '📸' },
  { name: 'Twitter/X',   url: 'https://x.com/{}',                      cat: '🐦' },
  { name: 'TikTok',      url: 'https://tiktok.com/@{}',                cat: '🎵' },
  { name: 'YouTube',     url: 'https://youtube.com/@{}',               cat: '📺' },
  { name: 'Facebook',    url: 'https://facebook.com/{}',               cat: '📘' },
  { name: 'Snapchat',    url: 'https://snapchat.com/add/{}',           cat: '👻' },
  { name: 'Pinterest',   url: 'https://pinterest.com/{}',              cat: '📌' },
  // Dev
  { name: 'GitHub',      url: 'https://github.com/{}',                 cat: '💻' },
  { name: 'GitLab',      url: 'https://gitlab.com/{}',                 cat: '🦊' },
  { name: 'Dev.to',      url: 'https://dev.to/{}',                     cat: '👨‍💻' },
  { name: 'CodePen',     url: 'https://codepen.io/{}',                 cat: '🖊️' },
  // Gaming
  { name: 'Twitch',      url: 'https://twitch.tv/{}',                  cat: '🎮' },
  { name: 'Steam',       url: 'https://steamcommunity.com/id/{}',      cat: '🎲' },
  { name: 'Roblox',      url: 'https://roblox.com/user.aspx?username={}', cat: '🧱' },
  // Pro
  { name: 'LinkedIn',    url: 'https://linkedin.com/in/{}',            cat: '💼' },
  { name: 'Medium',      url: 'https://medium.com/@{}',                cat: '📝' },
  { name: 'Substack',    url: 'https://{}.substack.com',               cat: '📰' },
  // Autres
  { name: 'Reddit',      url: 'https://reddit.com/user/{}',            cat: '🤖' },
  { name: 'Spotify',     url: 'https://open.spotify.com/user/{}',      cat: '🎵' },
  { name: 'Linktree',    url: 'https://linktr.ee/{}',                  cat: '🌳' },
  { name: 'Behance',     url: 'https://behance.net/{}',                cat: '🎨' },
  { name: 'Dribbble',    url: 'https://dribbble.com/{}',               cat: '🏀' },
];

async function checkPlatform(platform, username) {
  const url = platform.url.replace(/\{\}/g, username);
  try {
    const res = await axios.get(url, {
      timeout: 7000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      validateStatus: s => s < 500
    });
    // Consider found if 200 and not a redirect to homepage
    const found = res.status === 200 &&
      !res.request?.res?.responseUrl?.includes('404') &&
      !res.request?.res?.responseUrl?.includes('not-found');
    return { ...platform, url, found };
  } catch {
    return { ...platform, url, found: false };
  }
}

async function handleUsername(ctx, username) {
  if (!username) return ctx.reply('❌ Spécifie Un Username\\. Ex: `/user monpseudo`', { parse_mode: 'MarkdownV2' });

  const msg = await ctx.reply(`🔍 Recherche \`${username}\` Sur ${PLATFORMS.length} Plateformes\\.\\.\\.`, { parse_mode: 'MarkdownV2' });

  try {
    const results = await Promise.all(PLATFORMS.map(p => checkPlatform(p, username)));
    const found = results.filter(r => r.found);
    const notFound = results.filter(r => !r.found);

    let reply = `👤 *Recherche Username*\n\`${esc(username)}\`\n\n`;
    reply += `📊 *Résultats: ${found.length}/${PLATFORMS.length} Trouvé\\(s\\)*\n\n`;

    if (found.length) {
      reply += `✅ *Présent Sur*\n`;
      found.forEach(p => {
        reply += `┣ ${p.cat} [${esc(p.name)}](${p.url})\n`;
      });
      reply += '\n';
    }

    if (notFound.length) {
      reply += `❌ *Non Trouvé Sur*\n`;
      // Group them in a compact list
      reply += notFound.map(p => `${p.cat} ${esc(p.name)}`).join(' · ');
    }

    await updateMsg(ctx, msg, reply);

  } catch (err) {
    console.error('Username error:', err.message);
    await updateMsg(ctx, msg, '❌ Erreur Lors De La Recherche\\. Réessaye\\.');
  }
}

// ─── LAUNCH ──────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error(`❌ [${ctx.updateType}]:`, err.message);
});

bot.launch().then(() => setupBot());
console.log('🔍 GeekOSINT Bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
