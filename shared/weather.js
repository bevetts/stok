/*
 * Shared weather reader — Solace and Blake's Command Center are the same
 * household, so both read the same `solace_weather` row rather than
 * standing up a second location/provider/sync job.
 */
async function fetchSharedWeather(db) {
  const { data, error } = await db
    .from("solace_weather")
    .select("current_temp, condition, high, low, rain_chance, sunrise, sunset, aqi, aqi_category, forecast_periods")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    currentTemp: data.current_temp,
    condition: data.condition,
    high: data.high,
    low: data.low,
    rainChance: data.rain_chance,
    sunrise: data.sunrise,
    sunset: data.sunset,
    aqi: data.aqi,
    aqiCategory: data.aqi_category,
    forecastPeriods: data.forecast_periods || [],
  };
}
