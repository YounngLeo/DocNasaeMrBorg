/* Terrario bio-clima — sensori · valvole CO₂/O₂ · luci esterne */
(function () {
  var svg = document.getElementById('tr-svg');
  var lightsEl = document.getElementById('tr-ext-lights');
  if (!svg || !lightsEl) return;

  var CO2_PIPE = document.getElementById('tr-pipe-co2');
  var O2_PIPE = document.getElementById('tr-pipe-o2');
  var CO2_VALVE = document.getElementById('tr-valve-co2-knob');
  var O2_VALVE = document.getElementById('tr-valve-o2-knob');
  var PLANT_GLOW = document.getElementById('tr-plant-glow');
  var tickTimer = null;
  var simOn = true;

  var state = {
    ph: 6.4,
    temp: 22.1,
    lux: 380,
    co2: 420,
    o2: 20.8,
    bioR: 14.2,
    valveCo2: 35,
    valveO2: 40
  };

  var ambient = { ph: 6.5, temp: 21.5, lux: 120, co2: 410, o2: 20.9 };

  function $(id) { return document.getElementById(id); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function fmt(n, d) {
    return Number(n).toFixed(d == null ? 1 : d);
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
    var co2Flow = state.valveCo2 / 100;
    var o2Flow = state.valveO2 / 100;
    if (CO2_PIPE) {
      CO2_PIPE.style.strokeDashoffset = String(20 - co2Flow * 18);
      CO2_PIPE.style.opacity = String(0.25 + co2Flow * 0.75);
    }
    if (O2_PIPE) {
      O2_PIPE.style.strokeDashoffset = String(20 - o2Flow * 18);
      O2_PIPE.style.opacity = String(0.25 + o2Flow * 0.75);
    }
  }

  function externalLightLevels() {
    var phT = clamp((state.ph - 5.5) / 2.5, 0, 1);
    var tempT = clamp((state.temp - 16) / 14, 0, 1);
    var luxT = clamp(state.lux / 900, 0, 1);
    var o2T = clamp((state.o2 - 19) / 3, 0, 1);
    var co2T = clamp((state.co2 - 350) / 450, 0, 1);
    var bioT = clamp((25 - state.bioR) / 18, 0, 1);
    return {
      n: luxT * 0.85 + bioT * 0.15,
      e: tempT * 0.7 + o2T * 0.3,
      s: phT * 0.6 + co2T * 0.4,
      w: (1 - phT) * 0.5 + luxT * 0.5
    };
  }

  function phColor(t) {
    return 'hsl(' + Math.round(lerp(280, 120, t)) + ', 72%, 52%)';
  }

  function renderLights() {
    var lv = externalLightLevels();
    var sides = ['n', 'e', 's', 'w'];
    sides.forEach(function (side) {
      var el = lightsEl.querySelector('[data-side="' + side + '"]');
      if (!el) return;
      var intensity = lv[side];
      var hue;
      if (side === 'n') hue = lerp(55, 48, intensity);
      else if (side === 'e') hue = lerp(18, 38, intensity);
      else if (side === 's') hue = lerp(280, 130, intensity);
      else hue = lerp(200, 160, intensity);
      var col = 'hsla(' + hue + ', 88%, 58%, ' + (0.08 + intensity * 0.72) + ')';
      var glow = '0 0 ' + Math.round(8 + intensity * 36) + 'px hsla(' + hue + ', 90%, 55%, ' + (0.2 + intensity * 0.55) + ')';
      el.style.background = col;
      el.style.boxShadow = glow;
      el.style.opacity = String(0.35 + intensity * 0.65);
    });
  }

  function renderReadouts() {
    $('tr-ph').textContent = fmt(state.ph, 2);
    $('tr-temp').textContent = fmt(state.temp, 1) + ' °C';
    $('tr-lux').textContent = Math.round(state.lux) + ' lx';
    $('tr-co2').textContent = Math.round(state.co2) + ' ppm';
    $('tr-o2').textContent = fmt(state.o2, 1) + ' %';
    $('tr-bio').textContent = fmt(state.bioR, 1) + ' kΩ';
    $('tr-readout').textContent =
      'TERRARIO · pH ' + fmt(state.ph, 2) + ' · ' + fmt(state.temp, 1) + '°C · ' + Math.round(state.lux) + ' lx';

    if (PLANT_GLOW) {
      var stress = clamp(Math.abs(state.ph - 6.5) * 0.4 + (state.co2 - 500) / 800, 0, 1);
      PLANT_GLOW.setAttribute('opacity', String(0.15 + (1 - stress) * 0.45));
    }
  }

  function simulateStep() {
    if (!simOn) return;
    var co2In = (state.valveCo2 / 100) * 3.2;
    var o2In = (state.valveO2 / 100) * 2.4;
    var photo = (state.lux / 700) * 1.8;
    var resp = 0.35 + (state.temp - 18) * 0.04;

    state.co2 += co2In - photo * 0.9 - 0.25 + (Math.random() - 0.5) * 0.6;
    state.o2 += o2In + photo * 0.55 - resp * 0.15 + (Math.random() - 0.5) * 0.04;
    state.co2 = clamp(state.co2, 280, 1200);
    state.o2 = clamp(state.o2, 17.5, 23.5);

    state.ph += (ambient.ph - state.ph) * 0.02 - (state.co2 - 400) * 0.00004 + (Math.random() - 0.5) * 0.015;
    state.ph = clamp(state.ph, 5.2, 8.2);

    state.temp += (ambient.temp - state.temp) * 0.015 + co2In * 0.04 + (state.lux / 2000) * 0.08 + (Math.random() - 0.5) * 0.08;
    state.temp = clamp(state.temp, 15, 32);

    var lv = externalLightLevels();
    var extLux = (lv.n + lv.e + lv.s + lv.w) * 220;
    state.lux += (ambient.lux + extLux - state.lux) * 0.08 + (Math.random() - 0.5) * 12;
    state.lux = clamp(state.lux, 40, 980);

    var wet = clamp(1 - (state.temp - 20) * 0.04, 0.3, 1);
    state.bioR += (14.5 - state.bioR) * 0.03 * wet + (state.ph - 6.5) * 0.8 + (Math.random() - 0.5) * 0.35;
    state.bioR = clamp(state.bioR, 4, 28);

    renderLights();
    renderReadouts();
  }

  bindValve('tr-valve-co2', 'valveCo2', 'tr-valve-co2-knob');
  bindValve('tr-valve-o2', 'valveO2', 'tr-valve-o2-knob');

  $('tr-sim-btn').addEventListener('click', function () {
    simOn = !simOn;
    $('tr-sim-btn').textContent = simOn ? 'SIM: ON' : 'SIM: OFF';
    $('tr-sim-btn').classList.toggle('on', simOn);
  });

  $('tr-pulse-btn').addEventListener('click', function () {
    state.co2 += 80 + Math.random() * 60;
    state.temp += 1.2;
    state.bioR -= 2;
    renderLights();
    renderReadouts();
  });

  $('tr-reset-btn').addEventListener('click', function () {
    state.ph = 6.4;
    state.temp = 22.1;
    state.lux = 380;
    state.co2 = 420;
    state.o2 = 20.8;
    state.bioR = 14.2;
    $('tr-valve-co2').value = 35;
    $('tr-valve-o2').value = 40;
    $('tr-valve-co2').dispatchEvent(new Event('input'));
    $('tr-valve-o2').dispatchEvent(new Event('input'));
    renderLights();
    renderReadouts();
  });

  tickTimer = setInterval(simulateStep, 400);
  simulateStep();
  updatePipes();
})();
