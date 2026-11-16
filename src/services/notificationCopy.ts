// src/services/notificationCopy.ts
// Wording for every alert, in the three languages the app ships in.
// One source for email, push and WhatsApp so the channels never drift apart.

export type AlertLocale = 'en' | 'fr' | 'sw';

export const DEFAULT_ALERT_LOCALE: AlertLocale = 'en';

export function toAlertLocale(value?: string | null): AlertLocale {
  return value === 'fr' || value === 'sw' || value === 'en' ? value : DEFAULT_ALERT_LOCALE;
}

/** The listing details an alert needs. Kept small and platform-neutral. */
export interface ListingSummary {
  id: string;
  title: string;
  /** Already formatted for display, e.g. "₦1,200,000 / year" */
  priceText: string;
  /** e.g. "Tanke, Ilorin" */
  locationText?: string;
  imageUrl?: string;
}

interface AlertCopy {
  greeting: (name: string) => string;
  viewListing: string;
  manageAlerts: string;
  footer: string;
  linkFallback: string;

  newListing: {
    subject: (l: ListingSummary) => string;
    heading: string;
    intro: (searchName?: string) => string;
    pushTitle: string;
    pushBody: (l: ListingSummary) => string;
  };
  enquiry: {
    subject: (l: ListingSummary) => string;
    heading: string;
    intro: (enquirer: string, l: ListingSummary) => string;
    pushTitle: string;
    pushBody: (enquirer: string, l: ListingSummary) => string;
  };
  expiring: {
    subject: (l: ListingSummary, days: number) => string;
    heading: string;
    intro: (l: ListingSummary, days: number) => string;
    cta: string;
    pushTitle: string;
    pushBody: (l: ListingSummary, days: number) => string;
  };
  welcome: {
    subject: string;
    heading: string;
    intro: string;
    cta: string;
  };
}

const where = (l: ListingSummary) => (l.locationText ? ` · ${l.locationText}` : '');

const en: AlertCopy = {
  greeting: (name) => `Hi ${name},`,
  viewListing: 'View listing',
  manageAlerts: 'Manage alerts',
  footer: 'You are receiving this because alerts are turned on for your Proptriz account.',
  linkFallback: 'If the button does not work, open this link:',

  newListing: {
    subject: (l) => `New listing: ${l.title}`,
    heading: 'A new listing matches your search',
    intro: (searchName) =>
      searchName
        ? `A property that matches your saved search "${searchName}" was just listed.`
        : 'A property that matches what you are looking for was just listed.',
    pushTitle: 'New listing for you',
    pushBody: (l) => `${l.title} · ${l.priceText}${where(l)}`,
  },
  enquiry: {
    subject: (l) => `New enquiry on ${l.title}`,
    heading: 'Someone is interested in your listing',
    intro: (enquirer, l) => `${enquirer} asked for your contact details on "${l.title}".`,
    pushTitle: 'New enquiry',
    pushBody: (enquirer, l) => `${enquirer} is interested in ${l.title}`,
  },
  expiring: {
    subject: (l, days) =>
      days <= 1 ? `Your listing expires tomorrow: ${l.title}` : `Your listing expires in ${days} days: ${l.title}`,
    heading: 'Your listing is about to expire',
    intro: (l, days) =>
      days <= 1
        ? `"${l.title}" will stop showing in search tomorrow. Renew it to keep it visible.`
        : `"${l.title}" will stop showing in search in ${days} days. Renew it to keep it visible.`,
    cta: 'Renew listing',
    pushTitle: 'Listing expiring soon',
    pushBody: (l, days) =>
      days <= 1 ? `${l.title} expires tomorrow. Renew it to stay visible.` : `${l.title} expires in ${days} days. Renew it to stay visible.`,
  },
  welcome: {
    subject: 'Welcome to Proptriz',
    heading: 'Welcome to Proptriz',
    intro: 'Your account is ready. Search homes to rent or buy, save a search, and we will alert you when a matching property is listed.',
    cta: 'Start exploring',
  },
};

const fr: AlertCopy = {
  greeting: (name) => `Bonjour ${name},`,
  viewListing: "Voir l'annonce",
  manageAlerts: 'Gérer les alertes',
  footer: 'Vous recevez ce message parce que les alertes sont activées sur votre compte Proptriz.',
  linkFallback: 'Si le bouton ne fonctionne pas, ouvrez ce lien :',

  newListing: {
    subject: (l) => `Nouvelle annonce : ${l.title}`,
    heading: 'Une nouvelle annonce correspond à votre recherche',
    intro: (searchName) =>
      searchName
        ? `Un bien correspondant à votre recherche enregistrée « ${searchName} » vient d'être publié.`
        : "Un bien correspondant à ce que vous recherchez vient d'être publié.",
    pushTitle: 'Nouvelle annonce pour vous',
    pushBody: (l) => `${l.title} · ${l.priceText}${where(l)}`,
  },
  enquiry: {
    subject: (l) => `Nouvelle demande pour ${l.title}`,
    heading: "Quelqu'un s'intéresse à votre annonce",
    intro: (enquirer, l) => `${enquirer} a demandé vos coordonnées pour « ${l.title} ».`,
    pushTitle: 'Nouvelle demande',
    pushBody: (enquirer, l) => `${enquirer} s'intéresse à ${l.title}`,
  },
  expiring: {
    subject: (l, days) =>
      days <= 1 ? `Votre annonce expire demain : ${l.title}` : `Votre annonce expire dans ${days} jours : ${l.title}`,
    heading: 'Votre annonce expire bientôt',
    intro: (l, days) =>
      days <= 1
        ? `« ${l.title} » ne sera plus visible dans les recherches dès demain. Renouvelez-la pour qu'elle reste visible.`
        : `« ${l.title} » ne sera plus visible dans les recherches dans ${days} jours. Renouvelez-la pour qu'elle reste visible.`,
    cta: "Renouveler l'annonce",
    pushTitle: 'Annonce bientôt expirée',
    pushBody: (l, days) =>
      days <= 1 ? `${l.title} expire demain. Renouvelez-la pour rester visible.` : `${l.title} expire dans ${days} jours. Renouvelez-la pour rester visible.`,
  },
  welcome: {
    subject: 'Bienvenue sur Proptriz',
    heading: 'Bienvenue sur Proptriz',
    intro: "Votre compte est prêt. Cherchez un logement à louer ou à acheter, enregistrez une recherche, et nous vous préviendrons dès qu'un bien correspondant sera publié.",
    cta: 'Commencer à explorer',
  },
};

const sw: AlertCopy = {
  greeting: (name) => `Habari ${name},`,
  viewListing: 'Tazama tangazo',
  manageAlerts: 'Dhibiti arifa',
  footer: 'Unapokea ujumbe huu kwa sababu arifa zimewashwa kwenye akaunti yako ya Proptriz.',
  linkFallback: 'Kama kitufe hakifanyi kazi, fungua kiungo hiki:',

  newListing: {
    subject: (l) => `Tangazo jipya: ${l.title}`,
    heading: 'Tangazo jipya linalingana na utafutaji wako',
    intro: (searchName) =>
      searchName
        ? `Mali inayolingana na utafutaji wako uliohifadhiwa "${searchName}" imetangazwa hivi punde.`
        : 'Mali inayolingana na unachotafuta imetangazwa hivi punde.',
    pushTitle: 'Tangazo jipya kwa ajili yako',
    pushBody: (l) => `${l.title} · ${l.priceText}${where(l)}`,
  },
  enquiry: {
    subject: (l) => `Ombi jipya kuhusu ${l.title}`,
    heading: 'Kuna mtu anavutiwa na tangazo lako',
    intro: (enquirer, l) => `${enquirer} ameomba mawasiliano yako kuhusu "${l.title}".`,
    pushTitle: 'Ombi jipya',
    pushBody: (enquirer, l) => `${enquirer} anavutiwa na ${l.title}`,
  },
  expiring: {
    subject: (l, days) =>
      days <= 1 ? `Tangazo lako linaisha kesho: ${l.title}` : `Tangazo lako linaisha baada ya siku ${days}: ${l.title}`,
    heading: 'Tangazo lako linakaribia kuisha',
    intro: (l, days) =>
      days <= 1
        ? `"${l.title}" halitaonekana tena kwenye utafutaji kuanzia kesho. Lihuishe ili liendelee kuonekana.`
        : `"${l.title}" halitaonekana tena kwenye utafutaji baada ya siku ${days}. Lihuishe ili liendelee kuonekana.`,
    cta: 'Huisha tangazo',
    pushTitle: 'Tangazo linakaribia kuisha',
    pushBody: (l, days) =>
      days <= 1 ? `${l.title} linaisha kesho. Lihuishe ili liendelee kuonekana.` : `${l.title} linaisha baada ya siku ${days}. Lihuishe ili liendelee kuonekana.`,
  },
  welcome: {
    subject: 'Karibu Proptriz',
    heading: 'Karibu Proptriz',
    intro: 'Akaunti yako iko tayari. Tafuta nyumba za kupanga au kununua, hifadhi utafutaji, nasi tutakuarifu mali inayolingana itakapotangazwa.',
    cta: 'Anza kugundua',
  },
};

const COPY: Record<AlertLocale, AlertCopy> = { en, fr, sw };

export function alertCopy(locale?: AlertLocale): AlertCopy {
  return COPY[locale ?? DEFAULT_ALERT_LOCALE];
}

// ─── Links ────────────────────────────────────────────────────────────────────
// Every alert carries an https link on the public domain so that the web app,
// the Pi Browser and the future Android/iOS apps can all open it.

export function appUrl(path = '/'): string {
  const base = (process.env.APP_PUBLIC_URL || 'https://proptriz.com').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const listingUrl = (listingId: string) => appUrl(`/property/details/${encodeURIComponent(listingId)}`);
export const editListingUrl = (listingId: string) => appUrl(`/property/edit/${encodeURIComponent(listingId)}`);
export const alertSettingsUrl = () => appUrl('/profile/notifications');
