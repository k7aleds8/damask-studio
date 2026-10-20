// Just enough of the obsidian module for unit tests that run outside the app.
import moment from 'moment';

let lang = 'en';
export const __setLanguage = (l: string) => { lang = l; };
export const getLanguage = () => lang;
export { moment };

export class TFile { path = ''; basename = ''; extension = 'md'; stat = { mtime: 0, ctime: 0, size: 0 }; }
export class TFolder { path = ''; name = ''; children: unknown[] = []; }
export class Notice { constructor(_msg: string) {} }
export const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
export const requestUrl = async () => ({ status: 200, text: '' });
