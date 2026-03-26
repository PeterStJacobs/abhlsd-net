(function (global) {
  const LOCATIONS = [
    {
      key: 'AZ_Phoenix',
      label: 'Phoenix, Arizona',
      timezone: 'America/Phoenix',
      latitude: 33.4484,
      longitude: -112.0740,
      altitudeM: 311,
      supportsAFdS: true,
      supportsMarsVenus: true,
      supportsWeather: true,
      canonicalForTimezone: true,
    },
    {
      key: 'AZ_Scottsdale',
      label: 'Scottsdale, Arizona',
      timezone: 'America/Phoenix',
      latitude: 33.6372,
      longitude: -111.9248,
      altitudeM: 390,
      supportsAFdS: true,
      supportsMarsVenus: true,
      supportsWeather: true,
      canonicalForTimezone: false,
    },
    {
      key: 'QLD_Brisbane',
      label: 'Brisbane, Queensland',
      timezone: 'Australia/Brisbane',
      latitude: -27.4698,
      longitude: 153.0251,
      altitudeM: 27,
      supportsAFdS: true,
      supportsMarsVenus: true,
      supportsWeather: true,
      canonicalForTimezone: true,
    },
    {
      key: 'ET_Toronto',
      label: 'Toronto, Ontario',
      timezone: 'America/Toronto',
      latitude: 43.6532,
      longitude: -79.3832,
      altitudeM: 76,
      supportsAFdS: true,
      supportsMarsVenus: true,
      supportsWeather: true,
      canonicalForTimezone: true,
    },
    {
      key: 'ON_Waterloo',
      label: 'Waterloo, Ontario',
      timezone: 'America/Toronto',
      latitude: 43.4643,
      longitude: -80.5204,
      altitudeM: 329,
      supportsAFdS: true,
      supportsMarsVenus: true,
      supportsWeather: true,
      canonicalForTimezone: false,
    },
    {
      key: 'ON_Kincardine',
      label: 'Kincardine, Ontario',
      timezone: 'America/Toronto',
      latitude: 44.1761,
      longitude: -81.6366,
      altitudeM: 182,
      supportsAFdS: true,
      supportsMarsVenus: true,
      supportsWeather: true,
      canonicalForTimezone: false,
    },
  ];

  const byKey = Object.fromEntries(LOCATIONS.map(loc => [loc.key, loc]));

  function getLocationByKey(key) {
    return byKey[key] || null;
  }

  function getLocations(filterFn) {
    return typeof filterFn === 'function' ? LOCATIONS.filter(filterFn) : [...LOCATIONS];
  }

  function getLocationsFor(featureName) {
    return LOCATIONS.filter(loc => !!loc[featureName]);
  }

  function getLocationsByTimezone(timezone, featureName = null) {
    return LOCATIONS.filter(loc =>
      loc.timezone === timezone && (!featureName || !!loc[featureName])
    );
  }

  function getPrimaryLocationForTimezone(timezone, featureName = null) {
    const matches = getLocationsByTimezone(timezone, featureName);
    return matches.find(loc => loc.canonicalForTimezone) || matches[0] || null;
  }

  function getAllTimezones() {
    try {
      const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
      return Array.isArray(zones) ? [...zones] : [];
    } catch (e) {
      return [];
    }
  }

  function getTimezonesFor(featureName, options = {}) {
    const {
      includeAllIana = false,
      includeUTC = true,
    } = options;

    const curated = getLocationsFor(featureName)
      .map(loc => loc.timezone)
      .filter(Boolean);

    const set = new Set(curated);

    if (includeAllIana) {
      for (const tz of getAllTimezones()) set.add(tz);
    }

    if (includeUTC) set.add('UTC');

    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function getHybridOptionsFor(featureName, options = {}) {
    const {
      includeAllIana = true,
      includeUTC = true,
    } = options;

    const locations = getLocationsFor(featureName);
    const zones = getTimezonesFor(featureName, { includeAllIana, includeUTC });

    return {
      locations: locations.map(loc => ({
        value: `LOC:${loc.key}`,
        label: loc.label,
        location: loc,
      })),
      timezones: zones.map(tz => ({
        value: `TZ:${tz}`,
        label: tz,
        timezone: tz,
      })),
    };
  }

  function resolveSelection(value, featureName = null) {
    const raw = String(value || '').trim();

    if (raw.startsWith('LOC:')) {
      const key = raw.slice(4);
      const location = getLocationByKey(key);
      if (!location) return null;
      if (featureName && !location[featureName]) return null;

      return {
        kind: 'location',
        value: raw,
        key: location.key,
        label: location.label,
        timezone: location.timezone,
        location,
      };
    }

    if (raw.startsWith('TZ:')) {
      const timezone = raw.slice(3);
      return {
        kind: 'timezone',
        value: raw,
        key: null,
        label: timezone,
        timezone,
        location: getPrimaryLocationForTimezone(timezone, featureName),
      };
    }

    return null;
  }

  global.ABHLSD_LOCATIONS = LOCATIONS;
  global.ABHLSD_LOCATION_HELPERS = {
    getLocationByKey,
    getLocations,
    getLocationsFor,
    getLocationsByTimezone,
    getPrimaryLocationForTimezone,
    getAllTimezones,
    getTimezonesFor,
    getHybridOptionsFor,
    resolveSelection,
  };
})(window);
