(function(){
  const $ = (id) => document.getElementById(id);
  const setErr = (msg) => {
    const el = $('err');
    if (el) el.textContent = msg || '';
  };

  const AU_KM = 149597870.7;

  const CLR_MIN = '#3bd16f';
  const CLR_MAX = '#ff7272';
  const CLR_NOW = '#6aa7ff';
  const CLR_MIN_DIST = '#1e8f5a';
  const CLR_MAX_DIST = '#b22222';
  const CLR_TIME_EARLY = '#6aa7ff';
  const CLR_TIME_LATE = '#ff86c8';

  let observer = null;
  let observerTz = null;
  let observerTzLabel = '';
  let lastMarkers = null;

  const pad = (n, w = 2) => String(n).padStart(w, '0');

  function fmtRA(hours){
    const s = hours * 3600;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${pad(h)}h ${pad(m)}m ${sec.toFixed(2)}s`;
  }

  function fmtDec(deg){
    const sign = deg < 0 ? '-' : '+';
    const d = Math.abs(deg);
    const D = Math.floor(d);
    const M = Math.floor((d - D) * 60);
    const S = (d - D - M / 60) * 3600;
    return `${sign}${pad(D)} deg ${pad(M)} min ${S.toFixed(1)} sec`;
  }

  function fmtAngleDMS(deg){
    const d = Math.abs(deg);
    const D = Math.floor(d);
    const M = Math.floor((d - D) * 60);
    const S = (d - D - M / 60) * 3600;
    return `${D} deg ${M} min ${S.toFixed(1)} sec`;
  }

  function fmtAU(au){
    return au.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) + ' AU';
  }

  function fmtKM(km){
    return km.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';
  }

  function fmtInTz(iso, tz){
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: tz,
      timeZoneName: 'short'
    }).replace(',', '');
  }

  function setNow(){
    const dt = $('dt');
    const now = new Date();
    const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dt.value = isoLocal;
  }

  function setLegendTime(){
    $('legend-time').innerHTML =
      'Angle: <span class="min">Min</span>, <span class="max">Max</span> &nbsp;|&nbsp; ' +
      'Distance: <span class="min-dist">Min</span>, <span class="max-dist">Max</span> &nbsp;|&nbsp; ' +
      '<span class="now">Current Time</span>';
  }

  function setLegendScatter(){
    const gradientOn = $('chk-time-gradient')?.checked;
    $('legend-scatter').innerHTML =
      '<span class="swatch sw-path"></span> Path (time order)' +
      (gradientOn
        ? ' &nbsp;→ colored by time: <span class="swatch sw-grad-a"></span> early to <span class="swatch sw-grad-b"></span> late'
        : ' (solid blue)') +
      ' &nbsp;|&nbsp; arrows show forward time (if enabled)' +
      ' &nbsp;|&nbsp; markers: ' +
      '<span class="swatch sw-now"></span> current time, ' +
      '<span class="swatch sw-min"></span> min angle, ' +
      '<span class="swatch sw-max"></span> max angle, ' +
      '<span class="swatch sw-mind"></span> min distance, ' +
      '<span class="swatch sw-maxd"></span> max distance';
  }

  function tickPartsInZone(ms, tz){
    const d = new Date(ms);
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = fmt.formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return [`${get('year')}-${get('month')}-${get('day')}`, `${get('hour')}:${get('minute')}`];
  }

  function useObserverTz(){
    return $('chk-use-obs-tz')?.checked;
  }

  function tickPartsForMode(ms){
    const tz = useObserverTz()
      ? (observerTz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
      : 'UTC';
    return tickPartsInZone(ms, tz);
  }

  function updateObserverFromInputs(){
    try {
      const lat = parseFloat($('lat').value);
      const lon = parseFloat($('lon').value);
      let elev = parseFloat($('elev').value);
      if (!Number.isFinite(elev)) elev = 0;
      observer = new Astronomy.Observer(lat, lon, elev);
    } catch (e) {
      setErr('Invalid observer values: ' + e.message);
    }
  }

  function setObserverTimezoneFromInput(){
    observerTz = $('tz')?.value?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    observerTzLabel = observerTz;
  }

  function setInputsFromPreset(locationKey){
    if (locationKey === 'custom') return;

    const loc = window.ABHLSD_LOCATION_HELPERS?.getLocationByKey(locationKey);
    if (!loc) return;

    $('lat').value = loc.latitude ?? '';
    $('lon').value = loc.longitude ?? '';
    $('elev').value = Number.isFinite(loc.altitudeM) ? loc.altitudeM : '';
    $('tz').value = loc.timezone || '';

    updateObserverFromInputs();
    setObserverTimezoneFromInput();
    compute();
  }

  function buildPresetOptions(){
    const select = $('preset');
    if (!select) return;

    const options = window.ABHLSD_LOCATION_HELPERS?.getLocationsFor('supportsMarsVenus') || [];
    select.innerHTML = '';

    for (const loc of options) {
      const opt = document.createElement('option');
      opt.value = loc.key;
      const elevText = Number.isFinite(loc.altitudeM) ? `${loc.altitudeM} m` : 'elev ?';
      opt.textContent = `${loc.label} (${loc.latitude}, ${loc.longitude}, ${elevText})`;
      select.appendChild(opt);
    }

    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom (use fields below)';
    select.appendChild(custom);
  }

  function buildTimezoneDatalist(){
    const list = $('tzlist');
    if (!list) return;

    const zones = window.ABHLSD_LOCATION_HELPERS?.getTimezonesFor('supportsMarsVenus', {
      includeAllIana: false,
      includeUTC: true,
    }) || [];

    list.innerHTML = '';
    for (const zone of zones) {
      const opt = document.createElement('option');
      opt.value = zone;
      list.appendChild(opt);
    }
  }

  function vecToRaDec(v){
    const rxy = Math.hypot(v.x, v.y);
    let ra = Math.atan2(v.y, v.x);
    if (ra < 0) ra += 2 * Math.PI;
    const dec = Math.atan2(v.z, rxy);
    return { raHours: ra * 12 / Math.PI, decDeg: dec * 180 / Math.PI };
  }

  function angleFromRaDec(ra1h, dec1d, ra2h, dec2d){
    const ra1 = ra1h * Math.PI / 12;
    const ra2 = ra2h * Math.PI / 12;
    const d1 = dec1d * Math.PI / 180;
    const d2 = dec2d * Math.PI / 180;

    const x1 = Math.cos(d1) * Math.cos(ra1);
    const y1 = Math.cos(d1) * Math.sin(ra1);
    const z1 = Math.sin(d1);
    const x2 = Math.cos(d2) * Math.cos(ra2);
    const y2 = Math.cos(d2) * Math.sin(ra2);
    const z2 = Math.sin(d2);

    const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
    return Math.acos(dot) * 180 / Math.PI;
  }

  function angleAtTime(t, useTopocentric){
    const A = window.Astronomy;
    if (!useTopocentric) {
      const gvM = A.GeoVector(A.Body.Mars, t, true);
      const gvV = A.GeoVector(A.Body.Venus, t, true);
      return A.AngleBetween(gvM, gvV);
    }

    const eqM = A.Equator(A.Body.Mars, t, observer, true, true);
    const eqV = A.Equator(A.Body.Venus, t, observer, true, true);
    return angleFromRaDec(eqM.ra, eqM.dec, eqV.ra, eqV.dec);
  }

  function distanceAtTime(t){
    const A = window.Astronomy;
    const hvM = A.HelioVector(A.Body.Mars, t);
    const hvV = A.HelioVector(A.Body.Venus, t);
    return Math.hypot(hvM.x - hvV.x, hvM.y - hvV.y, hvM.z - hvV.z);
  }

  function compute(){
    setErr('');
    if (typeof window.Astronomy === 'undefined') {
      setErr('astronomy-engine library did not load.');
      return;
    }
    if (!observer) updateObserverFromInputs();

    const A = window.Astronomy;
    const useTopo = $('chk-topo').checked;
    const dtInput = $('dt').value;
    const date = dtInput ? new Date(dtInput) : new Date();
    const t = new A.AstroTime(date);

    const angDeg = angleAtTime(t, useTopo);
    const gvM = A.GeoVector(A.Body.Mars, t, true);
    const gvV = A.GeoVector(A.Body.Venus, t, true);
    const m = vecToRaDec(gvM);
    const v = vecToRaDec(gvV);
    const dAU = distanceAtTime(t);
    const dKM = dAU * AU_KM;

    let horM = null;
    let horV = null;
    try {
      const eqMars = A.Equator(A.Body.Mars, t, observer, true, true);
      const eqVenus = A.Equator(A.Body.Venus, t, observer, true, true);
      horM = A.Horizon(t, observer, eqMars.ra, eqMars.dec, 'normal');
      horV = A.Horizon(t, observer, eqVenus.ra, eqVenus.dec, 'normal');
    } catch (_e) {
      // Ignore horizon failures.
    }

    $('angle').textContent = fmtAngleDMS(angDeg);
    $('angle-sub').textContent = angDeg.toFixed(6) + ' deg (' + (useTopo ? 'topocentric' : 'geocentric') + ')';
    $('dist-au').textContent = fmtAU(dAU);
    $('dist-km').textContent = fmtKM(dKM);
    $('mars-radec').textContent = 'RA ' + fmtRA(m.raHours) + ',  Dec ' + fmtDec(m.decDeg);
    $('venus-radec').textContent = 'RA ' + fmtRA(v.raHours) + ', Dec ' + fmtDec(v.decDeg);

    const hvM = A.HelioVector(A.Body.Mars, t);
    const hvV = A.HelioVector(A.Body.Venus, t);
    $('mars-xyz').textContent = 'Heliocentric: x=' + hvM.x.toFixed(6) + ', y=' + hvM.y.toFixed(6) + ', z=' + hvM.z.toFixed(6) + ' AU';
    $('venus-xyz').textContent = 'Heliocentric: x=' + hvV.x.toFixed(6) + ', y=' + hvV.y.toFixed(6) + ', z=' + hvV.z.toFixed(6) + ' AU';

    $('mars-horiz').textContent = horM
      ? 'Topocentric Alt=' + horM.altitude.toFixed(1) + ' deg, Az=' + horM.azimuth.toFixed(1) + ' deg'
      : 'Topocentric Alt/Az unavailable.';
    $('venus-horiz').textContent = horV
      ? 'Topocentric Alt=' + horV.altitude.toFixed(1) + ' deg, Az=' + horV.azimuth.toFixed(1) + ' deg'
      : 'Topocentric Alt/Az unavailable.';
  }

  async function scanExtrema(centerDate, days, stepHours, useTopo){
    const A = window.Astronomy;
    let bestMinA = { t: null, val: Infinity };
    let bestMaxA = { t: null, val: -Infinity };
    let bestMinD = { t: null, val: Infinity };
    let bestMaxD = { t: null, val: -Infinity };

    for (let h = -days * 24; h <= days * 24; h += stepHours) {
      const t = new A.AstroTime(new Date(centerDate.getTime() + h * 3600 * 1000));
      const a = angleAtTime(t, useTopo);
      const d = distanceAtTime(t);
      if (a < bestMinA.val) bestMinA = { t, val: a };
      if (a > bestMaxA.val) bestMaxA = { t, val: a };
      if (d < bestMinD.val) bestMinD = { t, val: d };
      if (d > bestMaxD.val) bestMaxD = { t, val: d };
    }

    async function refine(t0, mode, fn){
      let center = t0.date.getTime();
      const steps = [3600e3, 600e3, 60e3, 10e3];
      for (const step of steps) {
        let best = { t: center, val: mode === 'min' ? Infinity : -Infinity };
        for (let k = -5; k <= 5; k++) {
          const tt = center + k * step;
          const val = fn(new A.AstroTime(new Date(tt)));
          if ((mode === 'min' && val < best.val) || (mode === 'max' && val > best.val)) {
            best = { t: tt, val };
          }
        }
        center = best.t;
      }
      return new A.AstroTime(new Date(center));
    }

    const minAT = await refine(bestMinA.t, 'min', (tt) => angleAtTime(tt, useTopo));
    const maxAT = await refine(bestMaxA.t, 'max', (tt) => angleAtTime(tt, useTopo));
    const minDT = await refine(bestMinD.t, 'min', (tt) => distanceAtTime(tt));
    const maxDT = await refine(bestMaxD.t, 'max', (tt) => distanceAtTime(tt));

    return {
      minAngle: { time: minAT.date.toISOString(), deg: angleAtTime(minAT, useTopo) },
      maxAngle: { time: maxAT.date.toISOString(), deg: angleAtTime(maxAT, useTopo) },
      minDistance: { time: minDT.date.toISOString(), au: distanceAtTime(minDT), km: distanceAtTime(minDT) * AU_KM },
      maxDistance: { time: maxDT.date.toISOString(), au: distanceAtTime(maxDT), km: distanceAtTime(maxDT) * AU_KM },
    };
  }

  function collectSeries(centerDate, days, stepHours, useTopo){
    const A = window.Astronomy;
    const xs = [];
    const angle = [];
    const dist = [];

    for (let h = -days * 24; h <= days * 24; h += stepHours) {
      const d = new Date(centerDate.getTime() + h * 3600 * 1000);
      const t = new A.AstroTime(d);
      xs.push(d.getTime());
      angle.push(angleAtTime(t, useTopo));
      dist.push(distanceAtTime(t));
    }

    return { xs, angle, dist };
  }

  function plotSeries(canvas, xs, ys, yLabel, markers){
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const P_LEFT = 48;
    const P_RIGHT = 16;
    const P_TOP = 20;
    const P_BOTTOM = 72;
    const x0 = P_LEFT;
    const y0 = H - P_BOTTOM;
    const x1 = W - P_RIGHT;
    const y1 = P_TOP;

    ctx.strokeStyle = '#3a4367';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.stroke();

    ctx.fillStyle = '#9aa3c7';
    ctx.font = '12px system-ui,-apple-system,Segoe UI,Roboto,Arial';
    ctx.fillText(yLabel, x0, y1 - 6);

    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs);
    const ymin = Math.min(...ys);
    const ymax = Math.max(...ys);
    const xr = xmax - xmin || 1;
    const yr = ymax - ymin || 1;
    const xmap = (x) => x0 + (x - xmin) / xr * (x1 - x0);
    const ymap = (y) => y0 - (y - ymin) / yr * (y0 - y1);

    ctx.strokeStyle = '#25304f';
    ctx.setLineDash([3, 3]);
    for (let i = 1; i <= 4; i++) {
      const yy = y0 - i * (y0 - y1) / 5;
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = '#7aa2ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ys.forEach((y, i) => {
      const xx = xmap(xs[i]);
      const yy = ymap(y);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    if (markers?.length) {
      markers.forEach((m) => {
        if (m.t < xmin || m.t > xmax) return;
        const xx = xmap(m.t);
        ctx.save();
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xx, y0);
        ctx.lineTo(xx, y1);
        ctx.stroke();
        ctx.restore();
      });
    }

    const px = x1 - x0;
    const tickCount = Math.min(10, Math.max(4, Math.floor(px / 110)));
    ctx.fillStyle = '#9aa3c7';
    ctx.font = '12px system-ui,-apple-system,Segoe UI,Roboto,Arial';
    for (let i = 0; i <= tickCount; i++) {
      const t = xmin + i * (xr / tickCount);
      const xx = xmap(t);
      ctx.strokeStyle = '#3a4367';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx, y0 + 4);
      ctx.stroke();
      const parts = tickPartsForMode(t);
      ctx.save();
      ctx.translate(xx, y0 + 6);
      ctx.rotate(-Math.PI / 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(parts[0], 0, 0);
      ctx.fillText(parts[1], 0, 14);
      ctx.restore();
    }

    ctx.fillText(ymin.toFixed(3), x1 - 60, y0 + 16);
    ctx.fillText(ymax.toFixed(3), x1 - 60, y1 - 4);
  }

  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : { r: 122, g: 162, b: 255 };
  }

  function rgbToHex(r, g, b){
    return '#' + [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('');
  }

  function blend(c1, c2, t){
    const a = hexToRgb(c1);
    const b = hexToRgb(c2);
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }

  function drawArrowhead(ctx, x, y, ang, size, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size * 0.6);
    ctx.lineTo(-size, -size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

   function plotAngleVsDistance(canvas, dists, angles, markersPts, opts){
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const P_LEFT = 64;
    const P_RIGHT = 16;
    const P_TOP = 20;
    const P_BOTTOM = 50;
    const x0 = P_LEFT;
    const y0 = H - P_BOTTOM;
    const x1 = W - P_RIGHT;
    const y1 = P_TOP;

    ctx.strokeStyle = '#3a4367';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.stroke();

    ctx.fillStyle = '#9aa3c7';
    ctx.font = '12px system-ui,-apple-system,Segoe UI,Roboto,Arial';
    ctx.fillText('Distance (AU)', (x0 + x1) / 2 - 40, y0 + 32);
    ctx.save();
    ctx.translate(x0 - 42, (y0 + y1) / 2 + 24);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Angle (deg)', 0, 0);
    ctx.restore();

    const xmin = Math.min(...dists);
    const xmax = Math.max(...dists);
    const ymin = Math.min(...angles);
    const ymax = Math.max(...angles);
    const xr = xmax - xmin || 1;
    const yr = ymax - ymin || 1;
    const padX = xr * 0.04;
    const padY = yr * 0.08;
    const minX = xmin - padX;
    const maxX = xmax + padX;
    const minY = ymin - padY;
    const maxY = ymax + padY;
    const xmap = (x) => x0 + (x - minX) / (maxX - minX) * (x1 - x0);
    const ymap = (y) => y0 - (y - minY) / (maxY - minY) * (y0 - y1);

    ctx.strokeStyle = '#25304f';
    ctx.setLineDash([3, 3]);
    for (let i = 1; i <= 4; i++) {
      const yy = y0 - i * (y0 - y1) / 5;
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
    }
    for (let i = 1; i <= 4; i++) {
      const xx = x0 + i * (x1 - x0) / 5;
      ctx.beginPath();
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx, y1);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const useGradient = !!opts?.gradient;
    const showArrows = !!opts?.arrows;

    if (!useGradient) {
      ctx.strokeStyle = '#7aa2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < dists.length; i++) {
        const xx = xmap(dists[i]);
        const yy = ymap(angles[i]);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    } else {
      ctx.lineWidth = 2;
      for (let i = 1; i < dists.length; i++) {
        const t = i / (dists.length - 1);
        ctx.strokeStyle = blend(CLR_TIME_EARLY, CLR_TIME_LATE, t);
        ctx.beginPath();
        ctx.moveTo(xmap(dists[i - 1]), ymap(angles[i - 1]));
        ctx.lineTo(xmap(dists[i]), ymap(angles[i]));
        ctx.stroke();
      }
    }

    ctx.fillStyle = useGradient ? '#e8ecff33' : '#7aa2ff';
    for (let i = 0; i < dists.length; i++) {
      const xx = xmap(dists[i]);
      const yy = ymap(angles[i]);
      ctx.beginPath();
      ctx.arc(xx, yy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (showArrows && dists.length > 1) {
      const approx = 120;
      let acc = 0;
      for (let i = 1; i < dists.length; i++) {
        const xA = xmap(dists[i - 1]);
        const yA = ymap(angles[i - 1]);
        const xB = xmap(dists[i]);
        const yB = ymap(angles[i]);
        const dx = xB - xA;
        const dy = yB - yA;
        const len = Math.hypot(dx, dy);
        acc += len;
        if (acc >= approx) {
          acc = 0;
          const ang = Math.atan2(dy, dx);
          const col = useGradient ? blend(CLR_TIME_EARLY, CLR_TIME_LATE, i / (dists.length - 1)) : '#7aa2ff';
          drawArrowhead(ctx, xB, yB, ang, 8, col);
        }
      }
    }

    if (markersPts?.length) {
      markersPts.forEach((m) => {
        const xx = xmap(m.x);
        const yy = ymap(m.y);
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = m.color;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(xx, yy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }

    ctx.fillStyle = '#9aa3c7';
    ctx.fillText(minX.toFixed(3), x0, y0 + 16);
    ctx.fillText(maxX.toFixed(3), x1 - 50, y0 + 16);
    ctx.fillText(minY.toFixed(3), x1 - 60, y0 + 16);
    ctx.fillText(maxY.toFixed(3), x1 - 60, y1 - 4);
  }

  function markerPointsForScatter(useTopo){
    const pts = [];
    const dtInput = $('dt').value;
    const center = dtInput ? new Date(dtInput) : new Date();
    const ttNow = new Astronomy.AstroTime(center);
    pts.push({ x: distanceAtTime(ttNow), y: angleAtTime(ttNow, useTopo), color: CLR_NOW });

    if (lastMarkers) {
      [
        { t: lastMarkers.minAngleT, color: CLR_MIN },
        { t: lastMarkers.maxAngleT, color: CLR_MAX },
        { t: lastMarkers.minDistT, color: CLR_MIN_DIST },
        { t: lastMarkers.maxDistT, color: CLR_MAX_DIST },
      ].forEach((obj) => {
        const tt = new Astronomy.AstroTime(new Date(obj.t));
        pts.push({ x: distanceAtTime(tt), y: angleAtTime(tt, useTopo), color: obj.color });
      });
    }

    return pts;
  }

  function currentScatterOpts(){
    return {
      arrows: $('chk-time-arrows')?.checked,
      gradient: $('chk-time-gradient')?.checked,
    };
  }

  function replotAll(){
    const days = Math.max(1, parseInt($('scan-days').value, 10) || 30);
    const step = Math.max(1, parseInt($('scan-step').value, 10) || 6);
    const dtInput = $('dt').value;
    const center = dtInput ? new Date(dtInput) : new Date();
    const useTopo = $('chk-topo').checked;
    const s = collectSeries(center, days, step, useTopo);

    const markers = [
      { t: center.getTime(), color: CLR_NOW },
      ...(lastMarkers
        ? [
            { t: lastMarkers.minAngleT, color: CLR_MIN },
            { t: lastMarkers.maxAngleT, color: CLR_MAX },
            { t: lastMarkers.minDistT, color: CLR_MIN_DIST },
            { t: lastMarkers.maxDistT, color: CLR_MAX_DIST },
          ]
        : []),
    ];

    plotSeries($('chart-angle'), s.xs, s.angle, 'Angular separation (deg) ' + (useTopo ? '(topocentric)' : '(geocentric)'), markers);
    plotSeries($('chart-dist'), s.xs, s.dist, 'Distance (AU)', markers);
    plotAngleVsDistance($('chart-angle-dist'), s.dist, s.angle, markerPointsForScatter(useTopo), currentScatterOpts());
    setLegendTime();
    setLegendScatter();
  }

  async function fetchElevationForInputs(silent = false){
    if (!silent) setErr('');

    const lat = parseFloat($('lat').value);
    const lon = parseFloat($('lon').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (!silent) setErr('Please enter valid latitude and longitude first.');
      return;
    }

    const btn = $('btn-fetch-elev');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Fetching...';

    try {
      const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      let elev = null;
      if (data && Array.isArray(data.elevation) && data.elevation.length > 0) elev = data.elevation[0];
      else if (typeof data.elevation === 'number') elev = data.elevation;
      if (elev == null || !Number.isFinite(elev)) throw new Error('No elevation in response');

      $('elev').value = Math.round(elev);
      updateObserverFromInputs();
      compute();
    } catch (e) {
      if (!silent) setErr('Elevation lookup failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  async function useCurrentLocation(){
    if (!navigator.geolocation) {
      compute();
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      $('lat').value = (+latitude).toFixed(6);
      $('lon').value = (+longitude).toFixed(6);
      $('tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setObserverTimezoneFromInput();
      await fetchElevationForInputs(true);
      updateObserverFromInputs();
      compute();
    }, () => {
      $('tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setObserverTimezoneFromInput();
      compute();
    });
  }

  function saveCanvasAsPng(canvas, filename){
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadText(filename, text){
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

   document.addEventListener('DOMContentLoaded', () => {
    const back = $('backLink');
    if (back) back.href = (location.protocol === 'file:') ? '../index.html' : '/';

    if (typeof window.Astronomy === 'undefined') {
      setErr('astronomy-engine library did not load.');
    }

    buildPresetOptions();
    buildTimezoneDatalist();
    setInputsFromPreset('QLD_Brisbane');
    $('preset').value = 'QLD_Brisbane';
    setNow();
    setLegendTime();
    setLegendScatter();

    $('preset').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') return;
      setInputsFromPreset(val);
    });

    $('btn-update-observer').addEventListener('click', () => {
      updateObserverFromInputs();
      setObserverTimezoneFromInput();
      compute();
    });

    $('btn-fetch-elev').addEventListener('click', () => fetchElevationForInputs(false));
    $('btn-my-location').addEventListener('click', useCurrentLocation);
    $('btn-now').addEventListener('click', () => { setNow(); compute(); });
    $('btn-calc').addEventListener('click', compute);
    $('chk-topo').addEventListener('change', compute);
    $('tz').addEventListener('change', () => { setObserverTimezoneFromInput(); replotAll(); });
    $('chk-use-obs-tz').addEventListener('change', replotAll);

    ['chk-time-arrows', 'chk-time-gradient'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('change', () => { replotAll(); setLegendScatter(); });
    });

    $('btn-scan').addEventListener('click', async () => {
      setErr('');
      const days = Math.max(1, parseInt($('scan-days').value, 10) || 30);
      const step = Math.max(1, parseInt($('scan-step').value, 10) || 6);
      const dtInput = $('dt').value;
      const center = dtInput ? new Date(dtInput) : new Date();
      const useTopo = $('chk-topo').checked;
      const res = await scanExtrema(center, days, step, useTopo);

      lastMarkers = {
        minAngleT: Date.parse(res.minAngle.time),
        maxAngleT: Date.parse(res.maxAngle.time),
        minDistT: Date.parse(res.minDistance.time),
        maxDistT: Date.parse(res.maxDistance.time),
      };

      if (!observerTz) setObserverTimezoneFromInput();
      const preferLocal = $('chk-use-obs-tz')?.checked;
      const wrap = (label, content) => preferLocal === (label === 'local') ? ('<strong>' + content + '</strong>') : content;

      $('scan-results').innerHTML =
        '<span class="min-line">Closest (min) angular separation: ' + res.minAngle.deg.toFixed(6) + ' deg</span><br/>' +
        '• ' + wrap('utc', 'UTC: ' + res.minAngle.time) + '<br/>' +
        '• ' + wrap('local', 'Local (' + (observerTzLabel || '') + '): ' + fmtInTz(res.minAngle.time, observerTz)) + '<br/>' +
        '<span class="max-line">Greatest (max) angular separation: ' + res.maxAngle.deg.toFixed(6) + ' deg</span><br/>' +
        '• ' + wrap('utc', 'UTC: ' + res.maxAngle.time) + '<br/>' +
        '• ' + wrap('local', 'Local (' + (observerTzLabel || '') + '): ' + fmtInTz(res.maxAngle.time, observerTz)) + '<br/>' +
        '<span class="min-dist-line">Closest (min) distance: ' + res.minDistance.au.toFixed(6) + ' AU (' + res.minDistance.km.toLocaleString() + ' km)</span><br/>' +
        '• ' + wrap('utc', 'UTC: ' + res.minDistance.time) + '<br/>' +
        '• ' + wrap('local', 'Local (' + (observerTzLabel || '') + '): ' + fmtInTz(res.minDistance.time, observerTz)) + '<br/>' +
        '<span class="max-dist-line">Greatest (max) distance: ' + res.maxDistance.au.toFixed(6) + ' AU (' + res.maxDistance.km.toLocaleString() + ' km)</span><br/>' +
        '• ' + wrap('utc', 'UTC: ' + res.maxDistance.time) + '<br/>' +
        '• ' + wrap('local', 'Local (' + (observerTzLabel || '') + '): ' + fmtInTz(res.maxDistance.time, observerTz)) + '<br/>' +
        '(Times refined to about 10 seconds. Chart tick labels follow the timezone toggle.)';

      replotAll();
    });

    $('btn-plot').addEventListener('click', () => {
      setErr('');
      replotAll();
    });

    $('btn-save-png').addEventListener('click', () => {
      replotAll();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveCanvasAsPng($('chart-angle'), 'angle_' + stamp + '.png');
      saveCanvasAsPng($('chart-dist'), 'distance_' + stamp + '.png');
      saveCanvasAsPng($('chart-angle-dist'), 'angle_vs_distance_' + stamp + '.png');
    });

    $('btn-download-csv').addEventListener('click', () => {
      const days = Math.max(1, parseInt($('scan-days').value, 10) || 30);
      const step = Math.max(1, parseInt($('scan-step').value, 10) || 6);
      const dtInput = $('dt').value;
      const center = dtInput ? new Date(dtInput) : new Date();
      const useTopo = $('chk-topo').checked;
      const s = collectSeries(center, days, step, useTopo);

      let csv = 'time_iso,angle_deg(' + (useTopo ? 'topocentric' : 'geocentric') + '),distance_au,distance_km\n';
      for (let i = 0; i < s.xs.length; i++) {
        const iso = new Date(s.xs[i]).toISOString();
        const ang = s.angle[i];
        const au = s.dist[i];
        const km = au * AU_KM;
        csv += iso + ',' + ang.toFixed(8) + ',' + au.toFixed(8) + ',' + Math.round(km) + '\n';
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadText('mars_venus_scan_' + stamp + '.csv', csv);
    });

    compute();
  });
})();
