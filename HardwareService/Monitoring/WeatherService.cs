using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NexusMonitor.HardwareService.Models;

namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Normalizes four weather providers into one snapshot contract. Provider credentials are
/// supplied by the desktop main process at request time and are never persisted by this service.
/// All local weather times are normalized to the China Standard Time offset (+08:00).
/// </summary>
public sealed class WeatherService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(12) };
    private WeatherSnapshot? _cache;
    private string? _cacheKey;
    private DateTime _cachedAt;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ILogger<WeatherService> _logger;

    public WeatherService(ILogger<WeatherService> logger) => _logger = logger;

    public async Task<WeatherSnapshot?> GetAsync(string location, string source, string? apiKey, CancellationToken ct = default)
    {
        var normalizedLocation = location.Equals("wujiang", StringComparison.OrdinalIgnoreCase) ? "wujiang" : "suzhou";
        var normalizedSource = NormalizeSource(source);
        if (normalizedSource != "open-meteo" && string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Weather source {Source} was selected but has no API key", normalizedSource);
            return null;
        }
        var keyHash = string.IsNullOrWhiteSpace(apiKey) ? "public" : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(apiKey))).Substring(0, 12);
        var cacheKey = $"{normalizedLocation}:{normalizedSource}:{keyHash}";
        if (_cache is not null && DateTime.UtcNow - _cachedAt < TimeSpan.FromMinutes(12) && cacheKey == _cacheKey) return _cache;

        await _gate.WaitAsync(ct);
        try
        {
            if (_cache is not null && DateTime.UtcNow - _cachedAt < TimeSpan.FromMinutes(12) && cacheKey == _cacheKey) return _cache;
            var (name, latitude, longitude) = normalizedLocation == "wujiang"
                ? ("苏州·吴江", 31.16, 120.64)
                : ("苏州", 31.2989, 120.5853);

            WeatherSnapshot? result = normalizedSource switch
            {
                "open-meteo" => await GetOpenMeteoAsync(name, latitude, longitude, ct),
                "qweather" => await GetQWeatherAsync(name, latitude, longitude, apiKey!, ct),
                "weatherapi" => await GetWeatherApiAsync(name, latitude, longitude, apiKey!, ct),
                "openweather" => await GetOpenWeatherAsync(name, latitude, longitude, apiKey!, ct),
                _ => null,
            };
            if (result is not null)
            {
                _cache = result;
                _cacheKey = cacheKey;
                _cachedAt = DateTime.UtcNow;
            }
            return result ?? (cacheKey == _cacheKey ? _cache : null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError("Weather request failed for {Location} using {Source}: {ErrorType}", normalizedLocation, normalizedSource, ex.GetType().Name);
            return cacheKey == _cacheKey ? _cache : null;
        }
        finally { _gate.Release(); }
    }

    private static string NormalizeSource(string? source) => source?.Trim().ToLowerInvariant() switch
    {
        "qweather" => "qweather",
        "weatherapi" => "weatherapi",
        "openweather" => "openweather",
        _ => "open-meteo",
    };

    private static JsonElement P(JsonElement element, string name) => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) ? value : default;
    private static int Length(JsonElement element) => element.ValueKind == JsonValueKind.Array ? element.GetArrayLength() : 0;
    private static JsonElement A(JsonElement element, int index) => element.ValueKind == JsonValueKind.Array && index >= 0 && index < element.GetArrayLength() ? element[index] : default;
    private static double? N(JsonElement element) => element.ValueKind == JsonValueKind.Number && double.IsFinite(element.GetDouble()) ? element.GetDouble() : null;
    private static double? N(JsonElement element, string name) => N(P(element, name));
    // Explicit AQI/pollutant accessor retained as part of the weather contract.
    // Values remain nullable doubles, exactly as defined by WeatherSnapshot.
    private static double? D(JsonElement element, string name) => N(element, name);
    private static int? I(JsonElement element) => element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var value) ? value : null;
    private static int? I(JsonElement element, string name) => I(P(element, name));
    private static string? S(JsonElement element) => element.ValueKind == JsonValueKind.String ? element.GetString() : null;
    private static string? S(JsonElement element, string name) => S(P(element, name));

    private static DateTimeOffset? ParseLocalTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        // ISO timestamps with an explicit offset/Z are already unambiguous.
        if (text.EndsWith('Z') || text.Contains('+') || (text.LastIndexOf('-') > 9 && text.Contains('T')))
            return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var offset) ? offset : null;
        if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var local))
            return null;
        return new DateTimeOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromHours(8));
    }

    private static DateTimeOffset? ParseUnix(JsonElement element)
    {
        var value = I(element);
        if (value is null) return null;
        try { return DateTimeOffset.FromUnixTimeSeconds(value.Value).ToOffset(TimeSpan.FromHours(8)); }
        catch { return null; }
    }

    private static DateTimeOffset? ParseClock(string? date, string? clock)
    {
        if (string.IsNullOrWhiteSpace(date) || string.IsNullOrWhiteSpace(clock)) return null;
        if (!DateTime.TryParse($"{date} {clock}", CultureInfo.GetCultureInfo("en-US"), DateTimeStyles.AllowWhiteSpaces, out var local)) return null;
        return new DateTimeOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromHours(8));
    }

    private static async Task<JsonDocument> FetchAsync(string url, CancellationToken ct)
    {
        using var response = await Http.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
    }

    private static int? MapWeatherApiCode(int? code)
    {
        if (code is null) return null;
        return code.Value switch
        {
            1000 => 0, 1003 => 2, 1006 or 1009 => 3,
            1030 or 1135 or 1147 => 45,
            1063 or 1150 or 1153 or 1168 or 1171 or 1180 or 1183 or 1198 or 1204 => 61,
            1186 or 1189 or 1240 => 80,
            1192 or 1195 or 1201 or 1207 or 1243 or 1246 => 65,
            1066 or 1069 or 1072 or 1114 or 1117 or 1210 or 1213 or 1216 or 1219 or 1222 or 1225 or 1255 or 1258 => 71,
            1087 or 1273 or 1276 or 1279 or 1282 => 95,
            _ when code.Value >= 1273 => 95,
            _ => 3,
        };
    }

    private static int? MapOpenWeatherCode(int? id)
    {
        if (id is null) return null;
        var value = id.Value;
        if (value is >= 200 and < 300) return 95;
        if (value is >= 300 and < 400) return 51;
        if (value is >= 500 and < 600) return value >= 502 ? 65 : 61;
        if (value is >= 600 and < 700) return 71;
        if (value is >= 700 and < 800) return 45;
        if (value == 800) return 0;
        if (value is 801 or 802) return 2;
        return 3;
    }

    private static int? MapQWeatherCode(string? code)
    {
        if (!int.TryParse(code, out var value)) return null;
        if (value == 100) return 0;
        if (value is >= 101 and <= 103) return 2;
        if (value == 104) return 3;
        if (value is >= 200 and <= 213) return 95;
        if (value is >= 300 and <= 399) return value >= 305 ? 65 : 61;
        if (value is >= 400 and <= 499) return 71;
        if (value is >= 500 and <= 515) return 45;
        return 3;
    }

    private async Task<WeatherSnapshot?> GetOpenMeteoAsync(string name, double lat, double lon, CancellationToken ct)
    {
        var coordinates = $"latitude={lat.ToString(CultureInfo.InvariantCulture)}&longitude={lon.ToString(CultureInfo.InvariantCulture)}";
        var weatherUrl = $"https://api.open-meteo.com/v1/forecast?{coordinates}" +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m" +
            "&hourly=temperature_2m,precipitation_probability,weather_code" +
            "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&forecast_days=7&forecast_hours=36&timezone=Asia%2FShanghai";
        var airUrl = $"https://air-quality-api.open-meteo.com/v1/air-quality?{coordinates}&current=pm10,pm2_5,ozone,nitrogen_dioxide,us_aqi&timezone=Asia%2FShanghai";
        var weatherTask = FetchAsync(weatherUrl, ct);
        var airTask = FetchAsync(airUrl, ct);
        using var w = await weatherTask;
        JsonDocument? airDoc = null;
        // Air quality is optional: an AQI failure must not invalidate current weather or forecasts.
        // Preserve caller cancellation, but treat every independent AQI failure as non-fatal.
        try { airDoc = await airTask; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        { _logger.LogWarning("Open-Meteo air-quality request failed for {Location}: {ErrorType}; current weather remains available", name, ex.GetType().Name); }
        using (airDoc)
        {
            var root = w.RootElement;
            var current = P(root, "current");
            var air = airDoc is null ? default : P(airDoc.RootElement, "current");
            var daily = P(root, "daily");
            var dailyTimes = P(daily, "time");
            var maxima = P(daily, "temperature_2m_max");
            var minima = P(daily, "temperature_2m_min");
            var codes = P(daily, "weather_code");
            var rain = P(daily, "precipitation_probability_max");
            var wind = P(daily, "wind_speed_10m_max");
            var sunrise = ParseLocalTime(S(A(P(daily, "sunrise"), 0)));
            var sunset = ParseLocalTime(S(A(P(daily, "sunset"), 0)));
            var currentTime = ParseLocalTime(S(P(current, "time"))) ?? DateTimeOffset.Now;
            // Open-Meteo returns seven calendar days including today; retain the next six future days for the vertical HUD detail card.
            var dailyForecast = new List<WeatherDaySnapshot>(6);
            for (var i = 0; i < 7 && dailyForecast.Count < 6; i++)
            {
                var date = ParseLocalTime(S(A(dailyTimes, i)));
                if (date is null || date.Value.Date <= currentTime.Date) continue;
                dailyForecast.Add(new WeatherDaySnapshot(date.Value, N(A(maxima, i)), N(A(minima, i)), I(A(codes, i)), I(A(rain, i)), N(A(wind, i))));
            }
            var hourly = P(root, "hourly");
            var hours = new List<WeatherHourSnapshot>();
            var times = P(hourly, "time");
            for (var i = 0; i < Length(times) && hours.Count < 6; i++)
            {
                var time = ParseLocalTime(S(A(times, i)));
                if (time is null || time <= currentTime) continue;
                hours.Add(new WeatherHourSnapshot(time.Value, N(A(P(hourly, "temperature_2m"), i)), I(A(P(hourly, "precipitation_probability"), i)), I(A(P(hourly, "weather_code"), i))));
            }
            return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(current, "temperature_2m"), N(current, "apparent_temperature"), N(current, "relative_humidity_2m"), N(current, "wind_speed_10m"), N(current, "wind_direction_10m"), N(current, "precipitation"), I(current, "weather_code"), D(air, "us_aqi"), D(air, "pm2_5"), D(air, "pm10"), D(air, "ozone"), D(air, "nitrogen_dioxide"), "Open-Meteo", N(A(maxima, 0)), N(A(minima, 0)), hours.FirstOrDefault()?.PrecipitationProbability, hours, dailyForecast, sunrise, sunset);
        }
    }

    private async Task<WeatherSnapshot?> GetWeatherApiAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        var url = $"https://api.weatherapi.com/v1/forecast.json?key={Uri.EscapeDataString(apiKey)}&q={lat.ToString(CultureInfo.InvariantCulture)},{lon.ToString(CultureInfo.InvariantCulture)}&days=7&aqi=yes&alerts=no";
        using var doc = await FetchAsync(url, ct);
        var root = doc.RootElement;
        var current = P(root, "current");
        var forecast = P(root, "forecast");
        var daysRoot = P(forecast, "forecastday");
        var currentTime = ParseUnix(P(current, "last_updated_epoch")) ?? DateTimeOffset.Now;
        var currentDay = A(daysRoot, 0);
        var currentDate = S(currentDay, "date");
        var currentAstro = P(currentDay, "astro");
        var sunrise = ParseClock(currentDate, S(currentAstro, "sunrise"));
        var sunset = ParseClock(currentDate, S(currentAstro, "sunset"));
        var hours = new List<WeatherHourSnapshot>();
        for (var d = 0; d < Length(daysRoot) && hours.Count < 6; d++)
        {
            var day = A(daysRoot, d); var dayHours = P(day, "hour");
            for (var h = 0; h < Length(dayHours) && hours.Count < 6; h++)
            {
                var hour = A(dayHours, h);
                var time = ParseUnix(P(hour, "time_epoch")) ?? ParseLocalTime(S(hour, "time"));
                if (time is null || time <= currentTime) continue;
                hours.Add(new WeatherHourSnapshot(time.Value, N(hour, "temp_c"), I(hour, "chance_of_rain"), MapWeatherApiCode(I(P(hour, "condition"), "code"))));
            }
        }
        var daily = new List<WeatherDaySnapshot>();
        for (var d = 1; d < Length(daysRoot) && daily.Count < 6; d++)
        {
            var day = A(daysRoot, d); var values = P(day, "day");
            var date = ParseLocalTime(S(day, "date"));
            if (date is null) continue;
            daily.Add(new WeatherDaySnapshot(date.Value, N(values, "maxtemp_c"), N(values, "mintemp_c"), MapWeatherApiCode(I(P(values, "condition"), "code")), I(values, "daily_chance_of_rain"), N(values, "maxwind_kph")));
        }
        var aqi = P(current, "air_quality");
        var day0 = P(currentDay, "day");
        return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(current, "temp_c"), N(current, "feelslike_c"), N(current, "humidity"), N(current, "wind_kph"), N(current, "wind_degree"), N(current, "precip_mm"), MapWeatherApiCode(I(P(current, "condition"), "code")), null, N(aqi, "pm2_5"), N(aqi, "pm10"), N(aqi, "o3"), N(aqi, "no2"), "WeatherAPI", N(day0, "maxtemp_c"), N(day0, "mintemp_c"), hours.FirstOrDefault()?.PrecipitationProbability, hours, daily, sunrise, sunset);
    }

    private async Task<WeatherSnapshot?> GetOpenWeatherAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        var key = Uri.EscapeDataString(apiKey);
        var weatherUrl = $"https://api.openweathermap.org/data/3.0/onecall?lat={lat.ToString(CultureInfo.InvariantCulture)}&lon={lon.ToString(CultureInfo.InvariantCulture)}&appid={key}&units=metric&lang=zh_cn&exclude=minutely,alerts";
        using var w = await FetchAsync(weatherUrl, ct);
        var root = w.RootElement;
        var current = P(root, "current");
        var now = ParseUnix(P(current, "dt")) ?? DateTimeOffset.Now;
        var hours = new List<WeatherHourSnapshot>();
        var hourly = P(root, "hourly");
        for (var i = 0; i < Length(hourly) && hours.Count < 6; i++)
        {
            var hour = A(hourly, i); var time = ParseUnix(P(hour, "dt"));
            if (time is null || time <= now) continue;
            hours.Add(new WeatherHourSnapshot(time.Value, N(hour, "temp"), N(hour, "pop") is double pop ? (int)Math.Round(pop * 100) : null, MapOpenWeatherCode(I(P(A(P(hour, "weather"), 0), "id")))));
        }
        var days = new List<WeatherDaySnapshot>();
        var daily = P(root, "daily");
        for (var i = 1; i < Length(daily) && days.Count < 6; i++)
        {
            var day = A(daily, i); var temp = P(day, "temp"); var date = ParseUnix(P(day, "dt"));
            if (date is null) continue;
            days.Add(new WeatherDaySnapshot(date.Value, N(temp, "max"), N(temp, "min"), MapOpenWeatherCode(I(P(A(P(day, "weather"), 0), "id"))), N(day, "pop") is double pop ? (int)Math.Round(pop * 100) : null, N(day, "wind_speed") is double wind ? wind * 3.6 : null));
        }
        JsonDocument? airDoc = null;
        // Air quality is optional: an AQI failure must not invalidate current weather or forecasts.
        // Preserve caller cancellation, but treat every independent AQI failure as non-fatal.
        try { airDoc = await FetchAsync($"https://api.openweathermap.org/data/2.5/air_pollution?lat={lat.ToString(CultureInfo.InvariantCulture)}&lon={lon.ToString(CultureInfo.InvariantCulture)}&appid={key}", ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex) { _logger.LogWarning("OpenWeather air-quality request failed for {Location}: {ErrorType}; current weather remains available", name, ex.GetType().Name); }
        using (airDoc)
        {
            var air = airDoc is null ? default : A(P(airDoc.RootElement, "list"), 0);
            var components = P(air, "components");
            return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(current, "temp"), N(current, "feels_like"), N(current, "humidity"), N(current, "wind_speed") is double wind ? wind * 3.6 : null, N(current, "wind_deg"), N(P(current, "rain"), "1h"), MapOpenWeatherCode(I(P(A(P(current, "weather"), 0), "id"))), null, N(components, "pm2_5"), N(components, "pm10"), N(components, "o3"), N(components, "no2"), "OpenWeather", N(P(A(daily, 0), "temp"), "max"), N(P(A(daily, 0), "temp"), "min"), hours.FirstOrDefault()?.PrecipitationProbability, hours, days, ParseUnix(P(current, "sunrise")), ParseUnix(P(current, "sunset")));
        }
    }

    private async Task<WeatherSnapshot?> GetQWeatherAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        var key = Uri.EscapeDataString(apiKey);
        var location = $"{lon.ToString(CultureInfo.InvariantCulture)},{lat.ToString(CultureInfo.InvariantCulture)}";
        var root = "https://devapi.qweather.com/v7";
        var nowTask = FetchAsync($"{root}/weather/now?location={location}&key={key}", ct);
        var hourlyTask = FetchAsync($"{root}/weather/24h?location={location}&key={key}", ct);
        var dailyTask = FetchAsync($"{root}/weather/7d?location={location}&key={key}", ct);
        using var nDoc = await nowTask;
        using var hDoc = await hourlyTask;
        using var dDoc = await dailyTask;
        var now = P(nDoc.RootElement, "now");
        var hoursRoot = P(hDoc.RootElement, "hourly");
        var dailyRoot = P(dDoc.RootElement, "daily");
        var currentTime = ParseLocalTime(S(now, "obsTime")) ?? DateTimeOffset.Now;
        var hours = new List<WeatherHourSnapshot>();
        for (var i = 0; i < Length(hoursRoot) && hours.Count < 6; i++)
        {
            var hour = A(hoursRoot, i); var time = ParseLocalTime(S(hour, "fxTime"));
            if (time is null || time <= currentTime) continue;
            hours.Add(new WeatherHourSnapshot(time.Value, N(hour, "temp"), int.TryParse(S(hour, "pop"), out var pop) ? pop : null, MapQWeatherCode(S(hour, "icon"))));
        }
        var days = new List<WeatherDaySnapshot>();
        for (var i = 1; i < Length(dailyRoot) && days.Count < 6; i++)
        {
            var day = A(dailyRoot, i); var date = ParseLocalTime(S(day, "fxDate"));
            if (date is null) continue;
            days.Add(new WeatherDaySnapshot(date.Value, N(day, "tempMax"), N(day, "tempMin"), MapQWeatherCode(S(day, "iconDay")), int.TryParse(S(day, "precip"), out var pop) ? (int?)pop : null, N(day, "windSpeedDay")));
        }
        var day0 = A(dailyRoot, 0);
        var sunrise = ParseClock(S(day0, "fxDate"), S(day0, "sunrise"));
        var sunset = ParseClock(S(day0, "fxDate"), S(day0, "sunset"));
        // QWeather's legacy /v7/air/now endpoint was discontinued in 2026.
        // Keep weather forecasts available; AQI/pollutants remain null until its
        // newer JWT-authenticated Air Quality v1 API is configured separately.
        double? windSpeed = double.TryParse(S(now, "windSpeed"), NumberStyles.Float, CultureInfo.InvariantCulture, out var speed) ? speed : N(now, "windSpeed");
        return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(now, "temp"), N(now, "feelsLike"), double.TryParse(S(now, "humidity"), NumberStyles.Float, CultureInfo.InvariantCulture, out var humidity) ? humidity : N(now, "humidity"), windSpeed, double.TryParse(S(now, "wind360"), NumberStyles.Float, CultureInfo.InvariantCulture, out var direction) ? direction : N(now, "wind360"), null, MapQWeatherCode(S(now, "icon")), null, null, null, null, null, "QWeather", N(day0, "tempMax"), N(day0, "tempMin"), hours.FirstOrDefault()?.PrecipitationProbability, hours, days, sunrise, sunset);
    }
}
