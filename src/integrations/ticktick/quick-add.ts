import { moment } from 'obsidian';
import type { Moment } from 'moment';
import { language, m, t, type LanguageCode } from '../../i18n';

// Quick-add understands the user's own language plus English, so a task typed
// as "call the bank tomorrow at 5pm !high ^Home #errands" works everywhere.

interface Words {
  today: string[];
  tomorrow: string[];
  afterTomorrow: string[];
  nextWeek: string[];
  /** "in 3 days": prefix/suffix around the number */
  inDays: RegExp[];
  inWeeks: RegExp[];
  inMonth: string[];
  at: string[];
  am: string[];
  pm: string[];
  high: string[];
  medium: string[];
  low: string[];
  /** Sunday first, alternate spellings allowed */
  weekdays: string[][];
  dayPrefix?: string;
}

const EN: Words = {
  today: ['today', 'tonight'],
  tomorrow: ['tomorrow', 'tmrw'],
  afterTomorrow: ['day after tomorrow'],
  nextWeek: ['next week'],
  inDays: [/in\s+(\d+)\s*days?/],
  inWeeks: [/in\s+(\d+)\s*weeks?/],
  inMonth: ['in a month', 'next month'],
  at: ['at'],
  am: ['am'],
  pm: ['pm'],
  high: ['high', 'h', '3'],
  medium: ['medium', 'med', 'm', '2'],
  low: ['low', 'l', '1'],
  weekdays: [['sunday', 'sun'], ['monday', 'mon'], ['tuesday', 'tue'], ['wednesday', 'wed'], ['thursday', 'thu'], ['friday', 'fri'], ['saturday', 'sat']],
  dayPrefix: 'on',
};

const LOCAL: Partial<Record<LanguageCode, Words>> = {
  ar: {
    today: ['اليوم', 'الليلة'],
    tomorrow: ['غدا', 'غداً', 'بكرة', 'بكره'],
    afterTomorrow: ['بعد غد', 'بعد بكرة', 'بعد بكره'],
    nextWeek: ['الأسبوع القادم', 'الاسبوع القادم', 'الأسبوع الجاي', 'الاسبوع الجاي', 'بعد أسبوع', 'بعد اسبوع'],
    inDays: [/بعد\s+(\d+)\s*(?:يوم|أيام|ايام|يوماً)/],
    inWeeks: [/بعد\s+(\d+)\s*(?:أسبوع|اسبوع|أسابيع|اسابيع)/],
    inMonth: ['بعد شهر'],
    at: ['الساعة', 'الساعه', 'ساعة'],
    am: ['ص', 'صباحا', 'صباحاً'],
    pm: ['م', 'مساء', 'مساءً', 'ظهرا', 'ظهراً'],
    high: ['عالي', 'عالية', 'مهم', 'مهمة', 'عاجل'],
    medium: ['متوسط', 'متوسطة'],
    low: ['منخفض', 'منخفضة'],
    weekdays: [['الأحد', 'الاحد'], ['الاثنين', 'الإثنين'], ['الثلاثاء'], ['الأربعاء', 'الاربعاء'], ['الخميس'], ['الجمعة'], ['السبت']],
    dayPrefix: 'يوم',
  },
  fr: {
    today: ["aujourd'hui", 'aujourd’hui', 'ce soir'],
    tomorrow: ['demain'],
    afterTomorrow: ['après-demain', 'apres-demain'],
    nextWeek: ['la semaine prochaine', 'semaine prochaine'],
    inDays: [/dans\s+(\d+)\s*jours?/],
    inWeeks: [/dans\s+(\d+)\s*semaines?/],
    inMonth: ['dans un mois', 'le mois prochain'],
    at: ['à', 'a'],
    am: ['h du matin'],
    pm: ["h de l'après-midi", 'h du soir'],
    high: ['haute', 'urgent', 'urgente'],
    medium: ['moyenne'],
    low: ['basse'],
    weekdays: [['dimanche'], ['lundi'], ['mardi'], ['mercredi'], ['jeudi'], ['vendredi'], ['samedi']],
  },
  es: {
    today: ['hoy', 'esta noche'],
    tomorrow: ['mañana', 'manana'],
    afterTomorrow: ['pasado mañana', 'pasado manana'],
    nextWeek: ['la próxima semana', 'la proxima semana', 'la semana que viene'],
    inDays: [/en\s+(\d+)\s*días?/, /en\s+(\d+)\s*dias?/],
    inWeeks: [/en\s+(\d+)\s*semanas?/],
    inMonth: ['en un mes', 'el mes que viene'],
    at: ['a las', 'a la'],
    am: ['de la mañana', 'am'],
    pm: ['de la tarde', 'de la noche', 'pm'],
    high: ['alta', 'urgente'],
    medium: ['media'],
    low: ['baja'],
    weekdays: [['domingo'], ['lunes'], ['martes'], ['miércoles', 'miercoles'], ['jueves'], ['viernes'], ['sábado', 'sabado']],
    dayPrefix: 'el',
  },
  tr: {
    today: ['bugün', 'bugun', 'bu akşam', 'bu aksam'],
    tomorrow: ['yarın', 'yarin'],
    afterTomorrow: ['öbür gün', 'obur gun', 'ertesi gün'],
    nextWeek: ['haftaya', 'gelecek hafta', 'önümüzdeki hafta'],
    inDays: [/(\d+)\s*gün\s+sonra/, /(\d+)\s*gun\s+sonra/],
    inWeeks: [/(\d+)\s*hafta\s+sonra/],
    inMonth: ['bir ay sonra', 'gelecek ay'],
    at: ['saat'],
    am: ['sabah'],
    pm: ['akşam', 'aksam', 'öğleden sonra'],
    high: ['yüksek', 'yuksek', 'acil'],
    medium: ['orta'],
    low: ['düşük', 'dusuk'],
    weekdays: [['pazar'], ['pazartesi'], ['salı', 'sali'], ['çarşamba', 'carsamba'], ['perşembe', 'persembe'], ['cuma'], ['cumartesi']],
  },
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const any = (list: string[]) => list.map(esc).sort((a, b) => b.length - a.length).join('|');
// \b does not work for Arabic or accented letters, so tokens are matched between spaces
const word = (alts: string) => new RegExp(`\\s(?:${alts})(?=\\s)`, 'iu');

function wordsFor(lang: LanguageCode): Words {
  const local = LOCAL[lang];
  if (!local) return EN;
  const merged = {} as Words;
  for (const k of Object.keys(EN) as (keyof Words)[]) {
    const a = local[k];
    const b = EN[k];
    if (k === 'weekdays') merged.weekdays = (a as string[][]).map((alts, i) => [...alts, ...(b as string[][])[i]]);
    else if (k === 'dayPrefix') merged.dayPrefix = [local.dayPrefix, EN.dayPrefix].filter(Boolean).join('|');
    else (merged as unknown as Record<string, unknown>)[k] = [...(a as unknown[]), ...(b as unknown[])];
  }
  return merged;
}

const toLatinDigits = (s: string) => s
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export interface QuickAdd {
  title: string;
  dueDate?: Moment;
  isAllDay?: boolean;
  priority?: 1 | 3 | 5;
  projectId?: string;
  tags: string[];
  /** [icon, label] previews shown under the input */
  chips: [string, string][];
}

export function parseQuickAdd(raw: string, projects: { id: string; name: string }[] = [], lang: LanguageCode = language()): QuickAdd {
  const W = wordsFor(lang);
  let s = ' ' + toLatinDigits(raw) + ' ';
  const out: QuickAdd = { title: '', tags: [], chips: [] };
  const cut = (re: RegExp) => {
    const hit = s.match(re);
    if (hit) s = s.replace(hit[0], ' ');
    return hit;
  };
  const M = moment;

  if (cut(new RegExp(`\\s!(?:${any(W.high)})(?=\\s)`, 'iu'))) { out.priority = 5; out.chips.push(['flag', t('ticktick.priority.high')]); }
  else if (cut(new RegExp(`\\s!(?:${any(W.medium)})(?=\\s)`, 'iu'))) { out.priority = 3; out.chips.push(['flag', t('ticktick.priority.medium')]); }
  else if (cut(new RegExp(`\\s!(?:${any(W.low)})(?=\\s)`, 'iu'))) { out.priority = 1; out.chips.push(['flag', t('ticktick.priority.low')]); }

  const list = cut(/\s\^(\S+)/);
  if (list) {
    const q = list[1].replace(/_/g, ' ').toLowerCase();
    const p = projects.find((x) => (x.name || '').toLowerCase() === q) ?? projects.find((x) => (x.name || '').toLowerCase().includes(q));
    if (p) { out.projectId = p.id; out.chips.push(['list', p.name]); }
    else out.chips.push(['alert-triangle', t('ticktick.quickAdd.noList', { name: list[1] })]);
  }

  let tag: RegExpMatchArray | null;
  while ((tag = cut(/\s#([^\s#]+)/))) { out.tags.push(tag[1]); out.chips.push(['tag', '#' + tag[1]]); }

  let day: Moment | null = null;
  let hit: RegExpMatchArray | null;
  if (cut(word(any(W.afterTomorrow)))) day = M().add(2, 'days');
  else if (cut(word(any(W.today)))) day = M();
  else if (cut(word(any(W.tomorrow)))) day = M().add(1, 'day');
  else if ((hit = W.inDays.map((re) => cut(new RegExp('\\s' + re.source + '(?=\\s)', 'iu'))).find(Boolean) ?? null)) day = M().add(+hit[1], 'days');
  else if ((hit = W.inWeeks.map((re) => cut(new RegExp('\\s' + re.source + '(?=\\s)', 'iu'))).find(Boolean) ?? null)) day = M().add(+hit[1] * 7, 'days');
  else if (cut(word(any(W.nextWeek)))) day = M().add(7, 'days');
  else if (cut(word(any(W.inMonth)))) day = M().add(1, 'month');
  else if ((hit = cut(/\s(\d{4})-(\d{1,2})-(\d{1,2})(?=\s)/))) day = M(`${hit[1]}-${hit[2].padStart(2, '0')}-${hit[3].padStart(2, '0')}`, 'YYYY-MM-DD');
  else if ((hit = cut(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    let y = hit[3] ? +hit[3] : M().year();
    if (y < 100) y += 2000;
    // day/month order, which is what every supported language except US English uses
    const [a, b] = lang === 'en' ? [+hit[2], +hit[1]] : [+hit[1], +hit[2]];
    day = M([y, b - 1, a]);
    if (!hit[3] && day.isBefore(M(), 'day')) day.add(1, 'year');
  } else {
    const prefix = W.dayPrefix ? `(?:(?:${W.dayPrefix})\\s+)?` : '';
    for (let i = 0; i < 7 && !day; i++) {
      const re = new RegExp(`\\s${prefix}(?:${any(W.weekdays[i])})(?=\\s)`, 'iu');
      if (re.test(s)) {
        s = s.replace(re, ' ');
        const d = M().day(i);
        if (!d.isAfter(M(), 'day')) d.add(7, 'days');
        day = d;
      }
    }
  }

  const meridiem = `(${any([...W.am, ...W.pm])})`;
  let hh: number | null = null;
  let mm = 0;
  const time =
    cut(new RegExp(`\\s(?:${any(W.at)})\\s*(\\d{1,2})(?:[:h](\\d{2}))?\\s*${meridiem}?(?=\\s)`, 'iu')) ??
    cut(new RegExp(`\\s(\\d{1,2})[:h](\\d{2})\\s*${meridiem}?(?=\\s)`, 'iu')) ??
    cut(new RegExp(`\\s(\\d{1,2})\\s*${meridiem}(?=\\s)`, 'iu'));
  if (time) {
    hh = +time[1];
    const minutes = time[2] && /^\d+$/.test(time[2]) ? time[2] : null;
    mm = minutes ? +minutes : 0;
    const ap = (time[3] ?? (minutes ? '' : time[2]) ?? '').toLowerCase();
    if (ap && W.pm.some((x) => x.toLowerCase() === ap) && hh < 12) hh += 12;
    if (ap && W.am.some((x) => x.toLowerCase() === ap) && hh === 12) hh = 0;
    if (!day) day = M();
  }

  if (day) {
    const d = day.clone().startOf('day');
    if (hh != null) { d.hour(hh).minute(mm); out.isAllDay = false; } else out.isAllDay = true;
    out.dueDate = d;
    out.chips.unshift(['calendar', m(d).format(hh != null ? 'dddd D MMMM, HH:mm' : 'dddd D MMMM')]);
  }
  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}
