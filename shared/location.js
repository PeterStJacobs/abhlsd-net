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
    },
    {
      key: 'ON_Waterloo',
      label: 'Waterloo, Ontario',
      timezone: 'America/Toronto',
      latitude: 43.4643,
      longitude: -80.5204,
      altitudeM: 329,
      supportsAFdS: false,
      supportsMarsVenus: true,
      supportsWeather: true,
    },
    {
      key: 'ON_Kincardine',
      label: 'Kincardine, Ontario',
      timezone: 'America/Toronto',
      latitude: 44.1761,
      longitude: -81.6366,
      altitudeM: 182,
      supportsAFdS: false,
      supportsMarsVenus: true,
      supportsWeather: true,
    },
    
    {
      key: 'AZ_Scottsdale',
      label: 'Scottsdale, Arizona',
      timezone: 'America/Phoenix',
      latitude: 33.6372,
      longitude: -111.9248,
      altitudeM: 390,
      supportsAFdS: false,
      supportsMarsVenus: true,
      supportsWeather: true,
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

  global.ABHLSD_LOCATIONS = LOCATIONS;
  global.ABHLSD_LOCATION_HELPERS = {
    getLocationByKey,
    getLocations,
    getLocationsFor,
  };
})(window);
