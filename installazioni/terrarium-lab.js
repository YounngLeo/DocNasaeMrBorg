/* Terrario bio-clima — gas realistici · bozzoli biolum strobo */
(function () {
  var cocoonsEl = document.getElementById('tr-cocoons');
  if (!cocoonsEl) return;

  var CO2_IN = document.getElementById('tr-pipe-co2');
  var O2_IN = document.getElementById('tr-pipe-o2');
  var CO2_OUT = document.getElementById('tr-pipe-co2-out');
  var O2_OUT = document.getElementById('tr-pipe-o2-out');
  var PLANT_GLOW = document.getElementById('tr-plant-glow');
  var simOn = true;
  var tick = 0;
  var lastBio = 14.2;

  /* ppm · °C · lx · % — equilibrio ambiente chiuso */
  var AMB = { co2: 420, o2: 20.95, ph: 6.55, temp: 21.5, lux: 90 };

  var state = {
    ph: 6.45,
    temp: 22.0,
    lux: 120,
    co2: 420,
    o2: 20.9,
    bioR: 14.2,
    valveCo2: 20,
    valveO2: 15,
    co2Vent: 0,
    o2Vent: 0
  };

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function fmt(n, d) { return Number(n).toFixed(d == null ? 1 : d); }

  function valveFlow(v) {
    var t = v / 100;
    return t * t * 0.85 + t * 0.15;
  }

  function bindValve(id, key, knobId) {
    var el = $(id);
    var valEl = $(id + '-val');
    var knob = $(knobId);
    function sync() {
      state[key] = parseInt(el.value, 10);
      if (valEl) valEl.textContent = state[key] + '%';
      if (knob) knob.setAttribute('transform', 'rotate(' + (state[key] * 2.7 - 135) + ' 0 0)');
      updatePipes();
    }
    el.addEventListener('input', sync);
    sync();
  }

  function updatePipes() {
    var co2InF = valveFlow(state.valveCo2);
    var o2InF = valveFlow(state.valveO2);
    var co2OutF = clamp((state.co2 - AMB.co2) / 500, 0, 1) * 0.9 + 0.08;
    var o2OutF = clamp((state.o2 - AMB.o2) / 2.5, 0, 1) * 0.85 + 0.06;

    if (CO2_IN) {
      CO2_IN.style.opacity = String(0.2 + co2InF * 0.8);
      CO2_IN.style.strokeDashoffset = String(24 - co2InF * 22);
    }
    if (O2_IN) {
      O2_IN.style.opacity = String(0.2 + o2InF * 0.8);
      O2_IN.style.strokeDashoffset = String(24 - o2InF * 22);
    }
    if (CO2_OUT) {
      CO2_OUT.style.opacity = String(0.15 + co2OutF * 0.85);
      CO2_OUT.style.strokeDashoffset = String(co2OutF * 20);
    }
    if (O2_OUT) {
      O2_OUT.style.opacity = String(0.15 + o2OutF * 0.85);
      O2_OUT.style.strokeDashoffset = String(-o2OutF * 20);
    }
  }

  function photosynthesisRate() {
    return clamp((state.lux - 60) / 420, 0, 1);
  }

  function simulateStep() {
    if (!simOn) return;
    tick++;

    var co2InF = valveFlow(state.valveCo2);
    var o2InF = valveFlow(state.valveO2);
    var photo = photosynthesisRate();
    var resp = 0.55 + clamp((state.temp - 18) / 12, 0, 1) * 0.45;

    /* INIEZIONE — valvole aperte immettono gas nel volume chiuso */
    var co2Inject = co2InF * 22;
    var o2Inject = o2InF * 0.38;

    /* USCITA — CO₂ più pesante tende a scaricarsi in basso; O₂ in eccesso esce in alto */
    var co2Vent = (state.co2 - AMB.co2) * (0.06 + photo * 0.04) + 0.4;
    var o2Vent = Math.max(0, state.o2 - AMB.o2) * 0.07 + 0.05;
    if (state.co2 > 900) co2Vent *= 1.6;
    if (state.o2 > 22) o2Vent *= 1.5;

    state.co2Vent = co2Vent;
    state.o2Vent = o2Vent;

    /* FOTOSINTESI consuma CO₂ e libera O₂ (lux + CO₂ disponibile) */
    var co2Assim = photo * (4 + co2InF * 6) * clamp(state.co2 / 500, 0.35, 1.4);
    var o2FromPhoto = co2Assim * 0.92;

    /* RESPIRAZIONE cellulare — sempre attiva, depleta O₂ e produce CO₂ */
    var co2FromResp = resp * (1.1 + (1 - photo) * 0.5);
    var o2FromResp = resp * 0.95;

    state.co2 += co2Inject - co2Vent - co2Assim + co2FromResp + (Math.random() - 0.5) * 1.2;
    state.o2 += o2Inject - o2Vent + o2FromPhoto - o2FromResp + (Math.random() - 0.5) * 0.025;
    state.co2 = clamp(state.co2, 280, 2500);
    state.o2 = clamp(state.o2, 16, 24.5);

    /* pH — acido carbonico dal CO₂ disciolto nel substrato umido */
    var phTarget = 6.85 - Math.log10(state.co2 / 400) * 0.42;
    if (state.o2 < 18.5) phTarget -= 0.08;
    state.ph += (phTarget - state.ph) * 0.14 + (Math.random() - 0.5) * 0.008;
    state.ph = clamp(state.ph, 5.0, 8.0);

    /* Temperatura — effetto serra se gas trattenuti; fotosintesi riscalda leggermente */
    var sealed = clamp((state.co2 - AMB.co2) / 800 + (state.o2 - AMB.o2) / 3, 0, 1);
    var tempDelta =
      (AMB.temp - state.temp) * 0.025 +
      photo * 0.12 +
      sealed * 0.09 +
      co2InF * 0.04 -
      (co2Vent + o2Vent) * 0.015 +
      (Math.random() - 0.5) * 0.06;
    state.temp += tempDelta;
    state.temp = clamp(state.temp, 14, 34);

    /* Lux interno — spill dei bozzoli + luce ambiente filtrata dal vetro */
    var cocoonLux = cocoonOutputLux();
    state.lux += (AMB.lux + cocoonLux - state.lux) * 0.1 + (Math.random() - 0.5) * 8;
    state.lux = clamp(state.lux, 30, 1400);

    /* Resistenza bio — conduttività linfatica: scende se pianta attiva, sale con stress gas/pH */
    var co2Stress = clamp((state.co2 - 750) / 600, 0, 1);
    var o2Stress = clamp((19.2 - state.o2) / 2.5, 0, 1);
    var phStress = clamp(Math.abs(state.ph - 6.5) / 1.2, 0, 1);
    var tempStress = clamp(Math.abs(state.temp - 23) / 8, 0, 1);
    var targetR = 11.5 + co2Stress * 9 + o2Stress * 11 + phStress * 7 + tempStress * 4 - photo * 5.5;
    state.bioR += (targetR - state.bioR) * 0.1 + (Math.random() - 0.5) * 0.25;
    state.bioR = clamp(state.bioR, 3.5, 32);

    updatePipes();
    renderCocoons();
    renderReadouts();
    lastBio = state.bioR;
  }

  function cocoonOutputLux() {
    var lv = cocoonLevels();
    return (lv.n + lv.e + lv.s + lv.w) * 180;
  }

  function cocoonLevels() {
    var photo = photosynthesisRate();
    return {
      n: clamp(state.lux / 1100, 0.05, 1),
      e: clamp((state.temp - 16) / 14, 0.05, 1) * 0.55 + clamp((state.o2 - 19) / 4, 0, 1) * 0.45,
      s: clamp((7.2 - state.ph) / 2.2, 0.05, 1) * 0.5 + clamp((state.co2 - 350) / 900, 0, 1) * 0.5,
      w: clamp((28 - state.bioR) / 22, 0.05, 1)
    };
  }

  function renderCocoons() {
    var lv = cocoonLevels();
    var bioDelta = Math.abs(state.bioR - lastBio);
    var sides = {
      n: { h: 155, int: lv.n, strobe: lerp(2200, 380, lv.n), stress: photoStress() },
      e: { h: lerp(195, 28, clamp((state.temp - 16) / 14, 0, 1)), int: lv.e, strobe: lerp(1800, 450, lv.e), stress: clamp((state.o2 - 21.5) / 2, 0, 1) },
      s: { h: lerp(130, 290, clamp((state.ph - 5.5) / 2.5, 0, 1)), int: lv.s, strobe: lerp(2000, 320, clamp(state.co2 / 1200, 0, 1)), stress: clamp((state.co2 - 700) / 800, 0, 1) },
      w: { h: lerp(280, 165, clamp(state.bioR / 28, 0, 1)), int: lv.w, strobe: lerp(1600, 280, lv.w + bioDelta * 8), stress: bioDelta * 4 }
    };

    Object.keys(sides).forEach(function (side) {
      var el = cocoonsEl.querySelector('[data-side="' + side + '"]');
      if (!el) return;
      var cfg = sides[side];
      var st = clamp(cfg.stress, 0, 1);
      el.style.setProperty('--bio-h', String(Math.round(cfg.h)));
      el.style.setProperty('--bio-i', String(cfg.int.toFixed(3)));
      el.style.setProperty('--strobe-ms', String(Math.round(cfg.strobe)) + 'ms');
      el.style.setProperty('--glow-r', String(Math.round(6 + cfg.int * 28)) + 'px');
      el.style.setProperty('--stress', String(st.toFixed(2)));
    });
  }

  function photoStress() {
    return clamp((state.co2 - 600) / 900, 0, 1) * 0.5 + clamp((19.5 - state.o2) / 3, 0, 1) * 0.5;
  }

  function renderReadouts() {
    $('tr-ph').textContent = fmt(state.ph, 2);
    $('tr-temp').textContent = fmt(state.temp, 1) + ' °C';
    $('tr-lux').textContent = Math.round(state.lux) + ' lx';
    $('tr-co2').textContent = Math.round(state.co2) + ' ppm';
    $('tr-o2').textContent = fmt(state.o2, 2) + ' %';
    $('tr-bio').textContent = fmt(state.bioR, 1) + ' kΩ';
    $('tr-readout').textContent =
      'TERRARIO · CO₂ ' + Math.round(state.co2) + ' · O₂ ' + fmt(state.o2, 1) + '% · pH ' + fmt(state.ph, 2);

    if (PLANT_GLOW) {
      var health = photosynthesisRate() * (1 - photoStress());
      PLANT_GLOW.setAttribute('opacity', String(0.12 + health * 0.55));
    }
  }

  bindValve('tr-valve-co2', 'valveCo2', 'tr-valve-co2-knob');
  bindValve('tr-valve-o2', 'valveO2', 'tr-valve-o2-knob');

  $('tr-sim-btn').addEventListener('click', function () {
    simOn = !simOn;
    $('tr-sim-btn').textContent = simOn ? 'SIM: ON' : 'SIM: OFF';
    $('tr-sim-btn').classList.toggle('on', simOn);
  });

  $('tr-pulse-btn').addEventListener('click', function () {
    state.co2 += 180 + Math.random() * 120;
    state.o2 -= 0.6;
    state.temp += 1.8;
    state.ph -= 0.15;
    for (var i = 0; i < 8; i++) simulateStep();
  });

  $('tr-reset-btn').addEventListener('click', function () {
    state.ph = 6.45;
    state.temp = 22.0;
    state.lux = 120;
    state.co2 = 420;
    state.o2 = 20.9;
    state.bioR = 14.2;
    $('tr-valve-co2').value = 20;
    $('tr-valve-o2').value = 15;
    $('tr-valve-co2').dispatchEvent(new Event('input'));
    $('tr-valve-o2').dispatchEvent(new Event('input'));
    renderCocoons();
    renderReadouts();
    updatePipes();
  });

  setInterval(simulateStep, 400);
  simulateStep();
})();
