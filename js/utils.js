'use strict';

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const haptic = (ms = 10) => { try { navigator.vibrate(ms); } catch (_) {} };
