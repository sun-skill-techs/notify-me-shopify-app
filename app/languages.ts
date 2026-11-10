// One-click translations for every shopper-facing word: the storefront button
// and popup (widget.ts) and the restock email, subject and unsubscribe page
// (email-text.ts). Merchants pick one, then edit any line they like.

import { DEFAULTS, type WidgetSettings } from "./widget";
import { EMAIL_TEXT, type EmailText } from "./email-text";

const WIDGET_KEYS = [
  "buttonText",
  "eyebrow",
  "heading",
  "subheading",
  "variantLabel",
  "emailLabel",
  "placeholder",
  "submitText",
  "finePrint",
  "successHeading",
  "successDetail",
  "doneText",
  "invalidText",
  "errorText",
] as const;

type WidgetText = Pick<WidgetSettings, (typeof WIDGET_KEYS)[number]>;

export type Language = {
  name: string;
  subject: string;
  email: EmailText;
  widget: WidgetText;
};

const english: Language = {
  name: "English",
  subject: "{{product}} is back in stock",
  email: EMAIL_TEXT,
  widget: Object.fromEntries(WIDGET_KEYS.map((k) => [k, DEFAULTS[k]])) as WidgetText,
};

export const LANGUAGES: Language[] = [
  english,
  {
    name: "Español",
    subject: "{{product}} vuelve a estar disponible",
    email: {
      heading: "{{product}} vuelve a estar disponible",
      body: "Nos pediste que te avisáramos cuando volviera. Ya está disponible y puede agotarse pronto.",
      button: "Comprar ahora",
      footer: "Solo recibirás este correo para esta solicitud. No es una lista de marketing.",
      unsubscribe: "Darse de baja",
      unsubHeading: "¿Darte de baja de este aviso de reposición?",
      unsubBody: "No recibirás más correos sobre este artículo.",
      unsubDoneHeading: "Te has dado de baja",
      unsubDoneBody:
        "No recibirás más avisos de reposición de este artículo. Puedes volver a suscribirte desde la página del producto cuando quieras.",
      continueShopping: "Seguir comprando",
    },
    widget: {
      buttonText: "Avísame cuando esté disponible",
      eyebrow: "Aviso de reposición",
      heading: "Avísame cuando vuelva",
      subheading: "Te avisaremos en cuanto vuelva a estar disponible.",
      variantLabel: "Opción",
      emailLabel: "Correo electrónico",
      placeholder: "tu@ejemplo.com",
      submitText: "Avísame",
      finePrint: "Un solo correo cuando vuelva este artículo. No es una lista de marketing.",
      successHeading: "Estás en la lista",
      successDetail: "Te enviaremos un correo en cuanto vuelva a estar disponible.",
      doneText: "Cerrar",
      invalidText: "Introduce un correo electrónico válido.",
      errorText: "Algo salió mal. Inténtalo de nuevo.",
    },
  },
  {
    name: "Français",
    subject: "{{product}} est de retour en stock",
    email: {
      heading: "{{product}} est de retour en stock",
      body: "Vous nous avez demandé de vous prévenir de son retour. Il est disponible dès maintenant, et le stock pourrait partir vite.",
      button: "Acheter",
      footer: "Vous ne recevrez que cet e-mail pour cette demande. Il ne s'agit pas d'une liste marketing.",
      unsubscribe: "Se désabonner",
      unsubHeading: "Se désabonner de cette alerte de réassort ?",
      unsubBody: "Vous ne recevrez plus d'e-mail concernant cet article.",
      unsubDoneHeading: "Vous êtes désabonné",
      unsubDoneBody:
        "Vous ne recevrez plus d'alerte de réassort pour cet article. Vous pouvez vous réinscrire depuis la page produit à tout moment.",
      continueShopping: "Continuer mes achats",
    },
    widget: {
      buttonText: "M'avertir quand disponible",
      eyebrow: "Alerte de réassort",
      heading: "Prévenez-moi de son retour",
      subheading: "Nous vous préviendrons dès qu'il sera de nouveau en stock.",
      variantLabel: "Option",
      emailLabel: "Adresse e-mail",
      placeholder: "vous@exemple.com",
      submitText: "M'avertir",
      finePrint: "Un seul e-mail au retour de cet article. Pas une liste marketing.",
      successHeading: "Vous êtes sur la liste",
      successDetail: "Nous vous enverrons un e-mail dès son retour en stock.",
      doneText: "Fermer",
      invalidText: "Saisissez une adresse e-mail valide.",
      errorText: "Une erreur s'est produite. Réessayez.",
    },
  },
  {
    name: "Deutsch",
    subject: "{{product}} ist wieder verfügbar",
    email: {
      heading: "{{product}} ist wieder verfügbar",
      body: "Du wolltest benachrichtigt werden, sobald dieser Artikel zurück ist. Er ist jetzt verfügbar und könnte schnell wieder ausverkauft sein.",
      button: "Jetzt kaufen",
      footer: "Du erhältst für diese Anfrage nur diese eine E-Mail. Das ist kein Newsletter.",
      unsubscribe: "Abmelden",
      unsubHeading: "Von dieser Verfügbarkeitsbenachrichtigung abmelden?",
      unsubBody: "Du erhältst keine weitere E-Mail zu diesem Artikel.",
      unsubDoneHeading: "Du bist abgemeldet",
      unsubDoneBody:
        "Du erhältst keine weitere Benachrichtigung zu diesem Artikel. Du kannst dich jederzeit auf der Produktseite erneut anmelden.",
      continueShopping: "Weiter einkaufen",
    },
    widget: {
      buttonText: "Benachrichtigen, wenn verfügbar",
      eyebrow: "Verfügbarkeitshinweis",
      heading: "Benachrichtige mich bei Verfügbarkeit",
      subheading: "Wir sagen dir Bescheid, sobald der Artikel wieder auf Lager ist.",
      variantLabel: "Option",
      emailLabel: "E-Mail-Adresse",
      placeholder: "du@beispiel.de",
      submitText: "Benachrichtigen",
      finePrint: "Eine E-Mail, wenn der Artikel zurück ist. Kein Newsletter.",
      successHeading: "Du stehst auf der Liste",
      successDetail: "Wir schicken dir eine E-Mail, sobald der Artikel wieder auf Lager ist.",
      doneText: "Schließen",
      invalidText: "Gib eine gültige E-Mail-Adresse ein.",
      errorText: "Etwas ist schiefgelaufen. Versuch es noch einmal.",
    },
  },
  {
    name: "Nederlands",
    subject: "{{product}} is weer op voorraad",
    email: {
      heading: "{{product}} is weer op voorraad",
      body: "Je vroeg ons je te laten weten wanneer dit terug zou zijn. Het is nu beschikbaar, en de voorraad kan snel op zijn.",
      button: "Nu kopen",
      footer: "Je krijgt voor deze aanvraag alleen deze ene e-mail. Dit is geen marketinglijst.",
      unsubscribe: "Afmelden",
      unsubHeading: "Afmelden voor deze voorraadmelding?",
      unsubBody: "Je krijgt geen e-mail meer over dit artikel.",
      unsubDoneHeading: "Je bent afgemeld",
      unsubDoneBody:
        "Je krijgt geen voorraadmelding meer voor dit artikel. Je kunt je altijd opnieuw aanmelden via de productpagina.",
      continueShopping: "Verder winkelen",
    },
    widget: {
      buttonText: "Laat het me weten als het er weer is",
      eyebrow: "Voorraadmelding",
      heading: "Mail me als dit terug is",
      subheading: "We laten het je weten zodra het weer op voorraad is.",
      variantLabel: "Optie",
      emailLabel: "E-mailadres",
      placeholder: "jij@voorbeeld.nl",
      submitText: "Houd me op de hoogte",
      finePrint: "Eén e-mail als dit artikel terug is. Geen marketinglijst.",
      successHeading: "Je staat op de lijst",
      successDetail: "We sturen je één e-mail zodra het weer op voorraad is.",
      doneText: "Sluiten",
      invalidText: "Vul een geldig e-mailadres in.",
      errorText: "Er ging iets mis. Probeer het opnieuw.",
    },
  },
  {
    name: "Português",
    subject: "{{product}} está de volta ao estoque",
    email: {
      heading: "{{product}} está de volta ao estoque",
      body: "Você pediu para ser avisado quando este item voltasse. Ele já está disponível, e o estoque pode acabar rápido.",
      button: "Comprar agora",
      footer: "Você receberá apenas este e-mail para esta solicitação. Isto não é uma lista de marketing.",
      unsubscribe: "Cancelar inscrição",
      unsubHeading: "Cancelar este alerta de reposição?",
      unsubBody: "Você não receberá outro e-mail sobre este item.",
      unsubDoneHeading: "Inscrição cancelada",
      unsubDoneBody:
        "Você não receberá mais alertas de reposição deste item. Pode se inscrever novamente na página do produto quando quiser.",
      continueShopping: "Continuar comprando",
    },
    widget: {
      buttonText: "Avise-me quando chegar",
      eyebrow: "Aviso de reposição",
      heading: "Me avise quando voltar",
      subheading: "Avisaremos assim que voltar ao estoque.",
      variantLabel: "Opção",
      emailLabel: "E-mail",
      placeholder: "voce@exemplo.com",
      submitText: "Avise-me",
      finePrint: "Um único e-mail quando este item voltar. Não é uma lista de marketing.",
      successHeading: "Você está na lista",
      successDetail: "Enviaremos um e-mail assim que voltar ao estoque.",
      doneText: "Fechar",
      invalidText: "Digite um e-mail válido.",
      errorText: "Algo deu errado. Tente novamente.",
    },
  },
  {
    name: "Italiano",
    subject: "{{product}} è di nuovo disponibile",
    email: {
      heading: "{{product}} è di nuovo disponibile",
      body: "Ci hai chiesto di avvisarti quando sarebbe tornato. Ora è disponibile e le scorte potrebbero finire presto.",
      button: "Acquista ora",
      footer: "Riceverai solo questa email per questa richiesta. Non è una lista marketing.",
      unsubscribe: "Annulla iscrizione",
      unsubHeading: "Annullare questo avviso di disponibilità?",
      unsubBody: "Non riceverai altre email su questo articolo.",
      unsubDoneHeading: "Iscrizione annullata",
      unsubDoneBody:
        "Non riceverai altri avvisi di disponibilità per questo articolo. Puoi iscriverti di nuovo dalla pagina del prodotto in qualsiasi momento.",
      continueShopping: "Continua lo shopping",
    },
    widget: {
      buttonText: "Avvisami quando disponibile",
      eyebrow: "Avviso di disponibilità",
      heading: "Avvisami quando torna",
      subheading: "Ti avviseremo non appena sarà di nuovo disponibile.",
      variantLabel: "Opzione",
      emailLabel: "Indirizzo email",
      placeholder: "tu@esempio.it",
      submitText: "Avvisami",
      finePrint: "Una sola email quando l'articolo torna. Non è una lista marketing.",
      successHeading: "Sei in lista",
      successDetail: "Ti invieremo un'email non appena sarà di nuovo disponibile.",
      doneText: "Chiudi",
      invalidText: "Inserisci un indirizzo email valido.",
      errorText: "Qualcosa è andato storto. Riprova.",
    },
  },
];
