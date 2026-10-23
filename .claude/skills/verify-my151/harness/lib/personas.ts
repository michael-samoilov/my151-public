

export type PersonaName = 'ios-safari' | 'ios-chrome' | 'android-chrome';

export interface Persona {
  userAgent: string;
  viewport: { width: number; height: number };
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
  initScript: string;
  expect: { platform: string; maxTouchPoints: 'gt0' | 'zero'; webSpeech: boolean };
}

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.54 Mobile Safari/537.36';

const IOS_TOUCH = `
Object.defineProperty(navigator,'platform',{get:()=>'iPhone',configurable:true});
Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5,configurable:true});
`;
// iOS Chrome has no Web Speech API; headless Chromium leaks both, so remove them.
const STRIP_WEB_SPEECH = `
Object.defineProperty(window,'SpeechRecognition',{get:()=>undefined,configurable:true});
Object.defineProperty(window,'webkitSpeechRecognition',{get:()=>undefined,configurable:true});
`;
const ANDROID_TOUCH = `
Object.defineProperty(navigator,'platform',{get:()=>'Linux armv8l',configurable:true});
Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5,configurable:true});
`;

export const PERSONAS: Record<PersonaName, Persona> = {
  'ios-safari': {
    userAgent: IOS_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    initScript: IOS_TOUCH,
    expect: { platform: 'iPhone', maxTouchPoints: 'gt0', webSpeech: true },
  },
  'ios-chrome': {
    userAgent: IOS_CHROME_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    initScript: IOS_TOUCH + STRIP_WEB_SPEECH,
    expect: { platform: 'iPhone', maxTouchPoints: 'gt0', webSpeech: false },
  },
  'android-chrome': {
    userAgent: ANDROID_UA, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625,
    initScript: ANDROID_TOUCH,
    expect: { platform: 'Linux armv8l', maxTouchPoints: 'gt0', webSpeech: true },
  },
};

export const READ_PERSONA = `
return {
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
  hasWebSpeech: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  ua: navigator.userAgent,
  isCriOS: /CriOS/.test(navigator.userAgent),
  engine: /AppleWebKit/.test(navigator.userAgent) && !/Chrome|CriOS/.test(navigator.userAgent) ? 'webkit-ua'
        : /Gecko\\/[0-9]/.test(navigator.userAgent) ? 'gecko-ua' : 'blink-ua',
  dpr: window.devicePixelRatio,
  innerWidth: window.innerWidth,
};
`;

export interface PersonaReadback { platform: string; maxTouchPoints: number; hasWebSpeech: boolean; ua: string; isCriOS: boolean; engine: string; dpr: number; innerWidth: number; }

export function assertPersona(name: PersonaName, got: PersonaReadback): void {
  const p = PERSONAS[name];
  const fails: string[] = [];
  if (got.platform !== p.expect.platform) fails.push(`platform ${got.platform} != ${p.expect.platform}`);
  if (p.expect.maxTouchPoints === 'gt0' && !(got.maxTouchPoints > 0)) fails.push(`maxTouchPoints ${got.maxTouchPoints} not > 0`);
  if (got.hasWebSpeech !== p.expect.webSpeech) fails.push(`hasWebSpeech ${got.hasWebSpeech} != ${p.expect.webSpeech}`);
  if (name === 'ios-chrome' && !got.isCriOS) fails.push('CriOS token missing from UA');
  if (fails.length) throw new Error(`persona ${name} readback mismatch: ${fails.join('; ')}`);
}
