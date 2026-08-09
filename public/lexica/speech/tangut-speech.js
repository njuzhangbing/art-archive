/* ==========================================================================
   Reading Gong Hwang-cherng's Tangut reconstruction aloud.

   What this is
   ------------
   龚煌城 wrote his reconstruction in a transcription of his own, not in plain
   IPA. Its inventory, counted straight out of data.js across all 5842 entries:

     consonants  p b t d k g m n ŋ ɲ  s z ś ź  x ɣ h  l r w j
     vowels      i ɨ u e ə o a
     diacritics  ̣  (U+0323, tense vowel)   ̱  (U+0331, "lowered" series)
                 ̃  (U+0303, nasalised)     ˑ  (U+02D1, half-long)

   This maps that inventory onto the phoneme set eSpeak knows for English and
   hands it to meSpeak.js, which is eSpeak compiled to JavaScript.

   What it is NOT
   --------------
   It is an APPROXIMATION and the page says so out loud. Three things are lost
   and cannot be recovered by an English synthesiser:

     - the tense/lax contrast (the dot and the bar) has no English counterpart,
       so both series are read as the plain vowel
     - nasalisation is dropped — eSpeak's English voice has no nasal vowels
     - tone is absent from Gong's transcription altogether

   So what you hear is the segmental skeleton of a 12th-century reconstruction
   read by an English voice. It is useful for getting a word into your ear. It
   is not evidence about how Tangut sounded, and nothing here should be cited
   as though it were.

   meSpeak.js is GPL — see LICENSE-mespeak.txt. Loaded only when the reader is
   first used, because it is 3 MB.
   ========================================================================== */
(function () {
  'use strict';

  var BASE = 'speech/';
  var loading = null, ready = false;

  /* Longest-first, so the digraphs win: `tsh` must be tried before `ts`, and
     `ts` before `t`. A plain object would not guarantee order, so this is a
     list. eSpeak's English set has no ɣ, no ɕ and no ʑ; the nearest usable
     neighbours are noted where a substitution is being made. */
  var MAP = [
    // Three characters before two, two before one — `tśh` has to be tried
    // before `tś`, `tś` before `t`, `lh` before `l`, `dz` before `d`.
    ['tśh', 'tS'], ['tshj', 'tsj'], ['tsh', 'ts'], ['tś', 'tS'],
    ['dź', 'dZ'],  ['dz', 'dz'],    ['ts', 'ts'],
    ['ph', 'p'],   ['th', 't'],     ['kh', 'k'],
    // Gong's lh is a voiceless lateral. English has none, and spelling it 'hl'
    // makes eSpeak say two segments, so the voicelessness is simply lost.
    ['lh', 'l'],
    ['ŋ', 'N'],    ['ɲ', 'nj'],
    ['ś', 'S'],    ['ź', 'Z'],   ['ɕ', 'S'],  ['ʑ', 'Z'],   // ɕ ʑ → ʃ ʒ
    ['ɣ', 'g'],                                             // no voiced velar fricative
    ['x', 'x'],    ['ʔ', '?'],
    ['ɨ', 'I'],    ['ə', '@'],
    ['a', 'a'],    ['e', 'E'],   ['i', 'i:'], ['o', 'oU'],  ['u', 'u:'],
    ['p','p'], ['b','b'], ['t','t'], ['d','d'], ['k','k'], ['g','g'],
    ['m','m'], ['n','n'], ['s','s'], ['z','z'], ['h','h'],
    ['l','l'], ['r','r'], ['w','w'], ['j','j'], ['y','j'], ['f','f'], ['v','v'],
    ['ˑ', ':'],
  ];

  /* Strip the diacritics this synthesiser cannot voice, then read the string
     left to right taking the longest match at each step. Anything unmatched is
     dropped rather than passed through — an unknown character reaching eSpeak
     is read as a letter name, which would be worse than silence. */
  function toPhonemes(src) {
    var s = (src || '').normalize('NFD')
      .replace(/[̣̱̩̃]/g, '')   // tense, lowered, nasal
      .normalize('NFC')
      .replace(/[()\[\].;,\s]/g, ' ')
      .trim();
    if (!s) return '';

    var out = '', i = 0, dropped = 0;
    outer: while (i < s.length) {
      if (s[i] === ' ' || s[i] === '-') { out += ' '; i++; continue; }
      for (var k = 0; k < MAP.length; k++) {
        var from = MAP[k][0];
        if (s.substr(i, from.length) === from) { out += MAP[k][1]; i += from.length; continue outer; }
      }
      dropped++; i++;
    }
    out = out.trim();
    if (!out) return '';
    // eSpeak wants a stress mark or it reads the syllable flat and clipped
    return "'" + out;
  }

  function loadOnce() {
    if (ready) return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = BASE + 'mespeak.js';
      s.onload = function () {
        try {
          window.meSpeak.loadConfig(BASE + 'mespeak_config.json');
          window.meSpeak.loadVoice(BASE + 'en.json', function (ok) {
            ready = !!ok; resolve(ready);
          });
        } catch (e) { resolve(false); }
      };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return loading;
  }

  window.tangutSpeech = {
    phonemes: toPhonemes,
    /* Returns 'ok' | 'empty' | 'failed'. The caller shows the state, because
       the button is the only place the user can be told that a 3 MB engine is
       on its way. */
    speak: function (text) {
      var ph = toPhonemes(text);
      if (!ph) return Promise.resolve('empty');
      return loadOnce().then(function (ok) {
        if (!ok) return 'failed';
        var r = window.meSpeak.speak('[[' + ph + ']]', { speed: 128, pitch: 42, variant: 'm3' });
        return r === null ? 'failed' : 'ok';
      });
    },
  };
})();
